// controllers/dailyStockReportController.js
// Daily Stock Report (DSR) for the wholesale store - weight-wise, one line per category.
//
//   Opening  = weight in the wholesale store at the start of the day
//   Addition = weight received that day (purchases, manufacturing, direct entries, returns)
//   Sale     = weight sold out of the wholesale store that day
//   To tray  = weight moved from wholesale to the display trays that day, net
//   Other    = adjustments and transfers that day, net (can be negative; usually 0)
//   Closing  = Opening + Addition - Sale - To tray + Other   (what the system says)
//   Physical = weight actually measured on the scale    (entered by staff)
//   Difference = Physical - Closing                     (0 means the books match)
//
// The report is saved as a draft, then finalised with two signatures from two different users.
import { Op } from 'sequelize';
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const {
  sequelize, DailyStockReport, DailyStockReportLine, StockMovement, Item, ProductMaster, Category,
} = db;

const round3 = (n) => Number(Number(n || 0).toFixed(3));
const ADDITION_TYPES = new Set(['PURCHASE', 'MANUFACTURING_IN', 'TRANSFER_IN', 'RETURN', 'REPAIR_IN']);

function resolveBranch(req) {
  const branch_id = req.scope.branch_id || req.body?.branch_id || req.query?.branch_id;
  if (!branch_id) throw new AppError('branch_id is required', 400);
  return Number(branch_id);
}

function parseDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  if (!dateStr || Number.isNaN(d.getTime())) throw new AppError('A valid date (YYYY-MM-DD) is required', 400);
  return d;
}

function bucketOf(movement) {
  const type = movement.movement_type;
  if (type === 'SALE') return 'sale';
  if (type === 'TRAY_MOVE_OUT' || type === 'TRAY_MOVE_IN') return 'tray';
  if (ADDITION_TYPES.has(type)) return 'addition';
  if (type === 'ADJUSTMENT' && movement.reference_type === 'DIRECT_ENTRY') return 'addition';
  return 'other';
}

// Works out every category's opening / addition / sale / other / closing from the stock ledger.
async function computeLines(tenant_id, branch_id, dateStr) {
  const dayStart = parseDate(dateStr);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const movements = await StockMovement.findAll({
    where: { tenant_id, branch_id, bucket: 'WHOLESALE', createdAt: { [Op.lt]: dayEnd } },
    include: [{ model: Item, attributes: ['id'], include: [{ model: ProductMaster, attributes: ['category_id'] }] }],
  });

  const totals = {};
  const slot = (categoryId) => {
    if (!totals[categoryId]) totals[categoryId] = { opening: 0, addition: 0, sale: 0, tray: 0, other: 0 };
    return totals[categoryId];
  };

  movements.forEach((m) => {
    const categoryId = m.Item?.ProductMaster?.category_id;
    if (!categoryId) return;
    const w = Number(m.weight_change);
    const row = slot(categoryId);

    // Opening stock always counts as the opening balance, whatever time of day it was entered.
    if (m.reference_type === 'OPENING_STOCK' || m.createdAt < dayStart) { row.opening += w; return; }

    const kind = bucketOf(m);
    if (kind === 'sale') row.sale += -w; // sales are stored as negative weights
    else if (kind === 'tray') row.tray += -w; // moving out is stored negative, so this is positive
    else if (kind === 'addition') row.addition += w;
    else row.other += w;
  });

  const categoryIds = Object.keys(totals).map(Number);
  const categories = categoryIds.length
    ? await Category.findAll({ where: { id: { [Op.in]: categoryIds }, tenant_id }, attributes: ['id', 'name'] })
    : [];
  const names = {};
  categories.forEach((c) => { names[c.id] = c.name; });

  return categoryIds
    .map((id) => {
      const t = totals[id];
      const closing = t.opening + t.addition - t.sale - t.tray + t.other;
      return {
        category_id: id, category_name: names[id] || `Category ${id}`,
        opening_weight: round3(t.opening), addition_weight: round3(t.addition),
        sale_weight: round3(t.sale), tray_weight: round3(t.tray), other_weight: round3(t.other), closing_weight: round3(closing),
        physical_weight: null, difference: null,
      };
    })
    .filter((l) => l.opening_weight || l.addition_weight || l.sale_weight || l.tray_weight || l.other_weight || l.closing_weight)
    .sort((a, b) => a.category_name.localeCompare(b.category_name));
}

