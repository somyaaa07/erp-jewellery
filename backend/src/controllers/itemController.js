// controllers/itemController.js
// Key behaviour: in BULK mode, if stock of the same design (product_master_id) is already
// IN_STOCK at the same location and on the same channel, NO new Item row is created - the
// quantity and weight are merged into the existing BulkItem/MetalDetail instead. That is what
// fixes the "a second Male Ring row appears even though one already exists" bug.
//
// PIECE mode (unique HUID/serial pieces) always creates its own row, because each one is a
// physically unique piece and must not be merged.
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { generateBarcodeValue, generateSku, generateQrDataUrl, buildItemQrUrl } from '../utils/barcodeGenrator.js';
import { computeChannelPrice, getItemChannel } from '../utils/pricingEngine.js';

const {
  sequelize, Item, BulkItem, PieceItem, MetalDetail, StoneDetail, ItemImage,
  Location, StockTransfer, ProductMaster, Category, StockMovement,
} = db;
const MAX_IMAGES = 5;

async function findExistingBulkItem({ tenant_id, branch_id, location_id, product_master_id, channel, is_tray_display }, transaction) {
  return Item.findOne({
    where: {
      tenant_id, branch_id, location_id, product_master_id, mode: 'BULK', status: 'IN_STOCK',
      channel, is_tray_display: !!is_tray_display,
    },
    include: [BulkItem, MetalDetail],
    transaction,
  });
}

// An item belongs to exactly one channel. Accept `channel` directly, or fall back to the older
// is_wholesale/is_retail flags so existing callers keep working.
function resolveIncomingChannel({ channel, is_wholesale, is_retail }) {
  if (channel && ['RETAIL', 'WHOLESALE'].includes(String(channel).toUpperCase())) {
    return String(channel).toUpperCase();
  }
  if (is_wholesale && !is_retail) return 'WHOLESALE';
  return 'RETAIL';
}

