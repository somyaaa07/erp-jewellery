// models/purchase.js (redesigned)
export default (sequelize, DataTypes) => {
  const Purchase = sequelize.define('Purchase', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    supplier_id: { type: DataTypes.INTEGER, allowNull: false },
    purchase_number: { type: DataTypes.STRING, allowNull: false },
    purchase_date: { type: DataTypes.DATEONLY, allowNull: false },
    metal_type: { type: DataTypes.ENUM('GOLD', 'SILVER', 'PLATINUM', 'BANDHEL'), allowNull: false },
    gross_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    tunch_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    pure_weight_24k_equivalent: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    subtotal_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    tax_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    verification_status: { type: DataTypes.ENUM('PENDING_TUNCH', 'VERIFIED'), defaultValue: 'PENDING_TUNCH' },
    is_jangad: { type: DataTypes.BOOLEAN, defaultValue: false },
    received_into_inventory: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, {
    tableName: 'purchases',
    indexes: [{ unique: true, fields: ['tenant_id', 'purchase_number'] }],
  });

  Purchase.associate = (models) => {
    Purchase.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
    Purchase.hasMany(models.PurchaseItem, { foreignKey: 'purchase_id' });
  };

  return Purchase;
};
