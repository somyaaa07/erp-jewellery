// models/purchaseItem.js
export default (sequelize, DataTypes) => {
  const PurchaseItem = sequelize.define('PurchaseItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    purchase_id: { type: DataTypes.INTEGER, allowNull: false },
    product_master_id: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    gross_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    net_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    purity: { type: DataTypes.STRING, allowNull: false },
    rate_used: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  }, { tableName: 'purchase_items' });

  PurchaseItem.associate = (models) => {
    PurchaseItem.belongsTo(models.Purchase, { foreignKey: 'purchase_id' });
    PurchaseItem.belongsTo(models.ProductMaster, { foreignKey: 'product_master_id' });
  };

  return PurchaseItem;
};
