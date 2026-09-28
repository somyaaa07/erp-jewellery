// controllers/saleController.js
// Customer -> Sale -> Sale Items -> Inventory.
// Every SaleItem also freezes a PriceSnapshot, so even if the gold rate changes tomorrow the
// amount on an old invoice never changes.
//
// IMPORTANT (changed): storage is single (wholesale) now, with the display tray as a separate
// physical bucket stock is moved into. A sale can draw from EITHER bucket, chosen per line via
// `source`:
//   source: 'TRAY'      (default) - sells out of the display tray, priced at the RETAIL profile.
//                          For BULK items this needs a piece `quantity`.
//   source: 'WHOLESALE' - sells directly out of the wholesale box, priced at the WHOLESALE
//                          profile. For BULK items this can be a piece `quantity` OR a manually
//                          entered `weight_removed` in grams (how much was physically taken out
//                          of the box) - whichever the counter actually measured.
// The sale's own sale_type is WHOLESALE only if every line drew from the wholesale bucket;
// otherwise it is RETAIL (this replaces the old channel-based rule).
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { computeItemPrice } from '../utils/pricingEngine.js';

const SALE_SOURCES = ['TRAY', 'WHOLESALE'];

// Same trick as itemController.computeBucketPricing: hand computeItemPrice a stand-in whose
// BulkItem numbers represent only the bucket (tray or wholesale) this sale line is drawing from.
function bucketView(item, pieces, gross, net) {
  return {
    tenant_id: item.tenant_id,
    branch_id: item.branch_id,
    mode: item.mode,
    override_price: item.override_price,
    ProductMaster: item.ProductMaster,
    MetalDetail: item.MetalDetail,
    StoneDetails: item.StoneDetails,
    BulkItem: { total_pieces: pieces, total_gross_weight: gross, total_net_weight: net },
  };
}

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
    const sourcesSeen = new Set();

    for (const line of items) {
      const item = await Item.findOne({
        where: { id: line.item_id, tenant_id: req.scope.tenant_id },
        include: [{ model: ProductMaster, include: [Category] }, MetalDetail, StoneDetail, BulkItem],
        transaction: t, lock: true,
      });
      if (!item) throw new AppError(`Item ${line.item_id} not found`, 404);
      if (item.status !== 'IN_STOCK') throw new AppError(`Item ${line.item_id} is not available for sale (status: ${item.status})`, 409);

      // Which bucket is this line actually being sold out of - the display tray, or straight
      // out of the wholesale box? This decides both the price profile and which bucket gets
      // debited, independent of the item's own `channel` field.
      const source = SALE_SOURCES.includes(String(line.source || '').toUpperCase())
        ? String(line.source).toUpperCase()
        : 'TRAY';
      sourcesSeen.add(source);
      const profileType = source === 'TRAY' ? 'RETAIL' : 'WHOLESALE';

      let quantity;          // pieces actually sold (BULK) or 1 (PIECE)
      let priceResult;
      let manualWeightRemoved = null;
      // computeItemPrice quotes BULK stock PER PIECE, so a line's real amounts are that unit
      // price x scale. A manual-gram line is priced as one weight-based unit, so its scale is 1.
      let scale = 1;
      let grossRemoved = 0;  // physical weight leaving the bucket for this line
      let netRemoved = 0;

      if (item.mode === 'PIECE') {
        if (source === 'TRAY' && !item.is_tray_display) {
          throw new AppError(`Item ${item.id} is not on the tray - it is still in the wholesale store`, 409);
        }
        if (source === 'WHOLESALE' && item.is_tray_display) {
          throw new AppError(`Item ${item.id} is on the tray, not in the wholesale store - sell it as a TRAY line`, 409);
        }
        quantity = 1;
        priceResult = await computeItemPrice(item, profileType, {});
      } else {
        // BULK item - drawing from whichever bucket `source` points at.
        const bucketPieces = source === 'TRAY' ? Number(item.BulkItem.tray_pieces) : Number(item.BulkItem.total_pieces);
        const bucketGross = source === 'TRAY' ? Number(item.BulkItem.tray_gross_weight) : Number(item.BulkItem.total_gross_weight);
        const bucketNet = source === 'TRAY' ? Number(item.BulkItem.tray_net_weight) : Number(item.BulkItem.total_net_weight);

        if (bucketPieces <= 0) {
          throw new AppError(`Item ${item.id} has no stock in the ${source === 'TRAY' ? 'display tray' : 'wholesale store'} to sell from`, 409);
        }

        if (source === 'WHOLESALE' && line.weight_removed) {
          // Manual gram entry: the counter just weighed out however many grams were taken from
          // the wholesale box, without counting exact pieces. Price and deduct by that weight.
          manualWeightRemoved = Number(line.weight_removed);
          if (manualWeightRemoved <= 0 || manualWeightRemoved > bucketGross) {
            throw new AppError(`weight_removed for item ${item.id} must be between 0 and ${bucketGross}g (available in wholesale)`, 400);
          }
          const avgNetPerGram = bucketNet / bucketGross;
          netRemoved = Number((manualWeightRemoved * avgNetPerGram).toFixed(3));
          grossRemoved = manualWeightRemoved;
          quantity = 1; // priced as a single weight-based line, not per piece
          scale = 1;
          priceResult = await computeItemPrice(bucketView(item, 1, manualWeightRemoved, netRemoved), profileType, {});
        } else {
          quantity = Number(line.quantity || 1);
          if (quantity <= 0 || quantity > bucketPieces) {
            throw new AppError(`Requested quantity for item ${item.id} exceeds the ${bucketPieces} piece(s) available in the ${source === 'TRAY' ? 'display tray' : 'wholesale store'}`, 400);
          }
          const perPieceGross = bucketGross / bucketPieces;
          const perPieceNet = bucketNet / bucketPieces;
          scale = quantity;
          grossRemoved = Number((perPieceGross * quantity).toFixed(3));
          netRemoved = Number((perPieceNet * quantity).toFixed(3));
          priceResult = await computeItemPrice(
            bucketView(item, quantity, perPieceGross * quantity, perPieceNet * quantity),
            profileType, {}
          );
        }
      }

      const unit = priceResult.breakdown || {};
      const b = {
        ...unit,
        gold_value: (unit.gold_value || 0) * scale,
        making_charge: (unit.making_charge || 0) * scale,
        wastage_amount: (unit.wastage_amount || 0) * scale,
        stone_value: (unit.stone_value || 0) * scale,
        other_charges: (unit.other_charges || 0) * scale,
        gst_amount: (unit.gst_amount || 0) * scale,
        net_weight: (unit.net_weight || 0) * scale,
      };
      const lineFinalPrice = round2(priceResult.final_price * scale);

      const saleItem = await SaleItem.create({
        sale_id: sale.id, item_id: item.id, sale_source: source, manual_weight_removed: manualWeightRemoved,
        gold_rate_used: b.gold_rate_used || 0, purity: b.purity || item.MetalDetail?.purity || '',
        net_weight_used: b.net_weight || 0,
        gold_value: b.gold_value || 0,
        making_charge_amount: b.making_charge || 0,
        wastage_amount: b.wastage_amount || 0,
        stone_value: b.stone_value || 0,
        gst_amount: b.gst_amount || 0,
        final_price: lineFinalPrice,
      }, { transaction: t });

      await PriceSnapshot.create({
        tenant_id: req.scope.tenant_id, item_id: item.id, sale_item_id: saleItem.id, profile_type: profileType,
        gold_rate_used: b.gold_rate_used || 0, purity: b.purity || '', net_weight_used: b.net_weight || 0,
        gold_value: b.gold_value || 0, making_charge_amount: b.making_charge || 0,
        wastage_amount: b.wastage_amount || 0, stone_value: b.stone_value || 0,
        other_charges: b.other_charges || 0, gst_amount: b.gst_amount || 0, final_price: lineFinalPrice,
      }, { transaction: t });

      subtotal += lineFinalPrice - (b.gst_amount || 0);
      gstTotal += (b.gst_amount || 0);

      // ---- Inventory update: sale reduces exactly the bucket it was sold from ----
      if (item.mode === 'BULK') {
        if (source === 'TRAY') {
          item.BulkItem.tray_pieces = Number(item.BulkItem.tray_pieces) - quantity;
          item.BulkItem.tray_gross_weight = Number(item.BulkItem.tray_gross_weight) - grossRemoved;
          item.BulkItem.tray_net_weight = Number(item.BulkItem.tray_net_weight) - netRemoved;
        } else {
          item.BulkItem.total_pieces = manualWeightRemoved != null
            ? item.BulkItem.total_pieces // manual gram sale doesn't necessarily remove a whole piece
            : Number(item.BulkItem.total_pieces) - quantity;
          item.BulkItem.total_gross_weight = Number(item.BulkItem.total_gross_weight) - grossRemoved;
          item.BulkItem.total_net_weight = Number(item.BulkItem.total_net_weight) - netRemoved;
        }
        await item.BulkItem.save({ transaction: t });

        if (item.BulkItem.grandTotalPieces() <= 0 || item.BulkItem.grandTotalGrossWeight() <= 0.0005) {
          item.status = 'SOLD';
          await item.save({ transaction: t, userId: req.user.id });
        }
      } else {
        item.status = 'SOLD';
        await item.save({ transaction: t, userId: req.user.id });
      }

      await StockMovement.create({
        tenant_id: req.scope.tenant_id, branch_id, item_id: item.id, movement_type: 'SALE',
        quantity_change: -quantity, weight_change: -(item.mode === 'BULK' ? netRemoved : (b.net_weight || 0)),
        reference_type: 'SALE', reference_id: sale.id, created_by: req.user.id,
      }, { transaction: t });
    }

    // A bill made purely of wholesale-sourced lines is a wholesale bill; anything else is retail.
    sale.sale_type = sourcesSeen.size === 1 && sourcesSeen.has('WHOLESALE') ? 'WHOLESALE' : 'RETAIL';
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
      channel: si.sale_source === 'WHOLESALE' ? 'WHOLESALE' : 'RETAIL',
      sale_source: si.sale_source,
      manual_weight_removed: si.manual_weight_removed != null ? Number(si.manual_weight_removed) : null,
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