// Reusable core logic - both purchaseController and stockTransferController import this.
export async function createItemInternal(payload, { transaction, userId }) {
  const {
    tenant_id, branch_id, location_id, product_master_id, huid_code, low_stock_threshold,
    total_pieces, total_gross_weight, total_net_weight,
    gross_weight, less_weight,
    purity, base_core_weight, precious_overlay_weight,
    stones, image_urls,
    source_type, source_reference_id,
    channel: rawChannel, is_wholesale, is_retail, is_tray_display,
    status, mode,
  } = payload;

  const channel = resolveIncomingChannel({ channel: rawChannel, is_wholesale, is_retail });

  if (!['BULK', 'PIECE'].includes(mode)) throw new AppError('mode must be BULK or PIECE', 400);
  if (!product_master_id) throw new AppError('product_master_id is required (link to a Design/Product first)', 400);
  if (image_urls && image_urls.length > MAX_IMAGES) throw new AppError(`Maximum ${MAX_IMAGES} images allowed`, 400);

  const location = await Location.findOne({ where: { id: location_id, tenant_id, branch_id }, transaction });
  if (!location) throw new AppError('Invalid location_id for this branch', 404);

  const product = await ProductMaster.findOne({ where: { id: product_master_id, tenant_id }, transaction });
  if (!product) throw new AppError('Invalid product_master_id', 404);

  const effectivePurity = purity || product.default_purity;

  // ---- THE FIX: in BULK mode, find existing stock and merge into it instead of creating a new row ----
  if (mode === 'BULK') {
    const existing = await findExistingBulkItem(
      { tenant_id, branch_id, location_id, product_master_id, channel, is_tray_display },
      transaction
    );

    if (existing) {
      if (!total_pieces || !total_gross_weight || !total_net_weight) {
        throw new AppError('total_pieces, total_gross_weight, total_net_weight required for BULK mode', 400);
      }

      existing.BulkItem.total_pieces = Number(existing.BulkItem.total_pieces) + Number(total_pieces);
      existing.BulkItem.total_gross_weight = Number(existing.BulkItem.total_gross_weight) + Number(total_gross_weight);
      existing.BulkItem.total_net_weight = Number(existing.BulkItem.total_net_weight) + Number(total_net_weight);
      await existing.BulkItem.save({ transaction });

      if (existing.MetalDetail) {
        existing.MetalDetail.gross_weight = Number(existing.MetalDetail.gross_weight) + Number(total_gross_weight);
        await existing.MetalDetail.save({ transaction });
      }

      existing.last_moved_at = new Date();
      await existing.save({ transaction, userId });

      await StockMovement.create({
        tenant_id, branch_id, item_id: existing.id, movement_type: source_type === 'SUPPLIER_PURCHASE' ? 'PURCHASE' : 'ADJUSTMENT',
        quantity_change: Number(total_pieces), weight_change: Number(total_gross_weight),
        to_location_id: location_id, reference_type: source_type || 'DIRECT_ENTRY', reference_id: source_reference_id || null,
        created_by: userId || null,
      }, { transaction });

      return existing;
    }
  }

  let sku = null;
  if (mode === 'PIECE') sku = generateSku();
  const barcodeSeedWeight = mode === 'BULK' ? total_gross_weight : gross_weight;
  const barcode_value = generateBarcodeValue({ sku: sku || `BULK-${Date.now()}`, grossWeight: barcodeSeedWeight, purity: effectivePurity });

  const item = await Item.create({
    tenant_id, branch_id, location_id, product_master_id, mode,
    huid_code: huid_code || null,
    barcode_value,
    low_stock_threshold: low_stock_threshold || null,
    status: status || 'IN_STOCK',
    source_type: source_type || 'DIRECT_ENTRY',
    source_reference_id: source_reference_id || null,
    channel,
    is_wholesale: channel === 'WHOLESALE',
    is_retail: channel === 'RETAIL',
    is_tray_display: !!is_tray_display,
    last_moved_at: new Date(),
  }, { transaction, userId });

  const qr_code_data_url = await generateQrDataUrl(buildItemQrUrl(item.id));
  await item.update({ qr_code_data_url }, { transaction });

  if (mode === 'BULK') {
    if (!total_pieces || !total_gross_weight || !total_net_weight) {
      throw new AppError('total_pieces, total_gross_weight, total_net_weight required for BULK mode', 400);
    }
    await BulkItem.create({ item_id: item.id, total_pieces, total_gross_weight, total_net_weight }, { transaction });
  } else {
    if (!gross_weight) throw new AppError('gross_weight is required for PIECE mode', 400);
    await PieceItem.create({ item_id: item.id, sku, gross_weight, less_weight: less_weight || 0 }, { transaction });
  }

  await MetalDetail.create({
    item_id: item.id, metal_type: product.metal_type, purity: effectivePurity,
    gross_weight: mode === 'BULK' ? total_gross_weight : gross_weight,
    less_weight: less_weight || 0,
    base_core_weight: product.metal_type === 'BANDHEL' ? base_core_weight : null,
    precious_overlay_weight: product.metal_type === 'BANDHEL' ? precious_overlay_weight : null,
  }, { transaction });

  if (Array.isArray(stones) && stones.length > 0) {
    await StoneDetail.bulkCreate(stones.map((s) => ({ ...s, item_id: item.id })), { transaction });
  }

  if (Array.isArray(image_urls) && image_urls.length > 0) {
    await ItemImage.bulkCreate(
      image_urls.map((url, idx) => ({ item_id: item.id, image_url: url, sort_order: idx })),
      { transaction }
    );
  }

  await StockMovement.create({
    tenant_id, branch_id, item_id: item.id,
    movement_type: source_type === 'SUPPLIER_PURCHASE' ? 'PURCHASE' : 'ADJUSTMENT',
    quantity_change: mode === 'BULK' ? Number(total_pieces) : 1,
    weight_change: mode === 'BULK' ? Number(total_gross_weight) : Number(gross_weight),
    to_location_id: location_id, reference_type: source_type || 'DIRECT_ENTRY', reference_id: source_reference_id || null,
    created_by: userId || null,
  }, { transaction });

  return item;
}

const FULL_INCLUDE = [
  { model: ProductMaster, include: [Category] }, BulkItem, PieceItem, MetalDetail, StoneDetail, ItemImage, Location,
];

export const createItem = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const branch_id = req.scope.branch_id || req.body.branch_id;
    if (!branch_id) throw new AppError('branch_id is required', 400);

    const item = await createItemInternal(
      { ...req.body, tenant_id: req.scope.tenant_id, branch_id, source_type: req.body.source_type || 'DIRECT_ENTRY' },
      { transaction: t, userId: req.user.id }
    );

    await t.commit();

    const fullItem = await Item.findByPk(item.id, { include: FULL_INCLUDE });
    res.status(201).json(fullItem);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

export const uploadItemImages = async (req, res, next) => {
  try {
    const item = await Item.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!item) throw new AppError('Item not found', 404);

    const files = req.files || [];
    if (files.length === 0) throw new AppError('No images uploaded', 400);

    const existingCount = await ItemImage.count({ where: { item_id: item.id } });
    if (existingCount + files.length > MAX_IMAGES) {
      throw new AppError(`Maximum ${MAX_IMAGES} images allowed per item (already has ${existingCount})`, 400);
    }

    const created = await ItemImage.bulkCreate(
      files.map((file, idx) => ({
        item_id: item.id,
        image_url: `/uploads/items/${file.filename}`,
        sort_order: existingCount + idx,
      }))
    );

    res.status(201).json(created);
  } catch (err) { next(err); }
};

