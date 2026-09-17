// models/repairOrder.js
// One model covers three things: customer repairs, internal repairs and damage tracking.
export default (sequelize, DataTypes) => {
  const RepairOrder = sequelize.define('RepairOrder', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: true }, // internal stock item, agar applicable
    customer_id: { type: DataTypes.INTEGER, allowNull: true }, // customer-submitted repair ho to
    order_type: { type: DataTypes.ENUM('CUSTOMER_REPAIR', 'INTERNAL_REPAIR', 'DAMAGE'), allowNull: false },
    sent_to_karigar: { type: DataTypes.STRING, allowNull: true },
    issue_description: { type: DataTypes.STRING, allowNull: true },
    sent_date: { type: DataTypes.DATEONLY, allowNull: true },
    expected_return_date: { type: DataTypes.DATEONLY, allowNull: true },
    received_date: { type: DataTypes.DATEONLY, allowNull: true },
    repair_charge: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    status: { type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'), defaultValue: 'PENDING' },
    notes: { type: DataTypes.STRING, allowNull: true },
  }, { tableName: 'repair_orders' });

  RepairOrder.associate = (models) => {
    RepairOrder.belongsTo(models.Item, { foreignKey: 'item_id' });
    RepairOrder.belongsTo(models.Customer, { foreignKey: 'customer_id' });
  };

  return RepairOrder;
};
