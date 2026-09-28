// controllers/itemController.js
// Key behaviour: in BULK mode, if stock of the same design (product_master_id) is already
// IN_STOCK at the same location, NO new Item row is created - the quantity and weight are
// merged into the existing BulkItem/MetalDetail instead. That is what fixes the "a second Male
// Ring row appears even though one already exists" bug.
//
// STORAGE MODEL (changed): there is only ONE physical storage now - the wholesale store.
// Every new BULK lot lands entirely in BulkItem's wholesale bucket (total_pieces /
// total_gross_weight / total_net_weight) with tray_pieces = 0. The display tray is not a second
// place stock gets created in - stock only ever reaches the tray by being explicitly MOVED
// there out of the wholesale bucket (see moveToTray below). That move is a real transfer:
// wholesale bucket goes down, tray bucket goes up.
//
// PIECE mode (unique HUID/serial pieces) always creates its own row, because each one is a
// physically unique piece and must not be merged. A PIECE item is either sitting in the
// wholesale store or on the tray - never both - tracked via `is_tray_display` + `location_id`.
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import { generateBarcodeValue, generateSku, generateQrDataUrl, buildItemQrUrl } from '../utils/barcodeGenrator.js';
import { computeItemPrice, computeChannelPrice, getItemChannel } from '../utils/pricingEngine.js';

const {
  sequelize, Item, BulkItem, PieceItem, MetalDetail, StoneDetail, ItemImage,
  Location, StockTransfer, ProductMaster, Category, StockMovement,
} = db;
const MAX_IMAGES = 5;

// Same design + same location = same row. Tray display is a separate bucket inside that one
// row (BulkItem.tray_*), not a separate row - a fresh purchase always merges into the
// wholesale bucket regardless of how much of the existing lot is currently on tray.
async function findExistingBulkItem({ tenant_id, branch_id, location_id, product_master_id }, transaction) {
  return Item.findOne({
    where: {
      tenant_id, branch_id, location_id, product_master_id, mode: 'BULK', status: 'IN_STOCK',
    },
    include: [BulkItem, MetalDetail],
    transaction,
  });
}

// Storage is single-channel now: every new item is WHOLESALE stock by default. `channel` is
// kept on the Item row only for backward compatibility with older reports/screens - it does
// NOT decide where a sale is priced from any more (see saleController: pricing is decided by
// which bucket - tray or wholesale - the sale line actually draws from).
function resolveIncomingChannel({ channel, is_wholesale, is_retail }) {
  if (channel && ['RETAIL', 'WHOLESALE'].includes(String(channel).toUpperCase())) {
    return String(channel).toUpperCase();
  }
  if (is_retail && !is_wholesale) return 'RETAIL';
  return 'WHOLESALE';
}

