// models/displayTrayItem.js
// One individual piece placed in one slot of a display tray. Rows are never deleted: when a
// piece is sold or taken off the tray it is marked with a release date, so the full history
// (when it was added, when it left, and why) is always available.
export default (sequelize, DataTypes) => {
  const DisplayTrayItem = sequelize.define('DisplayTrayItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    tray_id: { type: DataTypes.INTEGER, allowNull: false },
    slot_no: { type: DataTypes.INTEGER, allowNull: false },

    // The inventory piece (Item, PIECE mode) behind this slot. Selling it in Billing, scanning
    // its barcode and pricing all work through that Item.
    item_id: { type: DataTypes.INTEGER, allowNull: true },
    item_code: { type: DataTypes.STRING, allowNull: false }, // unique per store, e.g. LR-0001
    product_master_id: { type: DataTypes.INTEGER, allowNull: false }, // the design
    category_id: { type: DataTypes.INTEGER, allowNull: false },
    weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    // Photo of this exact piece. When empty, the design's default image is shown instead.
    image_url: { type: DataTypes.STRING, allowNull: true },
    huid_code: { type: DataTypes.STRING(6), allowNull: true }, // hallmark ID, individual pieces only

    status: { type: DataTypes.ENUM('ON_DISPLAY', 'SOLD', 'REMOVED'), allowNull: false, defaultValue: 'ON_DISPLAY' },
    date_added: { type: DataTypes.DATEONLY, allowNull: false },
    date_released: { type: DataTypes.DATEONLY, allowNull: true },
    release_reason: { type: DataTypes.STRING, allowNull: true },
    sale_id: { type: DataTypes.INTEGER, allowNull: true },

    added_by: { type: DataTypes.INTEGER, allowNull: true },
    released_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'display_tray_items',
    indexes: [
      { unique: true, fields: ['tenant_id', 'item_code'] },
      { fields: ['tray_id', 'status'] },
    ],
    validate: {
      huidFormat() {
        if (this.huid_code && !/^[A-Za-z0-9]{6}$/.test(this.huid_code)) {
          throw new Error('HUID must be exactly 6 letters or digits');
        }
      },
    },
  });

  DisplayTrayItem.associate = (models) => {
    DisplayTrayItem.belongsTo(models.DisplayTray, { foreignKey: 'tray_id' });
    DisplayTrayItem.belongsTo(models.ProductMaster, { foreignKey: 'product_master_id' });
    DisplayTrayItem.belongsTo(models.Category, { foreignKey: 'category_id' });
  };

  return DisplayTrayItem;
};
