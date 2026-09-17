// controllers/purchaseController.js (redesigned)
// Supplier -> Purchase (invoice) -> Purchase Items -> Inventory, jaisa roadmap me socha tha.
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { createItemInternal } from './itemController.js';

const { sequelize, Purchase, PurchaseItem, SupplierLedger, Supplier, Item, ProductMaster } = db;

function generatePurchaseNumber() {
  return `PO-${Date.now().toString().slice(-8)}`;
}

export const createPurchase = async (req, res, next) => {
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);

    const { supplier_id, purchase_date, metal_type, gross_weight, tunch_percentage, subtotal_amount, tax_amount, is_jangad } = req.body;

    const supplier = await Supplier.findOne({ where: { id: supplier_id, tenant_id: req.scope.tenant_id } });
    if (!supplier) throw new AppError('Supplier not found', 404);

    const verification_status = is_jangad && !tunch_percentage ? 'PENDING_TUNCH' : 'VERIFIED';
    const pure_weight_24k_equivalent = tunch_percentage
      ? Number(((gross_weight * tunch_percentage) / 100).toFixed(3))
      : null;
    const total_amount = Number(subtotal_amount || 0) + Number(tax_amount || 0);

    const purchase = await Purchase.create({
      tenant_id: req.scope.tenant_id, branch_id, supplier_id, purchase_number: generatePurchaseNumber(),
      purchase_date, metal_type, gross_weight,
      tunch_percentage: tunch_percentage || null,
      pure_weight_24k_equivalent,
      subtotal_amount: subtotal_amount || 0, tax_amount: tax_amount || 0, total_amount,
      verification_status,
      is_jangad: !!is_jangad,
    }, { userId: req.user.id });

    if (verification_status === 'VERIFIED') {
      await applyPurchaseToLedger(purchase);
    }

    res.status(201).json(purchase);
  } catch (err) { next(err); }
};

export const listPurchases = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;
    if (req.query.verification_status) where.verification_status = req.query.verification_status;
    if (req.query.received_into_inventory !== undefined) {
      where.received_into_inventory = req.query.received_into_inventory === 'true';
    }

    const purchases = await Purchase.findAll({ where, include: [Supplier, PurchaseItem], order: [['purchase_date', 'DESC']] });
    res.json(purchases);
  } catch (err) { next(err); }
};

export const verifyTunch = async (req, res, next) => {
  try {
    const { tunch_percentage, subtotal_amount, tax_amount } = req.body;
    const purchase = await Purchase.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!purchase) throw new AppError('Purchase not found', 404);
    if (purchase.verification_status === 'VERIFIED') throw new AppError('Already verified', 409);

    purchase.tunch_percentage = tunch_percentage;
    purchase.pure_weight_24k_equivalent = Number(((purchase.gross_weight * tunch_percentage) / 100).toFixed(3));
    if (subtotal_amount !== undefined) purchase.subtotal_amount = subtotal_amount;
    if (tax_amount !== undefined) purchase.tax_amount = tax_amount;
    purchase.total_amount = Number(purchase.subtotal_amount || 0) + Number(purchase.tax_amount || 0);
    purchase.verification_status = 'VERIFIED';
    await purchase.save({ userId: req.user.id });

    await applyPurchaseToLedger(purchase);

    res.json(purchase);
  } catch (err) { next(err); }
};

// items: [{ product_master_id, mode, location_id, total_pieces, total_gross_weight, total_net_weight, purity, ... }]
export const receiveIntoInventory = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const purchase = await Purchase.findOne({
      where: { id: req.params.id, tenant_id: req.scope.tenant_id },
      transaction: t,
    });
    if (!purchase) throw new AppError('Purchase not found', 404);
    if (purchase.verification_status !== 'VERIFIED') {
      throw new AppError('Cannot receive into inventory: tunch verification is still pending', 409);
    }
    if (purchase.received_into_inventory) {
      throw new AppError('This purchase has already been received into inventory', 409);
    }

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      throw new AppError('At least one item breakdown is required to receive this purchase', 400);
    }

    const createdItems = [];
    for (const itemPayload of items) {
      const product = await ProductMaster.findOne({ where: { id: itemPayload.product_master_id, tenant_id: req.scope.tenant_id }, transaction: t });
      if (!product) throw new AppError(`Invalid product_master_id: ${itemPayload.product_master_id}`, 404);

      const item = await createItemInternal(
        {
          ...itemPayload,
          tenant_id: req.scope.tenant_id,
          branch_id: purchase.branch_id,
          purity: itemPayload.purity || (purchase.tunch_percentage ? `${purchase.tunch_percentage}%` : product.default_purity),
          source_type: 'SUPPLIER_PURCHASE',
          source_reference_id: purchase.id,
        },
        { transaction: t, userId: req.user.id }
      );
      createdItems.push(item);

      await PurchaseItem.create({
        purchase_id: purchase.id, product_master_id: product.id,
        quantity: itemPayload.mode === 'BULK' ? itemPayload.total_pieces : 1,
        gross_weight: itemPayload.mode === 'BULK' ? itemPayload.total_gross_weight : itemPayload.gross_weight,
        net_weight: itemPayload.mode === 'BULK' ? itemPayload.total_net_weight : (itemPayload.gross_weight - (itemPayload.less_weight || 0)),
        purity: itemPayload.purity || product.default_purity,
        rate_used: itemPayload.rate_used || null,
        amount: itemPayload.amount || null,
      }, { transaction: t });
    }

    purchase.received_into_inventory = true;
    await purchase.save({ transaction: t, userId: req.user.id });

    await t.commit();

    const fullItems = await Item.findAll({ where: { id: createdItems.map((i) => i.id) } });
    res.status(201).json({ purchase_id: purchase.id, items_created: fullItems });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

async function applyPurchaseToLedger(purchase) {
  const t = await sequelize.transaction();
  try {
    const ledger = await SupplierLedger.findOne({ where: { supplier_id: purchase.supplier_id }, transaction: t, lock: true });
    ledger.currency_balance = Number(ledger.currency_balance) + Number(purchase.total_amount || 0);
    ledger.pure_metal_balance_24k_grams = Number(ledger.pure_metal_balance_24k_grams) + Number(purchase.pure_weight_24k_equivalent || 0);
    await ledger.save({ transaction: t });
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
}