export const deleteItemImage = async (req, res, next) => {
  try {
    const item = await Item.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!item) throw new AppError('Item not found', 404);

    const image = await ItemImage.findOne({ where: { id: req.params.imageId, item_id: item.id } });
    if (!image) throw new AppError('Image not found', 404);

    await image.destroy();
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const listItems = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;
    if (req.query.location_id) where.location_id = req.query.location_id;
    if (req.query.status) where.status = req.query.status;
    if (req.query.source_type) where.source_type = req.query.source_type;

    const channelFilter = req.query.channel || req.query.category;
    if (channelFilter === 'WHOLESALE') where.channel = 'WHOLESALE';
    if (channelFilter === 'RETAIL') where.channel = 'RETAIL';
    if (channelFilter === 'TRAY') where.is_tray_display = true;

    const items = await Item.findAll({
      where,
      include: FULL_INCLUDE,
      order: [['created_at', 'DESC']],
    });

    // Show the live price on the list view. Each item is priced only for its own channel.
    const withPricing = await Promise.all(items.map(async (item) => {
      const json = item.toJSON();
      json.channel = getItemChannel(item);
      json.pricing = await computeChannelPrice(item);
      return json;
    }));

    res.json(withPricing);
  } catch (err) { next(err); }
};

export const getItemByBarcode = async (req, res, next) => {
  try {
    const item = await Item.findOne({
      where: { barcode_value: req.params.barcode, tenant_id: req.scope.tenant_id },
      include: FULL_INCLUDE,
    });
    if (!item) throw new AppError('Item not found for this barcode', 404);

    const json = item.toJSON();
    json.channel = getItemChannel(item);
    json.pricing = await computeChannelPrice(item);
    res.json(json);
  } catch (err) { next(err); }
};

export const getItem = async (req, res, next) => {
  try {
    const item = await Item.findOne({
      where: { id: req.params.id, tenant_id: req.scope.tenant_id },
      include: FULL_INCLUDE,
    });
    if (!item) throw new AppError('Item not found', 404);

    const json = item.toJSON();
    json.channel = getItemChannel(item);
    json.pricing = await computeChannelPrice(item);
    res.json(json);
  } catch (err) { next(err); }
};

// GET /items/:id/price - a lightweight endpoint for when only the live price is needed (POS / quick check)
export const getItemPrice = async (req, res, next) => {
  try {
    const item = await Item.findOne({
      where: { id: req.params.id, tenant_id: req.scope.tenant_id },
      include: [{ model: ProductMaster, include: [Category] }, MetalDetail, StoneDetail, BulkItem],
    });
    if (!item) throw new AppError('Item not found', 404);

    const pricing = await computeChannelPrice(item);
    res.json(pricing);
  } catch (err) { next(err); }
};

export const updateItem = async (req, res, next) => {
  try {
    const item = await Item.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!item) throw new AppError('Item not found', 404);

    ['location_id', 'low_stock_threshold', 'status', 'channel', 'is_tray_display', 'override_price']
      .forEach((field) => { if (req.body[field] !== undefined) item[field] = req.body[field]; });

    await item.save({ userId: req.user.id });
    res.json(item);
  } catch (err) { next(err); }
};

export const lowStockAlerts = async (req, res, next) => {
  try {
    const where = { tenant_id: req.scope.tenant_id, mode: 'BULK' };
    if (req.scope.branch_id) where.branch_id = req.scope.branch_id;

    const items = await Item.findAll({ where, include: [{ model: BulkItem, required: true }, { model: ProductMaster, include: [Category] }] });
    const lowStock = items.filter((i) => (
      i.low_stock_threshold != null && i.BulkItem && i.BulkItem.total_pieces <= i.low_stock_threshold
    ));
    res.json(lowStock);
  } catch (err) { next(err); }
};

export const getItemTransferHistory = async (req, res, next) => {
  try {
    const item = await Item.findOne({ where: { id: req.params.id, tenant_id: req.scope.tenant_id } });
    if (!item) throw new AppError('Item not found', 404);

    const { Op } = await import('sequelize');
    const history = await StockTransfer.findAll({
      where: { tenant_id: req.scope.tenant_id, [Op.or]: [{ item_id: item.id }, { original_item_id: item.id }] },
      order: [['created_at', 'ASC']],
    });
    res.json(history);
  } catch (err) { next(err); }
};
