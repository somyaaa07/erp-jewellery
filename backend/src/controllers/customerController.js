// controllers/customerController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { Customer, Sale } = db;

export const createCustomer = async (req, res, next) => {
  try {
    const { name, phone, email, address, gstin, opening_balance } = req.body;
    if (!name || !String(name).trim()) throw new AppError('Customer name is required', 400);
    if (!phone || !String(phone).trim()) throw new AppError('Phone number is required', 400);

    const existing = await Customer.findOne({
      where: { tenant_id: req.scope.tenant_id, phone: String(phone).trim() },
    });
    if (existing) {
      // The (tenant_id, phone) pair is unique, so tell the user plainly instead of
      // letting a raw database constraint error bubble up to the screen.
      throw new AppError(`A customer with the phone number ${phone} already exists (${existing.name})`, 409);
    }

    const customer = await Customer.create({
      tenant_id: req.scope.tenant_id,
      name: String(name).trim(),
      phone: String(phone).trim(),
      email: email || null,
      address: address || null,
      gstin: gstin || null,
      opening_balance: opening_balance || 0,
    });
    res.status(201).json(customer);
  } catch (err) { next(err); }
};

export const listCustomers = async (req, res, next) => {
  try {
    const { Op } = await import('sequelize');
    const where = { tenant_id: req.scope.tenant_id };
    if (req.query.include_inactive !== 'true') where.is_active = true;

    if (req.query.search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${req.query.search}%` } },
        { phone: { [Op.like]: `%${req.query.search}%` } },
        { email: { [Op.like]: `%${req.query.search}%` } },
      ];
    }

    const customers = await Customer.findAll({ where, order: [['name', 'ASC']] });

    // Attach a light purchase summary so the list is useful on its own.
    const withStats = await Promise.all(customers.map(async (c) => {
      const json = c.toJSON();
      try {
        const sales = await Sale.findAll({
          where: { tenant_id: req.scope.tenant_id, customer_id: c.id, status: 'CONFIRMED' },
          attributes: ['total_amount', 'sale_date'],
        });
        json.total_purchases = sales.length;
        json.total_spent = Math.round(sales.reduce((sum, s) => sum + Number(s.total_amount || 0), 0) * 100) / 100;
        json.last_purchase_date = sales.length
          ? sales.map((s) => s.sale_date).sort().slice(-1)[0]
          : null;
      } catch {
        json.total_purchases = 0;
        json.total_spent = 0;
        json.last_purchase_date = null;
      }
      return json;
    }));

    res.json(withStats);
  } catch (err) { next(err); }
};

export const getCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!customer) throw new AppError('Customer not found', 404);

    const sales = await Sale.findAll({
      where: { tenant_id: req.scope.tenant_id, customer_id: customer.id },
      order: [['created_at', 'DESC']],
      limit: 50,
    });

    res.json({ ...customer.toJSON(), sales });
  } catch (err) { next(err); }
};

export const updateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!customer) throw new AppError('Customer not found', 404);

    if (req.body.phone && req.body.phone !== customer.phone) {
      const clash = await Customer.findOne({
        where: { tenant_id: req.scope.tenant_id, phone: String(req.body.phone).trim() },
      });
      if (clash) throw new AppError(`Another customer already uses the phone number ${req.body.phone}`, 409);
    }

    ['name', 'phone', 'email', 'address', 'gstin', 'is_active'].forEach((f) => {
      if (req.body[f] !== undefined) customer[f] = req.body[f];
    });
    await customer.save();
    res.json(customer);
  } catch (err) { next(err); }
};

// Customers are never hard-deleted - their old invoices must stay intact. We deactivate instead.
export const deactivateCustomer = async (req, res, next) => {
  try {
    const customer = await Customer.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!customer) throw new AppError('Customer not found', 404);

    customer.is_active = false;
    await customer.save();
    res.json({ success: true, message: `${customer.name} has been deactivated` });
  } catch (err) { next(err); }
};
