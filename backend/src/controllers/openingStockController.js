// controllers/openingStockController.js
// Opening stock lives in the "Designs & Categories" screen. It is entered once per design,
// weight-wise only (grams), and feeds the wholesale store so that:
//     Closing = Opening + Purchase (Addition) - Sale
// The category is taken from the design, so category totals are the sum of their designs.
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { createItemInternal, resolveWholesaleHome } from './itemController.js';

const { sequelize, OpeningStock, ProductMaster, Category, Location, Item, BulkItem, MetalDetail, StockMovement } = db;

const dayStart = (dateStr) => new Date(`${dateStr}T00:00:00`);
const round3 = (n) => Number(Number(n).toFixed(3));

function resolveBranch(req) {
  const branch_id = req.scope.branch_id || req.body?.branch_id || req.query?.branch_id;
  if (!branch_id) throw new AppError('branch_id is required', 400);
  return Number(branch_id);
}

export const createOpeningStock = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch_id = resolveBranch(req);
    const { product_master_id, opening_weight, as_on_date, notes } = req.body;
    const pieces = Number(req.body.opening_pieces || 0);
    if (!Number.isInteger(pieces) || pieces < 0) throw new AppError('Quantity must be a whole number (0 or more)', 400);

    if (!product_master_id) throw new AppError('Design is required', 400);
    const weight = Number(opening_weight);
    if (!(weight > 0)) throw new AppError('Opening weight (grams) must be greater than 0', 400);
    if (!as_on_date || Number.isNaN(dayStart(as_on_date).getTime())) throw new AppError('A valid "as on" date is required', 400);

    const product = await ProductMaster.findOne({ where: { id: product_master_id, tenant_id: req.scope.tenant_id }, transaction: t });
    if (!product) throw new AppError('Design not found', 404);

    const existing = await OpeningStock.findOne({
      where: { tenant_id: req.scope.tenant_id, branch_id, product_master_id },
      transaction: t,
    });
    if (existing) {
      throw new AppError('Opening stock for this design is already entered. Ask an admin to correct it instead of adding it again.', 409);
    }

    // Stock joins the lot the design already has (so no second lot appears), or the chosen box.
    const homeId = await resolveWholesaleHome({
      tenant_id: req.scope.tenant_id, branch_id, product_master_id, preferred: req.body.box_location_id || null,
    }, t);

    const opening = await OpeningStock.create({
      tenant_id: req.scope.tenant_id, branch_id, category_id: product.category_id, product_master_id,
      opening_pieces: pieces, opening_weight: round3(weight), as_on_date, notes: notes || null, created_by: req.user.id,
    }, { transaction: t });

    const item = await createItemInternal({
      tenant_id: req.scope.tenant_id, branch_id, location_id: homeId, product_master_id,
      mode: 'BULK', total_pieces: pieces, total_gross_weight: weight, total_net_weight: weight,
      source_type: 'DIRECT_ENTRY', source_reference_id: opening.id,
      movement_reference_type: 'OPENING_STOCK', movement_date: dayStart(as_on_date),
      channel: 'WHOLESALE',
    }, { transaction: t, userId: req.user.id });

    opening.item_id = item.id;
    await opening.save({ transaction: t });

    await t.commit();
    res.status(201).json(opening);
  } catch (err) { await t.rollback(); next(err); }
};

export const listOpeningStock = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    const branch_id = req.query.branch_id || req.scope.branch_id;
    if (branch_id) where.branch_id = branch_id;

    const rows = await OpeningStock.findAll({
      where,
      include: [{ model: ProductMaster, attributes: ['id', 'design_code', 'product_name'] }, { model: Category, attributes: ['id', 'name', 'code'] }],
      order: [['as_on_date', 'DESC'], ['id', 'DESC']],
    });

    const byCategory = {};
    rows.forEach((r) => {
      const key = r.category_id;
      if (!byCategory[key]) byCategory[key] = { category_id: key, category_name: r.Category?.name || '', opening_weight: 0 };
      byCategory[key].opening_weight = round3(byCategory[key].opening_weight + Number(r.opening_weight));
      byCategory[key].opening_pieces += Number(r.opening_pieces || 0);
    });

    res.json({
      rows,
      category_totals: Object.values(byCategory).sort((a, b) => a.category_name.localeCompare(b.category_name)),
      total_opening_weight: round3(rows.reduce((sum, r) => sum + Number(r.opening_weight), 0)),
    });
  } catch (err) { next(err); }
};

// Correct an opening entry. Admin only (enforced in the route). The wholesale stock and the
// ledger entry are corrected by exactly the difference, so history stays consistent.
export const updateOpeningStock = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const opening = await OpeningStock.findOne({
      where: { id: req.params.id, tenant_id: req.scope.tenant_id }, transaction: t, lock: true,
    });
    if (!opening) throw new AppError('Opening stock entry not found', 404);

    const newWeight = Number(req.body.opening_weight);
    if (!(newWeight > 0)) throw new AppError('Opening weight (grams) must be greater than 0', 400);
    const newPieces = req.body.opening_pieces === undefined ? Number(opening.opening_pieces || 0) : Number(req.body.opening_pieces);
    if (!Number.isInteger(newPieces) || newPieces < 0) throw new AppError('Quantity must be a whole number (0 or more)', 400);
    const delta = round3(newWeight - Number(opening.opening_weight));
    const pieceDelta = newPieces - Number(opening.opening_pieces || 0);

    if (delta !== 0 || pieceDelta !== 0) {
      const item = await Item.findOne({ where: { id: opening.item_id }, include: [BulkItem, MetalDetail], transaction: t, lock: true });
      if (!item?.BulkItem) throw new AppError('The wholesale stock behind this entry was not found', 409);

      const newGross = round3(Number(item.BulkItem.total_gross_weight) + delta);
      if (newGross < 0) {
        throw new AppError('Cannot lower the opening weight below what has already been sold or moved from this design.', 409);
      }
      const newLotPieces = Number(item.BulkItem.total_pieces) + pieceDelta;
      if (newLotPieces < 0) throw new AppError('Cannot lower the quantity below what has already been sold or moved from this design.', 409);
      item.BulkItem.total_pieces = newLotPieces;
      item.BulkItem.total_gross_weight = newGross;
      item.BulkItem.total_net_weight = round3(Number(item.BulkItem.total_net_weight) + delta);
      await item.BulkItem.save({ transaction: t });
      if (item.MetalDetail) {
        item.MetalDetail.gross_weight = round3(Number(item.MetalDetail.gross_weight) + delta);
        await item.MetalDetail.save({ transaction: t });
      }

      const movement = await StockMovement.findOne({
        where: { tenant_id: req.scope.tenant_id, item_id: item.id, reference_type: 'OPENING_STOCK', reference_id: opening.id },
        transaction: t,
      });
      if (movement) {
        movement.weight_change = round3(Number(movement.weight_change) + delta);
        movement.quantity_change = Number(movement.quantity_change) + pieceDelta;
        await movement.save({ transaction: t });
      }
    }

    opening.opening_weight = round3(newWeight);
    opening.opening_pieces = newPieces;
    if (req.body.notes !== undefined) opening.notes = req.body.notes || null;
    await opening.save({ transaction: t });

    await t.commit();
    res.json(opening);
  } catch (err) { await t.rollback(); next(err); }
};
