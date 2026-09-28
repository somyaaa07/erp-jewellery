// controllers/purchaseController.js (redesigned)
// Supplier -> Purchase (invoice) -> Purchase Items -> Inventory, jaisa roadmap me socha tha.
//
// Raw material purchase is GOLD/SILVER only, and every purchase now carries a GST type:
//   WITH_GST    - total_amount owed to supplier = subtotal + tax (as before).
//   WITHOUT_GST - no tax at all; total_amount = subtotal only.
//   REVERSE_GST - the GST is OUR liability to the government, not the supplier's charge, so it
//                 is tracked separately (reverse_charge_gst_amount) and kept OUT of what we owe
//                 the supplier (total_amount = subtotal only, same as WITHOUT_GST from the
//                 supplier's point of view).
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { createItemInternal } from './itemController.js';

const { sequelize, Purchase, PurchaseItem, SupplierLedger, Supplier, Item, ProductMaster, Location } = db;

const RAW_METAL_TYPES = ['GOLD', 'SILVER'];
const GST_TYPES = ['WITH_GST', 'WITHOUT_GST', 'REVERSE_GST'];

function generatePurchaseNumber() {
  return `PO-${Date.now().toString().slice(-8)}`;
}

// Works out what is actually owed to the supplier vs what (if anything) is a reverse-charge
// liability we owe the government instead.
function computeGstSplit(gst_type, subtotal_amount, tax_amount) {
  const subtotal = Number(subtotal_amount || 0);
  const tax = Number(tax_amount || 0);

  if (gst_type === 'WITH_GST') {
    return { tax_amount: tax, reverse_charge_gst_amount: 0, total_amount: subtotal + tax };
  }
  if (gst_type === 'REVERSE_GST') {
    // Supplier is paid the subtotal only; GST is self-assessed and paid to the government.
    return { tax_amount: 0, reverse_charge_gst_amount: tax, total_amount: subtotal };
  }
  // WITHOUT_GST
  return { tax_amount: 0, reverse_charge_gst_amount: 0, total_amount: subtotal };
}

