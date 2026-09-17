// controllers/saleController.js
// Customer -> Sale -> Sale Items -> Inventory.
// Every SaleItem also freezes a PriceSnapshot, so even if the gold rate changes tomorrow the
// amount on an old invoice never changes.
//
// IMPORTANT (changed): the sale type is no longer a toggle the cashier picks. Each item is
// priced on the channel it came into inventory on - retail stock is billed at retail, wholesale
// stock at wholesale. A sale is tagged WHOLESALE only if every line on it is wholesale stock.
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { computeItemPrice, getItemChannel } from '../utils/pricingEngine.js';

const {
  sequelize, Sale, SaleItem, Invoice, Customer, Item, BulkItem, MetalDetail,
  StoneDetail, ProductMaster, Category, PriceSnapshot, StockMovement, Branch, Tenant,
} = db;

function generateNumber(prefix) {
  return `${prefix}-${Date.now().toString().slice(-8)}`;
}

function round2(n) { return Math.round(n * 100) / 100; }

// items: [{ item_id, quantity (pieces for BULK, always 1 for PIECE) }]
export const createSale = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('A branch is required to create a sale', 400);

    const { customer_id, items, discount_amount, payment_status } = req.body;
    if (!Array.isArray(items) || items.length === 0) throw new AppError('Add at least one item to the bill', 400);

    if (customer_id) {
      const customer = await Customer.findOne({ where: { id: customer_id, tenant_id: req.scope.tenant_id }, transaction: t });
      if (!customer) throw new AppError('Customer not found', 404);
    }

    const sale = await Sale.create({
      tenant_id: req.scope.tenant_id, branch_id, customer_id: customer_id || null,
      sale_number: generateNumber('INV'), sale_date: new Date().toISOString().slice(0, 10),
      sale_type: 'RETAIL', discount_amount: discount_amount || 0, status: 'DRAFT',
    }, { transaction: t });

    let subtotal = 0;
    let gstTotal = 0;
    const channelsSeen = new Set();

    for (const line of items) {
      const item = await Item.findOne({
        where: { id: line.item_id, tenant_id: req.scope.tenant_id },
        include: [{ model: ProductMaster, include: [Category] }, MetalDetail, StoneDetail, BulkItem],
        transaction: t, lock: true,
      });
      if (!item) throw new AppError(`Item ${line.item_id} not found`, 404);
      if (item.status !== 'IN_STOCK') throw new AppError(`Item ${line.item_id} is not available for sale (status: ${item.status})`, 409);

      const quantity = item.mode === 'BULK' ? Number(line.quantity || 1) : 1;
      if (item.mode === 'BULK' && quantity > item.BulkItem.total_pieces) {
        throw new AppError(`Requested quantity is more than the stock available for item ${item.id}`, 400);
      }

      // The item's own channel decides the price - not a screen-level toggle.
      const channel = getItemChannel(item);
      channelsSeen.add(channel);

      const priceResult = await computeItemPrice(item, channel, {});
      const b = priceResult.breakdown || {};
      const unitFinalPrice = priceResult.final_price;
      const lineFinalPrice = round2(unitFinalPrice * quantity);

      const saleItem = await SaleItem.create({
        sale_id: sale.id, item_id: item.id,
        gold_rate_used: b.gold_rate_used || 0, purity: b.purity || item.MetalDetail?.purity || '',
        net_weight_used: (b.net_weight || 0) * quantity,
        gold_value: (b.gold_value || 0) * quantity,
        making_charge_amount: (b.making_charge || 0) * quantity,
        wastage_amount: (b.wastage_amount || 0) * quantity,
        stone_value: (b.stone_value || 0) * quantity,
        gst_amount: (b.gst_amount || 0) * quantity,
        final_price: lineFinalPrice,
      }, { transaction: t });

      await PriceSnapshot.create({
        tenant_id: req.scope.tenant_id, item_id: item.id, sale_item_id: saleItem.id, profile_type: channel,
        gold_rate_used: b.gold_rate_used || 0, purity: b.purity || '', net_weight_used: (b.net_weight || 0) * quantity,
        gold_value: (b.gold_value || 0) * quantity, making_charge_amount: (b.making_charge || 0) * quantity,
        wastage_amount: (b.wastage_amount || 0) * quantity, stone_value: (b.stone_value || 0) * quantity,
        other_charges: (b.other_charges || 0) * quantity, gst_amount: (b.gst_amount || 0) * quantity, final_price: lineFinalPrice,
      }, { transaction: t });

      subtotal += lineFinalPrice - (b.gst_amount || 0) * quantity;
      gstTotal += (b.gst_amount || 0) * quantity;

      // ---- Inventory update: sale reduces stock ----
      if (item.mode === 'BULK') {
        const remaining = item.BulkItem.total_pieces - quantity;
        const perPieceGross = item.BulkItem.total_gross_weight / item.BulkItem.total_pieces;
        const perPieceNet = item.BulkItem.total_net_weight / item.BulkItem.total_pieces;
        item.BulkItem.total_pieces = remaining;
        item.BulkItem.total_gross_weight = Number(item.BulkItem.total_gross_weight) - perPieceGross * quantity;
        item.BulkItem.total_net_weight = Number(item.BulkItem.total_net_weight) - perPieceNet * quantity;
        await item.BulkItem.save({ transaction: t });
        if (remaining <= 0) {
          item.status = 'SOLD';
          await item.save({ transaction: t, userId: req.user.id });
        }
      } else {
        item.status = 'SOLD';
        await item.save({ transaction: t, userId: req.user.id });
      }

      await StockMovement.create({
        tenant_id: req.scope.tenant_id, branch_id, item_id: item.id, movement_type: 'SALE',
        quantity_change: -quantity, weight_change: -(b.net_weight || 0) * quantity,
        reference_type: 'SALE', reference_id: sale.id, created_by: req.user.id,
      }, { transaction: t });
    }

    // A bill made purely of wholesale stock is a wholesale bill; anything else is retail.
    sale.sale_type = channelsSeen.size === 1 && channelsSeen.has('WHOLESALE') ? 'WHOLESALE' : 'RETAIL';
    sale.subtotal_amount = round2(subtotal);
    sale.gst_amount = round2(gstTotal);
    sale.total_amount = round2(subtotal + gstTotal - Number(discount_amount || 0));
    sale.payment_status = payment_status || 'PAID';
    sale.status = 'CONFIRMED';
    await sale.save({ transaction: t });

    await Invoice.create({
      tenant_id: req.scope.tenant_id, branch_id, sale_id: sale.id,
      invoice_number: generateNumber('BILL'), total_amount: sale.total_amount,
    }, { transaction: t });

    await t.commit();

    // Return the full printable invoice straight away, so the POS screen can show and print it.
    const printable = await buildInvoicePayload(sale.id, req.scope.tenant_id);
    res.status(201).json(printable);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

