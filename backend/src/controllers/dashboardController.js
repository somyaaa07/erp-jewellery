// controllers/dashboardController.js
import db from '../models/index.js';
import { computeChannelPrice } from '../utils/pricingEngine.js';

const {
  Item, BulkItem, MetalDetail, StoneDetail, ProductMaster, Category,
  Sale, StockReservation, RepairOrder, GoldRate,
} = db;

export const dashboardSummary = async (req, res, next) => {
  try {
    const { Op } = await import('sequelize');
    const where = { tenant_id: req.scope.tenant_id };
    const branchWhere = req.scope.branch_id ? { ...where, branch_id: req.scope.branch_id } : where;

    const [inStockItems, reservedCount, inRepairCount, todaysSales, latestRates] = await Promise.all([
      Item.findAll({
        where: { ...branchWhere, status: 'IN_STOCK' },
        include: [{ model: ProductMaster, include: [Category] }, BulkItem, MetalDetail, StoneDetail],
      }),
      StockReservation.count({ where: { tenant_id: req.scope.tenant_id, status: 'ACTIVE' } }),
      RepairOrder.count({ where: { ...branchWhere, status: { [Op.ne]: 'COMPLETED' } } }),
      Sale.findAll({ where: { ...branchWhere, sale_date: new Date().toISOString().slice(0, 10), status: 'CONFIRMED' } }),
      GoldRate.findAll({ where: { tenant_id: req.scope.tenant_id }, order: [['rate_date', 'DESC']], limit: 5 }),
    ]);

    let totalPieces = 0;
    let totalWeight = 0;
    let totalRetailValue = 0;

    for (const item of inStockItems) {
      const quantity = item.mode === 'BULK' ? Number(item.BulkItem?.total_pieces || 0) : 1;
      const weight = item.mode === 'BULK' ? Number(item.BulkItem?.total_gross_weight || 0) : Number(item.MetalDetail?.gross_weight || 0);
      totalPieces += quantity;
      totalWeight += weight;
      const pricing = await computeChannelPrice(item);
      totalRetailValue += (pricing?.price?.final_price || 0) * quantity;
    }

    const todaysSalesTotal = todaysSales.reduce((sum, s) => sum + Number(s.total_amount), 0);

    res.json({
      total_pieces_in_stock: totalPieces,
      total_gold_weight_grams: Math.round(totalWeight * 1000) / 1000,
      total_inventory_retail_value: Math.round(totalRetailValue * 100) / 100,
      active_reservations: reservedCount,
      items_in_repair: inRepairCount,
      todays_sales_amount: Math.round(todaysSalesTotal * 100) / 100,
      todays_invoice_count: todaysSales.length,
      latest_gold_rates: latestRates,
    });
  } catch (err) { next(err); }
};
