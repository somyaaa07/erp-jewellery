// controllers/categoryController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { Category } = db;

export const createCategory = async (req, res, next) => {
  try {
    const { name, code, gender_applicable } = req.body;
    if (!name || !code) throw new AppError('name and code are required', 400);

    const { Op } = await import('sequelize');
    const existingByName = await Category.findOne({
      where: { tenant_id: req.scope.tenant_id, name: { [Op.like]: name.trim() } },
    });
    if (existingByName) {
      throw new AppError(`A category named "${name}" already exists (code: ${existingByName.code}). Please use that one.`, 409);
    }

    const category = await Category.create({
      tenant_id: req.scope.tenant_id, name: name.trim(), code: code.toUpperCase(), gender_applicable: gender_applicable || 'ALL',
    });
    res.status(201).json(category);
  } catch (err) { next(err); }
};

export const listCategories = async (req, res, next) => {
  try {
    const categories = await Category.findAll({
      where: { tenant_id: req.scope.tenant_id, is_active: true },
      order: [['name', 'ASC']],
    });
    res.json(categories);
  } catch (err) { next(err); }
};

export const updateCategory = async (req, res, next) => {
  try {
    const category = await Category.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!category) throw new AppError('Category not found', 404);

    ['name', 'gender_applicable', 'is_active'].forEach((f) => {
      if (req.body[f] !== undefined) category[f] = req.body[f];
    });
    await category.save();
    res.json(category);
  } catch (err) { next(err); }
};
