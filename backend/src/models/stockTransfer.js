// models/stockTransfer.js
export default (sequelize, DataTypes) => {
  const StockTransfer = sequelize.define('StockTransfer', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    original_item_id: { type: DataTypes.INTEGER, allowNull: true },
    from_branch_id: { type: DataTypes.INTEGER, allowNull: false },
    to_branch_id: { type: DataTypes.INTEGER, allowNull: false },
    to_location_id: { type: DataTypes.INTEGER, allowNull: true },
    quantity_transferred: { type: DataTypes.INTEGER, allowNull: true },
    status: {
      type: DataTypes.ENUM('IN_TRANSIT', 'RECEIVED', 'REJECTED', 'CANCELLED'),
      defaultValue: 'IN_TRANSIT',
    },
    requested_by: { type: DataTypes.INTEGER, allowNull: false },
    received_by: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.STRING, allowNull: true },
  }, { tableName: 'stock_transfers' });

  StockTransfer.associate = (models) => {
    StockTransfer.belongsTo(models.Item, { foreignKey: 'item_id' });
    StockTransfer.belongsTo(models.Branch, { as: 'fromBranch', foreignKey: 'from_branch_id' });
    StockTransfer.belongsTo(models.Branch, { as: 'toBranch', foreignKey: 'to_branch_id' });
  };

  return StockTransfer;
};