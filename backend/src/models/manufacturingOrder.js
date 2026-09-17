// models/manufacturingOrder.js
export default (sequelize, DataTypes) => {
  const ManufacturingOrder = sequelize.define('ManufacturingOrder', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    order_number: { type: DataTypes.STRING, allowNull: false },
    karigar_name: { type: DataTypes.STRING, allowNull: false },
    product_master_id: { type: DataTypes.INTEGER, allowNull: false },
    raw_material_id: { type: DataTypes.INTEGER, allowNull: true },
    issued_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    expected_pieces: { type: DataTypes.INTEGER, allowNull: true },
    expected_finish_date: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.ENUM('ISSUED', 'IN_PROGRESS', 'RECEIVED', 'CANCELLED'), defaultValue: 'ISSUED' },
    received_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    received_pieces: { type: DataTypes.INTEGER, allowNull: true },
    wastage_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    notes: { type: DataTypes.STRING, allowNull: true },
  }, {
    tableName: 'manufacturing_orders',
    indexes: [{ unique: true, fields: ['tenant_id', 'order_number'] }],
  });

  ManufacturingOrder.associate = (models) => {
    ManufacturingOrder.belongsTo(models.ProductMaster, { foreignKey: 'product_master_id' });
    ManufacturingOrder.belongsTo(models.RawMaterial, { foreignKey: 'raw_material_id' });
  };

  return ManufacturingOrder;
};
