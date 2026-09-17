// models/stockMovement.js
// Central ledger - har stock-affecting action (purchase, transfer, sale, return, adjustment,
// repair) writes a row here. Movement reports and the "last moved" slow/dead-stock view are built from it.
export default (sequelize, DataTypes) => {
  const StockMovement = sequelize.define('StockMovement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    movement_type: {
      type: DataTypes.ENUM(
        'PURCHASE', 'TRANSFER_OUT', 'TRANSFER_IN', 'SALE', 'RETURN',
        'ADJUSTMENT', 'REPAIR_OUT', 'REPAIR_IN', 'MANUFACTURING_IN'
      ),
      allowNull: false,
    },
    quantity_change: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    weight_change: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
    from_location_id: { type: DataTypes.INTEGER, allowNull: true },
    to_location_id: { type: DataTypes.INTEGER, allowNull: true },
    reference_type: { type: DataTypes.STRING, allowNull: true }, // 'PURCHASE','SALE','STOCK_TRANSFER',...
    reference_id: { type: DataTypes.INTEGER, allowNull: true },
    notes: { type: DataTypes.STRING, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
  }, { tableName: 'stock_movements' });

  StockMovement.associate = (models) => {
    StockMovement.belongsTo(models.Item, { foreignKey: 'item_id' });
  };

  return StockMovement;
};
