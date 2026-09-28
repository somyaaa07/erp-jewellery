// models/saleItem.js
export default (sequelize, DataTypes) => {
  const SaleItem = sequelize.define('SaleItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    sale_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    // Which physical bucket this line was actually sold out of - the display tray (priced
    // retail) or straight out of the wholesale box (priced wholesale, sometimes by manual
    // weight entry rather than a piece count).
    sale_source: { type: DataTypes.ENUM('TRAY', 'WHOLESALE'), allowNull: false, defaultValue: 'TRAY' },
    // Only set for a WHOLESALE-source BULK line sold by manual weight entry (no piece count).
    manual_weight_removed: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    gold_rate_used: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    purity: { type: DataTypes.STRING, allowNull: false },
    net_weight_used: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    gold_value: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    making_charge_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    wastage_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    stone_value: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    gst_amount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    final_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  }, { tableName: 'sale_items' });

  SaleItem.associate = (models) => {
    SaleItem.belongsTo(models.Sale, { foreignKey: 'sale_id' });
    SaleItem.belongsTo(models.Item, { foreignKey: 'item_id' });
    SaleItem.hasOne(models.PriceSnapshot, { foreignKey: 'sale_item_id' });
  };

  return SaleItem;
};