// Checks a WHOLESALE_STORE (or TRAY_DISPLAY) location's fixed capacity before letting more
// weight/pieces land inside it. `currentPieces`/`currentWeight` is what the container already
// holds (before this addition); `incoming*` is what is about to be added.
function assertCapacity(location, { currentPieces = 0, currentWeight = 0, incomingPieces = 0, incomingWeight = 0 }) {
  if (!location) return;
  if (location.capacity_pieces != null && currentPieces + incomingPieces > location.capacity_pieces) {
    throw new AppError(
      `"${location.name}" can only hold ${location.capacity_pieces} pieces (already has ${currentPieces}, tried to add ${incomingPieces}).`,
      400
    );
  }
  if (location.capacity_weight != null && currentWeight + incomingWeight > Number(location.capacity_weight)) {
    throw new AppError(
      `"${location.name}" can only hold ${location.capacity_weight}g (already has ${currentWeight}g, tried to add ${incomingWeight}g).`,
      400
    );
  }
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
      { tenant_id, branch_id, location_id, product_master_id },
      transaction
    );

    if (existing) {
      if (!total_pieces || !total_gross_weight || !total_net_weight) {
        throw new AppError('total_pieces, total_gross_weight, total_net_weight required for BULK mode', 400);
      }

      // Fresh stock always lands in the WHOLESALE bucket, never on the tray directly - moving
      // some of it to the tray afterwards is a separate, explicit action (see moveToTray).
      if (location.storage_type === 'WHOLESALE_STORE') {
        assertCapacity(location, {
          currentPieces: Number(existing.BulkItem.total_pieces),
          currentWeight: Number(existing.BulkItem.total_gross_weight),
          incomingPieces: Number(total_pieces),
          incomingWeight: Number(total_gross_weight),
        });
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
    // Every new item - BULK or PIECE - starts out in the wholesale store, never on the tray.
    // It only reaches the tray via an explicit move-to-tray action afterwards.
    is_tray_display: false,
    last_moved_at: new Date(),
  }, { transaction, userId });

  const qr_code_data_url = await generateQrDataUrl(buildItemQrUrl(item.id));
  await item.update({ qr_code_data_url }, { transaction });

  if (mode === 'BULK') {
    if (!total_pieces || !total_gross_weight || !total_net_weight) {
      throw new AppError('total_pieces, total_gross_weight, total_net_weight required for BULK mode', 400);
    }
    if (location.storage_type === 'WHOLESALE_STORE') {
      assertCapacity(location, { incomingPieces: Number(total_pieces), incomingWeight: Number(total_gross_weight) });
    }
    await BulkItem.create({
      item_id: item.id, total_pieces, total_gross_weight, total_net_weight,
      tray_pieces: 0, tray_gross_weight: 0, tray_net_weight: 0,
    }, { transaction });
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

// Builds a minimal stand-in for `item` with BulkItem swapped to just one bucket's numbers, so
// computeItemPrice (which only ever looks at BulkItem.total_pieces/total_gross_weight/
// total_net_weight) prices that bucket alone.
function bucketView(item, pieces, gross, net) {
  return {
    tenant_id: item.tenant_id,
    branch_id: item.branch_id,
    mode: item.mode,
    override_price: item.override_price,
    ProductMaster: item.ProductMaster,
    MetalDetail: item.MetalDetail,
    StoneDetails: item.StoneDetails,
    BulkItem: { total_pieces: pieces, total_gross_weight: gross, total_net_weight: net },
  };
}

// Prices BOTH buckets of an item separately: whatever sits in the wholesale store prices at the
// WHOLESALE profile, whatever sits on the display tray prices at the RETAIL profile. A bucket
// with zero quantity is left null - there is nothing there to price.
export async function computeBucketPricing(item) {
  const result = { wholesale: null, tray: null };

  if (item.mode === 'BULK' && item.BulkItem) {
    const wPieces = Number(item.BulkItem.total_pieces || 0);
    const tPieces = Number(item.BulkItem.tray_pieces || 0);

    if (wPieces > 0) {
      try {
        result.wholesale = await computeItemPrice(
          bucketView(item, wPieces, item.BulkItem.total_gross_weight, item.BulkItem.total_net_weight),
          'WHOLESALE'
        );
      } catch (e) { result.wholesale = { error: e.message }; }
    }
    if (tPieces > 0) {
      try {
        result.tray = await computeItemPrice(
          bucketView(item, tPieces, item.BulkItem.tray_gross_weight, item.BulkItem.tray_net_weight),
          'RETAIL'
        );
      } catch (e) { result.tray = { error: e.message }; }
    }
  } else {
    // PIECE mode - the single piece is either in the wholesale store or on the tray, never both.
    const profileType = item.is_tray_display ? 'RETAIL' : 'WHOLESALE';
    try {
      const price = await computeItemPrice(item, profileType);
      if (profileType === 'RETAIL') result.tray = price; else result.wholesale = price;
    } catch (e) {
      const err = { error: e.message };
      if (profileType === 'RETAIL') result.tray = err; else result.wholesale = err;
    }
  }

  return result;
}

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
    // Tray display is a count inside a lot (BulkItem.tray_pieces), not something the row itself
    // can be filtered on directly in SQL, so this is filtered after loading instead.
    const wantTrayOnly = channelFilter === 'TRAY';

    let items = await Item.findAll({
      where,
      include: FULL_INCLUDE,
      order: [['created_at', 'DESC']],
    });

    if (wantTrayOnly) {
      items = items.filter((i) => (
        i.mode === 'PIECE' ? i.is_tray_display : Number(i.BulkItem?.tray_pieces || 0) > 0
      ));
    }

    // Show live prices on the list view - wholesale bucket priced at wholesale rate, tray
    // bucket (if any stock is on display) priced at retail rate.
    const withPricing = await Promise.all(items.map(async (item) => {
      const json = item.toJSON();
      json.channel = getItemChannel(item);
      json.pricing = await computeChannelPrice(item);
      json.bucket_pricing = await computeBucketPricing(item);
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
    json.bucket_pricing = await computeBucketPricing(item);
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
    json.bucket_pricing = await computeBucketPricing(item);
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
    const bucket_pricing = await computeBucketPricing(item);
    res.json({ ...pricing, bucket_pricing });
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
    // Low stock is judged on the grand total (wholesale + tray combined) - stock sitting on the
    // tray is still stock, it just happens to be on display right now.
    const lowStock = items.filter((i) => (
      i.low_stock_threshold != null && i.BulkItem
      && (Number(i.BulkItem.total_pieces) + Number(i.BulkItem.tray_pieces || 0)) <= i.low_stock_threshold
    ));
    res.json(lowStock);
  } catch (err) { next(err); }
};

// Finds this item's tray Location under the same branch (child of the wholesale store, or any
// TRAY_DISPLAY location in the branch if the tree isn't a strict parent/child).
async function findBranchLocationByType(tenant_id, branch_id, storage_type, transaction) {
  return Location.findOne({ where: { tenant_id, branch_id, storage_type }, transaction });
}

// POST /items/:id/move-to-tray
// Moves stock OUT of the wholesale bucket and ONTO the display tray. This is a real transfer,
// not a flag - the wholesale bucket goes down by exactly what the tray bucket goes up by, and
// the tray's own fixed capacity is enforced.
// body (BULK item): { quantity_pieces } or { weight_grams } - one of the two.
// body (PIECE item): {} - the whole piece moves, since it can't be split.
export const moveToTray = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const item = await Item.findOne({
      where: { id: req.params.id, tenant_id: req.scope.tenant_id },
      include: [BulkItem],
      transaction: t, lock: true,
    });
    if (!item) throw new AppError('Item not found', 404);
    if (item.status !== 'IN_STOCK') throw new AppError(`Item is not available to move (status: ${item.status})`, 409);

    const trayLocation = await findBranchLocationByType(item.tenant_id, item.branch_id, 'TRAY_DISPLAY', t);
    if (!trayLocation) throw new AppError('This branch has no Display Tray location set up yet', 404);

    if (item.mode === 'PIECE') {
      if (item.is_tray_display) throw new AppError('This piece is already on the tray', 409);

      // Piece-mode capacity check: how many pieces are already on this tray.
      const trayPieceItems = await Item.count({ where: { tenant_id: item.tenant_id, branch_id: item.branch_id, location_id: trayLocation.id, mode: 'PIECE', status: 'IN_STOCK' }, transaction: t });
      assertCapacity(trayLocation, { currentPieces: trayPieceItems, incomingPieces: 1 });

      item.location_id = trayLocation.id;
      item.is_tray_display = true;
      await item.save({ transaction: t, userId: req.user.id });

      await StockMovement.create({
        tenant_id: item.tenant_id, branch_id: item.branch_id, item_id: item.id, movement_type: 'TRAY_MOVE_OUT',
        quantity_change: 0, weight_change: 0, from_location_id: item.location_id, to_location_id: trayLocation.id,
        reference_type: 'TRAY_TRANSFER', created_by: req.user.id,
      }, { transaction: t });

      await t.commit();
      return res.json(item);
    }

    // BULK item: move a given number of pieces (or a given weight) from wholesale to tray.
    const bulk = item.BulkItem;
    const { quantity_pieces, weight_grams } = req.body;
    if (!quantity_pieces && !weight_grams) {
      throw new AppError('Provide either quantity_pieces or weight_grams to move to the tray', 400);
    }
    if (Number(bulk.total_pieces) <= 0) throw new AppError('There is no wholesale stock left to move for this item', 409);

    const avgNetPerPiece = Number(bulk.total_net_weight) / Number(bulk.total_pieces);
    const avgGrossPerPiece = Number(bulk.total_gross_weight) / Number(bulk.total_pieces);

    let pieces;
    if (quantity_pieces) {
      pieces = Number(quantity_pieces);
      if (pieces <= 0 || pieces > Number(bulk.total_pieces)) {
        throw new AppError(`quantity_pieces must be between 1 and ${bulk.total_pieces} (available in wholesale)`, 400);
      }
    } else {
      // Derive whole pieces from a requested weight - rounds down so we never move more
      // physical weight than asked for.
      pieces = Math.floor(Number(weight_grams) / avgGrossPerPiece);
      if (pieces <= 0) throw new AppError('weight_grams is too small to move even one piece', 400);
      if (pieces > Number(bulk.total_pieces)) pieces = Number(bulk.total_pieces);
    }

    const grossMoved = Number((avgGrossPerPiece * pieces).toFixed(3));
    const netMoved = Number((avgNetPerPiece * pieces).toFixed(3));

    assertCapacity(trayLocation, {
      currentPieces: Number(bulk.tray_pieces),
      currentWeight: Number(bulk.tray_gross_weight),
      incomingPieces: pieces,
      incomingWeight: grossMoved,
    });

    bulk.total_pieces = Number(bulk.total_pieces) - pieces;
    bulk.total_gross_weight = Number(bulk.total_gross_weight) - grossMoved;
    bulk.total_net_weight = Number(bulk.total_net_weight) - netMoved;
    bulk.tray_pieces = Number(bulk.tray_pieces) + pieces;
    bulk.tray_gross_weight = Number(bulk.tray_gross_weight) + grossMoved;
    bulk.tray_net_weight = Number(bulk.tray_net_weight) + netMoved;
    await bulk.save({ transaction: t });

    item.last_moved_at = new Date();
    await item.save({ transaction: t, userId: req.user.id });

    await StockMovement.create({
      tenant_id: item.tenant_id, branch_id: item.branch_id, item_id: item.id, movement_type: 'TRAY_MOVE_OUT',
      quantity_change: -pieces, weight_change: -grossMoved,
      from_location_id: item.location_id, to_location_id: trayLocation.id,
      reference_type: 'TRAY_TRANSFER', created_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    const fullItem = await Item.findByPk(item.id, { include: FULL_INCLUDE });
    res.json(fullItem);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// POST /items/:id/move-to-wholesale - the reverse: pull stock off the tray, back into the
// wholesale bucket. Same validation, mirrored.
export const moveToWholesale = async (req, res, next) => {
  const t = await sequelize.transaction();
  try {
    const item = await Item.findOne({
      where: { id: req.params.id, tenant_id: req.scope.tenant_id },
      include: [BulkItem],
      transaction: t, lock: true,
    });
    if (!item) throw new AppError('Item not found', 404);
    if (item.status !== 'IN_STOCK') throw new AppError(`Item is not available to move (status: ${item.status})`, 409);

    const wholesaleLocation = await findBranchLocationByType(item.tenant_id, item.branch_id, 'WHOLESALE_STORE', t);
    if (!wholesaleLocation) throw new AppError('This branch has no Wholesale Store location set up yet', 404);

    if (item.mode === 'PIECE') {
      if (!item.is_tray_display) throw new AppError('This piece is already in the wholesale store', 409);

      const wholesalePieceItems = await Item.count({ where: { tenant_id: item.tenant_id, branch_id: item.branch_id, location_id: wholesaleLocation.id, mode: 'PIECE', status: 'IN_STOCK' }, transaction: t });
      assertCapacity(wholesaleLocation, { currentPieces: wholesalePieceItems, incomingPieces: 1 });

      item.location_id = wholesaleLocation.id;
      item.is_tray_display = false;
      await item.save({ transaction: t, userId: req.user.id });

      await StockMovement.create({
        tenant_id: item.tenant_id, branch_id: item.branch_id, item_id: item.id, movement_type: 'TRAY_MOVE_IN',
        quantity_change: 0, weight_change: 0, to_location_id: wholesaleLocation.id,
        reference_type: 'TRAY_TRANSFER', created_by: req.user.id,
      }, { transaction: t });

      await t.commit();
      return res.json(item);
    }

    const bulk = item.BulkItem;
    const { quantity_pieces, weight_grams } = req.body;
    if (!quantity_pieces && !weight_grams) {
      throw new AppError('Provide either quantity_pieces or weight_grams to move back to wholesale', 400);
    }
    if (Number(bulk.tray_pieces) <= 0) throw new AppError('There is no tray stock left to move back for this item', 409);

    const avgNetPerPiece = Number(bulk.tray_net_weight) / Number(bulk.tray_pieces);
    const avgGrossPerPiece = Number(bulk.tray_gross_weight) / Number(bulk.tray_pieces);

    let pieces;
    if (quantity_pieces) {
      pieces = Number(quantity_pieces);
      if (pieces <= 0 || pieces > Number(bulk.tray_pieces)) {
        throw new AppError(`quantity_pieces must be between 1 and ${bulk.tray_pieces} (available on tray)`, 400);
      }
    } else {
      pieces = Math.floor(Number(weight_grams) / avgGrossPerPiece);
      if (pieces <= 0) throw new AppError('weight_grams is too small to move even one piece', 400);
      if (pieces > Number(bulk.tray_pieces)) pieces = Number(bulk.tray_pieces);
    }

    const grossMoved = Number((avgGrossPerPiece * pieces).toFixed(3));
    const netMoved = Number((avgNetPerPiece * pieces).toFixed(3));

    assertCapacity(wholesaleLocation, {
      currentPieces: Number(bulk.total_pieces),
      currentWeight: Number(bulk.total_gross_weight),
      incomingPieces: pieces,
      incomingWeight: grossMoved,
    });

    bulk.tray_pieces = Number(bulk.tray_pieces) - pieces;
    bulk.tray_gross_weight = Number(bulk.tray_gross_weight) - grossMoved;
    bulk.tray_net_weight = Number(bulk.tray_net_weight) - netMoved;
    bulk.total_pieces = Number(bulk.total_pieces) + pieces;
    bulk.total_gross_weight = Number(bulk.total_gross_weight) + grossMoved;
    bulk.total_net_weight = Number(bulk.total_net_weight) + netMoved;
    await bulk.save({ transaction: t });

    item.last_moved_at = new Date();
    await item.save({ transaction: t, userId: req.user.id });

    await StockMovement.create({
      tenant_id: item.tenant_id, branch_id: item.branch_id, item_id: item.id, movement_type: 'TRAY_MOVE_IN',
      quantity_change: pieces, weight_change: grossMoved,
      to_location_id: wholesaleLocation.id,
      reference_type: 'TRAY_TRANSFER', created_by: req.user.id,
    }, { transaction: t });

    await t.commit();
    const fullItem = await Item.findByPk(item.id, { include: FULL_INCLUDE });
    res.json(fullItem);
  } catch (err) {
    await t.rollback();
    next(err);
  }
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