export const listSales = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;
    if (req.query.sale_type) where.sale_type = req.query.sale_type;

    const sales = await Sale.findAll({ where, include: [Customer, Invoice], order: [['created_at', 'DESC']], limit: 200 });
    res.json(sales);
  } catch (err) { next(err); }
};

export const getSale = async (req, res, next) => {
  try {
    const payload = await buildInvoicePayload(req.params.id, req.scope.tenant_id);
    if (!payload) throw new AppError('Sale not found', 404);
    res.json(payload);
  } catch (err) { next(err); }
};

// GET /sales/:id/invoice - everything the printable bill needs, in one response.
export const getInvoice = async (req, res, next) => {
  try {
    const payload = await buildInvoicePayload(req.params.id, req.scope.tenant_id);
    if (!payload) throw new AppError('Invoice not found', 404);
    res.json(payload);
  } catch (err) { next(err); }
};

/**
 * Builds a self-contained invoice object: shop header, customer, line items with their
 * design names and weights, and the totals. Nothing here is recalculated - it all comes from
 * the frozen sale records, so a reprint is always identical to the original bill.
 */
async function buildInvoicePayload(saleId, tenantId) {
  const sale = await Sale.findOne({
    where: { id: saleId, tenant_id: tenantId },
    include: [
      Customer,
      Invoice,
      {
        model: SaleItem,
        include: [{ model: Item, include: [{ model: ProductMaster, include: [Category] }, MetalDetail] }],
      },
    ],
  });
  if (!sale) return null;

  const [branch, tenant] = await Promise.all([
    Branch.findByPk(sale.branch_id),
    Tenant.findByPk(tenantId),
  ]);

  const lines = (sale.SaleItems || []).map((si) => {
    const item = si.Item;
    const product = item?.ProductMaster;
    return {
      sale_item_id: si.id,
      item_id: si.item_id,
      product_name: product?.product_name || `Item #${si.item_id}`,
      design_code: product?.design_code || '',
      category: product?.Category?.name || '',
      metal_type: product?.metal_type || item?.MetalDetail?.metal_type || '',
      purity: si.purity,
      channel: item ? getItemChannel(item) : 'RETAIL',
      hsn_code: product?.hsn_code || '7113',
      gold_rate_used: Number(si.gold_rate_used),
      net_weight: Number(si.net_weight_used),
      gold_value: Number(si.gold_value),
      making_charge: Number(si.making_charge_amount),
      wastage_amount: Number(si.wastage_amount),
      stone_value: Number(si.stone_value),
      gst_amount: Number(si.gst_amount),
      line_total: Number(si.final_price),
    };
  });

  return {
    id: sale.id,
    sale_number: sale.sale_number,
    invoice_number: sale.Invoice?.invoice_number || sale.sale_number,
    invoice_date: sale.sale_date,
    generated_at: sale.Invoice?.generated_at || sale.createdAt,
    sale_type: sale.sale_type,
    status: sale.status,
    payment_status: sale.payment_status,
    shop: {
      name: tenant?.name || 'Jewellery Store',
      branch_name: branch?.name || '',
      address: branch?.address || '',
      gstin: branch?.gstin || '',
      phone: tenant?.owner_phone || '',
    },
    customer: sale.Customer
      ? { id: sale.Customer.id, name: sale.Customer.name, phone: sale.Customer.phone, address: sale.Customer.address, gstin: sale.Customer.gstin }
      : { name: 'Walk-in Customer', phone: '', address: '', gstin: '' },
    lines,
    totals: {
      subtotal: Number(sale.subtotal_amount),
      gst: Number(sale.gst_amount),
      discount: Number(sale.discount_amount),
      grand_total: Number(sale.total_amount),
    },
  };
}
