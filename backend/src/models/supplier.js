// models/supplier.js (renamed from vendor.js - "supplier" is the more standard term)
// Full supplier profile - needed because every raw-material (gold/silver) purchase must carry
// complete supplier details for GST and payment records, not just a name.
export default (sequelize, DataTypes) => {
  const Supplier = sequelize.define('Supplier', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    contact_person: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: true },
    email: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },
    state: { type: DataTypes.STRING, allowNull: true },
    pincode: { type: DataTypes.STRING, allowNull: true },
    gstin: { type: DataTypes.STRING, allowNull: true },
    pan_number: { type: DataTypes.STRING, allowNull: true },
    bank_name: { type: DataTypes.STRING, allowNull: true },
    bank_account_number: { type: DataTypes.STRING, allowNull: true },
    bank_ifsc: { type: DataTypes.STRING, allowNull: true },
    opening_balance: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'suppliers' });

  Supplier.associate = (models) => {
    Supplier.hasMany(models.Purchase, { foreignKey: 'supplier_id' });
    Supplier.hasOne(models.SupplierLedger, { foreignKey: 'supplier_id' });
  };

  return Supplier;
};
