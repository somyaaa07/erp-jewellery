// models/stockAdjustment.js
// A mismatch between the physical count and the system count is recorded here.
export default (sequelize, DataTypes) => {
  const StockAdjustment = sequelize.define('StockAdjustment', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    system_quantity: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    physical_quantity: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    difference: {
      type: DataTypes.VIRTUAL,
      get() { return (parseFloat(this.physical_quantity) - parseFloat(this.system_quantity)).toFixed(3); },
    },
    reason: { type: DataTypes.STRING, allowNull: true },
    adjusted_by: { type: DataTypes.INTEGER, allowNull: false },
    adjusted_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  }, { tableName: 'stock_adjustments' });

  StockAdjustment.associate = (models) => {
    StockAdjustment.belongsTo(models.Item, { foreignKey: 'item_id' });
  };

  return StockAdjustment;
};