function withTotals(lines) {
  const sum = (key) => round3(lines.reduce((s, l) => s + Number(l[key] || 0), 0));
  const allMeasured = lines.length > 0 && lines.every((l) => l.physical_weight !== null && l.physical_weight !== undefined);
  return {
    opening_weight: sum('opening_weight'), addition_weight: sum('addition_weight'),
    sale_weight: sum('sale_weight'), tray_weight: sum('tray_weight'), other_weight: sum('other_weight'), closing_weight: sum('closing_weight'),
    physical_weight: allMeasured ? sum('physical_weight') : null,
    difference: allMeasured ? sum('difference') : null,
  };
}

function shape(report, lines) {
  return {
    id: report?.id || null,
    report_date: report?.report_date,
    status: report?.status || 'DRAFT',
    signatures: [
      { slot: 1, name: report?.signature_1_name || null, at: report?.signature_1_at || null },
      { slot: 2, name: report?.signature_2_name || null, at: report?.signature_2_at || null },
    ],
    lines,
    totals: withTotals(lines),
  };
}

const lineJson = (l) => ({
  category_id: l.category_id, category_name: l.category_name,
  opening_weight: Number(l.opening_weight), addition_weight: Number(l.addition_weight),
  sale_weight: Number(l.sale_weight), tray_weight: Number(l.tray_weight || 0), other_weight: Number(l.other_weight),
  closing_weight: Number(l.closing_weight),
  physical_weight: l.physical_weight === null ? null : Number(l.physical_weight),
  difference: l.difference === null ? null : Number(l.difference),
});

// GET /daily-stock-report?date=YYYY-MM-DD
// A signed report is returned exactly as it was signed. Otherwise the figures are recalculated
// live from the ledger, with any physical weights already saved in the draft laid on top.
export const getReport = async (req, res, next) => {
  try {
    const branch_id = resolveBranch(req);
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    parseDate(date);

    const saved = await DailyStockReport.findOne({
      where: { tenant_id: req.scope.tenant_id, branch_id, report_date: date },
      include: [DailyStockReportLine],
    });

    if (saved?.status === 'SIGNED') {
      return res.json(shape(saved, saved.DailyStockReportLines.map(lineJson)));
    }

    const lines = await computeLines(req.scope.tenant_id, branch_id, date);
    const physical = {};
    (saved?.DailyStockReportLines || []).forEach((l) => { if (l.physical_weight !== null) physical[l.category_id] = Number(l.physical_weight); });
    lines.forEach((l) => {
      if (physical[l.category_id] !== undefined) {
        l.physical_weight = physical[l.category_id];
        l.difference = round3(l.physical_weight - l.closing_weight);
      }
    });

    res.json(shape(saved || { report_date: date }, lines));
  } catch (err) { next(err); }
};

