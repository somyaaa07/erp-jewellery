// models/priceSnapshot.js
// The price is FROZEN here at the moment of sale - even if the gold rate changes tomorrow,
// the amount on an old invoice never changes.
export default (sequelize, DataTypes) => {
  const PriceSnapshot = sequelize.define('PriceSnapshot', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    sale_item_id: { type: DataTypes.INTEGER, allowNull: true },
    profile_type: { type: DataTypes.ENUM('RETAIL', 'WHOLESALE'), allowNull: false },
    gold_rate_used: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    purity: { type: DataTypes.STRING, allowNull: false },
    net_weight_used: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    gold_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    making_charge_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    wastage_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    stone_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    other_charges: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    gst_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    final_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    snapshot_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, { tableName: 'price_snapshots' });

  PriceSnapshot.associate = (models) => {
    PriceSnapshot.belongsTo(models.Item, { foreignKey: 'item_id' });
    PriceSnapshot.belongsTo(models.SaleItem, { foreignKey: 'sale_item_id' });
  };

  return PriceSnapshot;
};
