// controllers/reportsController.js
import db from '../models/index.js';
import { computeChannelPrice } from '../utils/pricingEngine.js';

const {
  Item, BulkItem, MetalDetail, StoneDetail, ProductMaster, Category,
  Sale, SaleItem, Purchase, StockMovement,
} = db;

const FULL_INCLUDE = [{ model: ProductMaster, include: [Category] }, BulkItem, MetalDetail, StoneDetail];

// Total inventory value - the live price of every IN_STOCK item, summed.
// Each item is valued on its own channel: retail stock at its retail price, wholesale stock at
// its wholesale price. The two columns simply split that same total by channel.
export const inventoryValuation = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id, status: 'IN_STOCK' };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const items = await Item.findAll({ where, include: FULL_INCLUDE });

    let totalRetail = 0;
    let totalWholesale = 0;
    let totalPieces = 0;
    let totalGoldWeight = 0;
    const rows = [];

    for (const item of items) {
      const pricing = await computeChannelPrice(item);
      const quantity = item.mode === 'BULK' ? Number(item.BulkItem?.total_pieces || 0) : 1;
      const weight = item.mode === 'BULK' ? Number(item.BulkItem?.total_gross_weight || 0) : Number(item.MetalDetail?.gross_weight || 0);

      const unitPrice = pricing?.price?.final_price || 0;
      const lineValue = unitPrice * quantity;
      const isWholesale = pricing.channel === 'WHOLESALE';

      if (isWholesale) totalWholesale += lineValue; else totalRetail += lineValue;
      totalPieces += quantity;
      totalGoldWeight += weight;

      rows.push({
        item_id: item.id,
        product_name: item.ProductMaster?.product_name,
        channel: pricing.channel,
        quantity,
        weight,
        unit_price: round2(unitPrice),
        value: round2(lineValue),
        pricing_error: pricing.error || null,
      });
    }

    res.json({
      total_pieces: totalPieces,
      total_weight_grams: round2(totalGoldWeight),
      total_retail_value: round2(totalRetail),
      total_wholesale_value: round2(totalWholesale),
      total_value: round2(totalRetail + totalWholesale),
      items: rows,
    });
  } catch (err) { next(err); }
};

// Items that have not moved for a while, grouped into age buckets
export const slowMovingStock = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id, status: 'IN_STOCK' };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const items = await Item.findAll({ where, include: FULL_INCLUDE, order: [['last_moved_at', 'ASC']] });
    const now = Date.now();

    const buckets = { '0-30': [], '31-90': [], '91-180': [], '180+': [] };
    for (const item of items) {
      const lastMoved = item.last_moved_at ? new Date(item.last_moved_at).getTime() : new Date(item.createdAt || item.created_at).getTime();
      const daysIdle = Math.floor((now - lastMoved) / (1000 * 60 * 60 * 24));
      const entry = { item_id: item.id, product_name: item.ProductMaster?.product_name, days_idle: daysIdle };

      if (daysIdle <= 30) buckets['0-30'].push(entry);
      else if (daysIdle <= 90) buckets['31-90'].push(entry);
      else if (daysIdle <= 180) buckets['91-180'].push(entry);
      else buckets['180+'].push(entry);
    }

    res.json(buckets);
  } catch (err) { next(err); }
};

// Dead stock = has not moved even once in 180+ days - available as its own list
export const deadStock = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id, status: 'IN_STOCK' };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const items = await Item.findAll({ where, include: FULL_INCLUDE });
    const cutoff = Date.now() - 180 * 24 * 60 * 60 * 1000;

    const dead = items.filter((item) => {
      const lastMoved = item.last_moved_at ? new Date(item.last_moved_at).getTime() : new Date(item.createdAt || item.created_at).getTime();
      return lastMoved < cutoff;
    });

    res.json(dead);
  } catch (err) { next(err); }
};

export const salesReport = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id, status: 'CONFIRMED' };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;
    const { Op } = await import('sequelize');
    if (req.query.from) where.sale_date = { ...(where.sale_date || {}), [Op.gte]: req.query.from };
    if (req.query.to) where.sale_date = { ...(where.sale_date || {}), [Op.lte]: req.query.to };

    const sales = await Sale.findAll({ where, include: [SaleItem] });
    const totalSales = sales.reduce((sum, s) => sum + Number(s.total_amount), 0);
    const retailCount = sales.filter((s) => s.sale_type === 'RETAIL').length;
    const wholesaleCount = sales.filter((s) => s.sale_type === 'WHOLESALE').length;

    res.json({
      total_sales_amount: round2(totalSales), total_invoices: sales.length, retail_invoices: retailCount, wholesale_invoices: wholesaleCount,
      sales,
    });
  } catch (err) { next(err); }
};

export const purchaseReport = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const purchases = await Purchase.findAll({ where });
    const totalAmount = purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
    const totalWeight = purchases.reduce((sum, p) => sum + Number(p.gross_weight || 0), 0);

    res.json({ total_purchase_amount: round2(totalAmount), total_gross_weight: round2(totalWeight), purchases });
  } catch (err) { next(err); }
};

export const stockMovementReport = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;
    if (req.query.movement_type) where.movement_type = req.query.movement_type;

    const movements = await StockMovement.findAll({ where, include: [Item], order: [['created_at', 'DESC']], limit: 500 });
    res.json(movements);
  } catch (err) { next(err); }
};

function round2(n) { return Math.round(n * 100) / 100; }
