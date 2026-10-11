// models/item.js
// An Item is just a "stock lot / physical entry". The design, name, type, gender and metal all
// live on ProductMaster, which is the single source of truth. That is why adding BULK stock of
// the same design again does NOT create a new row - the quantity is merged into the existing
// row instead (see itemController.createItemInternal).
export default (sequelize, DataTypes) => {
  const Item = sequelize.define('Item', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    location_id: { type: DataTypes.INTEGER, allowNull: false },
    product_master_id: { type: DataTypes.INTEGER, allowNull: false },

    mode: { type: DataTypes.ENUM('BULK', 'PIECE'), allowNull: false },

    huid_code: { type: DataTypes.STRING(6), allowNull: true },
    barcode_value: { type: DataTypes.STRING, allowNull: true, unique: true },
    qr_code_data_url: { type: DataTypes.TEXT, allowNull: true },
    low_stock_threshold: { type: DataTypes.DECIMAL(10, 3), allowNull: true },

    status: {
      type: DataTypes.ENUM(
        'IN_STOCK', 'SOLD', 'RESERVED', 'IN_TRANSIT',
        'IN_REPAIR', 'DAMAGED', 'RETURNED', 'TRANSFERRED'
      ),
      defaultValue: 'IN_STOCK',
    },

    source_type: {
      type: DataTypes.ENUM('SUPPLIER_PURCHASE', 'BRANCH_TRANSFER', 'DIRECT_ENTRY', 'MANUFACTURING'),
      allowNull: false,
      defaultValue: 'DIRECT_ENTRY',
    },
    source_reference_id: { type: DataTypes.INTEGER, allowNull: true },

    // The sales channel this stock came in on. An item is EITHER retail stock OR wholesale
    // stock - never both. Whichever way it entered inventory is how it is priced and sold.
    channel: { type: DataTypes.ENUM('RETAIL', 'WHOLESALE'), allowNull: false, defaultValue: 'RETAIL' },

    // Kept in sync with `channel` for older screens/queries that still read these flags.
    is_wholesale: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_retail: { type: DataTypes.BOOLEAN, defaultValue: true },

    // Tray display is only about where the stock physically sits, not about pricing.
    is_tray_display: { type: DataTypes.BOOLEAN, defaultValue: false },

    // Set this to override the formula-based price manually for a special piece
    override_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },

    last_moved_at: { type: DataTypes.DATE, allowNull: true }, // used for slow-moving / dead-stock reports
  }, {
    tableName: 'items',
    validate: {
      huidFormat() {
        if (this.huid_code && !/^[A-Za-z0-9]{6}$/.test(this.huid_code)) {
          throw new Error('huid_code must be exactly 6 alphanumeric characters');
        }
      },
      channelIsValid() {
        if (!['RETAIL', 'WHOLESALE'].includes(this.channel)) {
          throw new Error('Channel must be either RETAIL or WHOLESALE');
        }
      },
    },
  });

  // Keep the legacy boolean flags in sync with `channel` so nothing downstream breaks.
  const syncChannelFlags = (item) => {
    if (item.channel === 'WHOLESALE') {
      item.is_wholesale = true;
      item.is_retail = false;
    } else {
      item.channel = 'RETAIL';
      item.is_wholesale = false;
      item.is_retail = true;
    }
  };
  Item.beforeValidate(syncChannelFlags);

  Item.associate = (models) => {
    Item.belongsTo(models.ProductMaster, { foreignKey: 'product_master_id' });
    Item.belongsTo(models.Location, { foreignKey: 'location_id' });
    Item.hasOne(models.BulkItem, { foreignKey: 'item_id' });
    Item.hasOne(models.PieceItem, { foreignKey: 'item_id' });
    Item.hasOne(models.MetalDetail, { foreignKey: 'item_id' });
    Item.hasMany(models.StoneDetail, { foreignKey: 'item_id' });
    Item.hasMany(models.ItemImage, { foreignKey: 'item_id' });
    Item.hasMany(models.StockTransfer, { foreignKey: 'item_id' });
    Item.hasMany(models.StockMovement, { foreignKey: 'item_id' });
    Item.hasMany(models.StockReservation, { foreignKey: 'item_id' });
    Item.hasMany(models.RepairOrder, { foreignKey: 'item_id' });
    Item.hasMany(models.SaleItem, { foreignKey: 'item_id' });
  };

  return Item;
};
