// controllers/locationController.js
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';

const { Location, Item } = db;
const MAX_LEVEL = 5;

export const createLocation = async (req, res, next) => {
  try {
    const { name, parent_id } = req.body;
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);

    let level = 1;
    if (parent_id) {
      const parent = await Location.findOne({ where: { id: parent_id, tenant_id: req.scope.tenant_id, branch_id } });
      if (!parent) throw new AppError('Parent location not found', 404);
      if (parent.level >= MAX_LEVEL) throw new AppError(`Cannot nest deeper than ${MAX_LEVEL} levels`, 400);
      level = parent.level + 1;
    }

    const location = await Location.create({ tenant_id: req.scope.tenant_id, branch_id, parent_id: parent_id || null, name, level });
    res.status(201).json(location);
  } catch (err) { next(err); }
};

export const listLocations = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.query.branch_id) where.branch_id = req.query.branch_id;
    else if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const locations = await Location.findAll({ where, order: [['level', 'ASC'], ['name', 'ASC']] });
    res.json(locations);
  } catch (err) { next(err); }
};

export const deleteLocation = async (req, res, next) => {
  try {
    const location = await Location.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!location) throw new AppError('Location not found', 404);

    const childCount = await Location.count({ where: { parent_id: location.id } });
    if (childCount > 0) throw new AppError('Cannot delete: this location has child locations inside it', 409);

    const itemCount = await Item.count({ where: { location_id: location.id } });
    if (itemCount > 0) throw new AppError('Cannot delete: this location still has items stored inside it', 409);

    await location.destroy();
    res.status(204).send();
  } catch (err) { next(err); }
};