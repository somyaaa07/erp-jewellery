// models/stockAuditItem.js
export default (sequelize, DataTypes) => {
  const StockAuditItem = sequelize.define('StockAuditItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    audit_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    system_quantity: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    physical_quantity: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    difference: {
      type: DataTypes.VIRTUAL,
      get() { return (parseFloat(this.physical_quantity) - parseFloat(this.system_quantity)).toFixed(3); },
    },
    remarks: { type: DataTypes.STRING, allowNull: true },
  }, { tableName: 'stock_audit_items' });

  StockAuditItem.associate = (models) => {
    StockAuditItem.belongsTo(models.StockAudit, { foreignKey: 'audit_id' });
    StockAuditItem.belongsTo(models.Item, { foreignKey: 'item_id' });
  };

  return StockAuditItem;
};