// PUT /daily-stock-report  { date, lines: [{ category_id, physical_weight }] }
// Saves the weights measured on the scale and works out the difference for each category.
export const saveReport = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch_id = resolveBranch(req);
    const { date, lines: input } = req.body;
    parseDate(date);
    if (!Array.isArray(input)) throw new AppError('lines are required', 400);

    let report = await DailyStockReport.findOne({
      where: { tenant_id: req.scope.tenant_id, branch_id, report_date: date }, transaction: t, lock: true,
    });
    if (report?.status === 'SIGNED') throw new AppError('This report is already signed and locked.', 409);

    const computed = await computeLines(req.scope.tenant_id, branch_id, date);
    const physical = {};
    input.forEach((l) => {
      if (l.physical_weight === '' || l.physical_weight === null || l.physical_weight === undefined) return;
      const w = Number(l.physical_weight);
      if (!(w >= 0)) throw new AppError('Weighed amounts must be zero or more', 400);
      physical[l.category_id] = round3(w);
    });
    computed.forEach((l) => {
      if (physical[l.category_id] !== undefined) {
        l.physical_weight = physical[l.category_id];
        l.difference = round3(l.physical_weight - l.closing_weight);
      }
    });

    if (!report) {
      report = await DailyStockReport.create({ tenant_id: req.scope.tenant_id, branch_id, report_date: date }, { transaction: t });
    } else {
      // Any new weights invalidate earlier signatures.
      report.signature_1_user_id = null; report.signature_1_name = null; report.signature_1_at = null;
      report.signature_2_user_id = null; report.signature_2_name = null; report.signature_2_at = null;
      await report.save({ transaction: t });
    }

    await DailyStockReportLine.destroy({ where: { report_id: report.id }, transaction: t });
    await DailyStockReportLine.bulkCreate(computed.map((l) => ({ ...l, report_id: report.id })), { transaction: t });

    await t.commit();
    res.json(shape(report, computed));
  } catch (err) { await t.rollback(); next(err); }
};

// POST /daily-stock-report/sign  { date, slot: 1 | 2 }
// Two different users must sign. The second signature locks the report with the figures that
// were saved in the draft.
export const signReport = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch_id = resolveBranch(req);
    const { date } = req.body;
    const slotNo = Number(req.body.slot);
    if (![1, 2].includes(slotNo)) throw new AppError('Signature must be 1 or 2', 400);
    parseDate(date);

    const report = await DailyStockReport.findOne({
      where: { tenant_id: req.scope.tenant_id, branch_id, report_date: date },
      transaction: t, lock: true,
    });
    if (!report) throw new AppError('Save the report with the weighed amounts before signing.', 409);
    if (report.status === 'SIGNED') throw new AppError('This report is already signed.', 409);

    const lines = await DailyStockReportLine.findAll({ where: { report_id: report.id }, transaction: t });
    if (lines.length === 0) throw new AppError('There is nothing to sign: no stock movement or balance for this date.', 409);
    if (lines.some((l) => l.physical_weight === null)) {
      throw new AppError('Enter the weighed amount for every category before signing.', 409);
    }

    const otherSlot = slotNo === 1 ? 2 : 1;
    if (report[`signature_${otherSlot}_user_id`] === req.user.id) {
      throw new AppError('Signature 1 and Signature 2 must be from two different people.', 409);
    }
    if (report[`signature_${slotNo}_user_id`]) throw new AppError(`Signature ${slotNo} is already done.`, 409);

    report[`signature_${slotNo}_user_id`] = req.user.id;
    report[`signature_${slotNo}_name`] = req.user.name || `User ${req.user.id}`;
    report[`signature_${slotNo}_at`] = new Date();
    if (report.signature_1_user_id && report.signature_2_user_id) report.status = 'SIGNED';
    await report.save({ transaction: t });

    await t.commit();
    res.json(shape(report, lines.map(lineJson)));
  } catch (err) { await t.rollback(); next(err); }
};

// GET /daily-stock-report/history - past reports with their totals and status.
export const listReports = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    const branch_id = req.query.branch_id || req.scope.branch_id;
    if (branch_id) where.branch_id = branch_id;

    const reports = await DailyStockReport.findAll({
      where, include: [DailyStockReportLine], order: [['report_date', 'DESC']], limit: 60,
    });
    res.json(reports.map((r) => ({
      id: r.id, report_date: r.report_date, status: r.status,
      totals: withTotals(r.DailyStockReportLines.map(lineJson)),
      signed_by: [r.signature_1_name, r.signature_2_name].filter(Boolean),
    })));
  } catch (err) { next(err); }
};
