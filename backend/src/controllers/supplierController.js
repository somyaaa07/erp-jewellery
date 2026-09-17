// controllers/supplierController.js (redesigned from vendorController.js)
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { Supplier, SupplierLedger } = db;

export const createSupplier = async (req, res, next) => {
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);
    if (!req.body.name) throw new AppError('name is required', 400);

    const supplier = await Supplier.create({
      tenant_id: req.scope.tenant_id, branch_id,
      name: req.body.name, gstin: req.body.gstin, phone: req.body.phone,
      email: req.body.email, address: req.body.address, opening_balance: req.body.opening_balance || 0,
    });

    await SupplierLedger.create({ supplier_id: supplier.id, currency_balance: supplier.opening_balance, pure_metal_balance_24k_grams: 0 });

    res.status(201).json(supplier);
  } catch (err) { next(err); }
};

export const listSuppliers = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const suppliers = await Supplier.findAll({ where, include: [SupplierLedger] });
    res.json(suppliers);
  } catch (err) { next(err); }
};

export const getSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({
      where: { id: req.params.id, tenant_id: req.scope.tenant_id },
      include: [SupplierLedger],
    });
    if (!supplier) throw new AppError('Supplier not found', 404);
    res.json(supplier);
  } catch (err) { next(err); }
};

export const updateSupplier = async (req, res, next) => {
  try {
    const supplier = await Supplier.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!supplier) throw new AppError('Supplier not found', 404);

    ['name', 'gstin', 'phone', 'email', 'address', 'is_active'].forEach((f) => {
      if (req.body[f] !== undefined) supplier[f] = req.body[f];
    });
    await supplier.save();
    res.json(supplier);
  } catch (err) { next(err); }
};