export const createPurchase = async (req, res, next) => {
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);

    const {
      supplier_id, purchase_date, metal_type, gross_weight, tunch_percentage,
      subtotal_amount, tax_amount, is_jangad, gst_type,
    } = req.body;

    if (!RAW_METAL_TYPES.includes(metal_type)) {
      throw new AppError('metal_type must be GOLD or SILVER - this shop only buys raw gold/silver', 400);
    }
    const resolvedGstType = GST_TYPES.includes(gst_type) ? gst_type : 'WITH_GST';

    const supplier = await Supplier.findOne({ where: { id: supplier_id, tenant_id: req.scope.tenant_id } });
    if (!supplier) throw new AppError('Supplier not found', 404);

    const verification_status = is_jangad && !tunch_percentage ? 'PENDING_TUNCH' : 'VERIFIED';
    const pure_weight_24k_equivalent = tunch_percentage
      ? Number(((gross_weight * tunch_percentage) / 100).toFixed(3))
      : null;
    const gstSplit = computeGstSplit(resolvedGstType, subtotal_amount, tax_amount);
    const purchase_number = generatePurchaseNumber();

    const purchase = await Purchase.create({
      tenant_id: req.scope.tenant_id, branch_id, supplier_id, purchase_number, receipt_number: purchase_number,
      purchase_date, metal_type, gross_weight,
      tunch_percentage: tunch_percentage || null,
      pure_weight_24k_equivalent,
      gst_type: resolvedGstType,
      subtotal_amount: subtotal_amount || 0,
      tax_amount: gstSplit.tax_amount,
      reverse_charge_gst_amount: gstSplit.reverse_charge_gst_amount,
      total_amount: gstSplit.total_amount,
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
    const { tunch_percentage, subtotal_amount, tax_amount, gst_type } = req.body;
    const purchase = await Purchase.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!purchase) throw new AppError('Purchase not found', 404);
    if (purchase.verification_status === 'VERIFIED') throw new AppError('Already verified', 409);

    purchase.tunch_percentage = tunch_percentage;
    purchase.pure_weight_24k_equivalent = Number(((purchase.gross_weight * tunch_percentage) / 100).toFixed(3));
    if (subtotal_amount !== undefined) purchase.subtotal_amount = subtotal_amount;
    if (tax_amount !== undefined) purchase.tax_amount = tax_amount;
    if (GST_TYPES.includes(gst_type)) purchase.gst_type = gst_type;

    const gstSplit = computeGstSplit(purchase.gst_type, purchase.subtotal_amount, purchase.tax_amount);
    purchase.tax_amount = gstSplit.tax_amount;
    purchase.reverse_charge_gst_amount = gstSplit.reverse_charge_gst_amount;
    purchase.total_amount = gstSplit.total_amount;
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

    // Storage is single now: if the caller didn't pick a location, stock goes into this
    // branch's Wholesale Store automatically.
    const wholesaleStore = await Location.findOne({
      where: { tenant_id: req.scope.tenant_id, branch_id: purchase.branch_id, storage_type: 'WHOLESALE_STORE' },
      transaction: t,
    });

    for (const rawPayload of items) {
      const itemPayload = { ...rawPayload };
      if (!itemPayload.location_id) {
        if (!wholesaleStore) {
          throw new AppError('This branch has no Wholesale Store yet - run backfill-storage for the branch first', 409);
        }
        itemPayload.location_id = wholesaleStore.id;
      }
      // Raw purchase stock is always wholesale stock; never enters via the tray directly.
      itemPayload.channel = 'WHOLESALE';
      itemPayload.is_tray_display = false;
      delete itemPayload.tray_pieces;

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

// GET /purchases/:id/receipt - printable purchase receipt: full supplier details, metal/weight/
// tunch, and the GST breakup according to gst_type.
export const getPurchaseReceipt = async (req, res, next) => {
  try {
    const purchase = await Purchase.findOne({
      where: { id: req.params.id, tenant_id: req.scope.tenant_id },
      include: [Supplier, PurchaseItem],
    });
    if (!purchase) throw new AppError('Purchase not found', 404);

    const s = purchase.Supplier;
    const gstLabel = {
      WITH_GST: 'GST charged by supplier',
      WITHOUT_GST: 'No GST',
      REVERSE_GST: 'Reverse charge - GST payable by buyer to government',
    }[purchase.gst_type];

    res.json({
      receipt_number: purchase.receipt_number || purchase.purchase_number,
      purchase_number: purchase.purchase_number,
      purchase_date: purchase.purchase_date,
      supplier: s ? {
        name: s.name, contact_person: s.contact_person, phone: s.phone, email: s.email,
        address: [s.address, s.city, s.state, s.pincode].filter(Boolean).join(', '),
        gstin: s.gstin, pan_number: s.pan_number,
        bank_name: s.bank_name, bank_account_number: s.bank_account_number, bank_ifsc: s.bank_ifsc,
      } : null,
      metal_type: purchase.metal_type,
      gross_weight: Number(purchase.gross_weight),
      tunch_percentage: purchase.tunch_percentage != null ? Number(purchase.tunch_percentage) : null,
      pure_weight_24k_equivalent: purchase.pure_weight_24k_equivalent != null ? Number(purchase.pure_weight_24k_equivalent) : null,
      verification_status: purchase.verification_status,
      gst_type: purchase.gst_type,
      gst_note: gstLabel,
      subtotal_amount: Number(purchase.subtotal_amount),
      tax_amount: Number(purchase.tax_amount),
      reverse_charge_gst_amount: Number(purchase.reverse_charge_gst_amount),
      total_amount: Number(purchase.total_amount),
      items: (purchase.PurchaseItems || []).map((pi) => ({
        product_master_id: pi.product_master_id, quantity: pi.quantity,
        gross_weight: Number(pi.gross_weight), net_weight: Number(pi.net_weight), purity: pi.purity,
      })),
    });
  } catch (err) { next(err); }
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
