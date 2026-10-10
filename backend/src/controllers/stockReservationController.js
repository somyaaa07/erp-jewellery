// controllers/stockReservationController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { sequelize, StockReservation, Item, Customer } = db;

export const createReservation = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const { item_id, reserved_for_customer_id, expires_at, notes } = req.body;

    const item = await Item.findOne({ where: { id: item_id, tenant_id: req.scope.tenant_id }, transaction: t, lock: true });
    if (!item) throw new AppError('Item not found', 404);
    if (item.status !== 'IN_STOCK') throw new AppError('Only in-stock items can be reserved', 409);

    item.status = 'RESERVED';
    await item.save({ transaction: t, userId: req.user.id });

    const reservation = await StockReservation.create({
      tenant_id: req.scope.tenant_id, item_id, reserved_for_customer_id: reserved_for_customer_id || null,
      reserved_by_user_id: req.user.id, expires_at: expires_at || null, notes: notes || null,
    }, { transaction: t });

    await t.commit();
    res.status(201).json(reservation);
  } catch (err) { await t.rollback(); next(err); }
};

export const releaseReservation = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const reservation = await StockReservation.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id }, transaction: t });
    if (!reservation) throw new AppError('Reservation not found', 404);
    if (reservation.status !== 'ACTIVE') throw new AppError('Reservation is not active', 409);

    const item = await Item.findByPk(reservation.item_id, { transaction: t });
    item.status = 'IN_STOCK';
    await item.save({ transaction: t, userId: req.user.id });

    reservation.status = 'RELEASED';
    await reservation.save({ transaction: t });

    await t.commit();
    res.json(reservation);
  } catch (err) { await t.rollback(); next(err); }
};

export const listReservations = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.query.status) where.status = req.query.status;

    const reservations = await StockReservation.findAll({ where, include: [Item, Customer], order: [['reserved_at', 'DESC']] });
    res.json(reservations);
  } catch (err) { next(err); }
};
