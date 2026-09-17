// models/supplier.js (renamed from vendor.js - "supplier" is the more standard term)
export default (sequelize, DataTypes) => {
  const Supplier = sequelize.define('Supplier', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    gstin: { type: DataTypes.STRING, allowNull: true },
    opening_balance: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'suppliers' });

  Supplier.associate = (models) => {
    Supplier.hasMany(models.Purchase, { foreignKey: 'supplier_id' });
    Supplier.hasOne(models.SupplierLedger, { foreignKey: 'supplier_id' });
  };

  return Supplier;
};
