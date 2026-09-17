// models/supplierLedger.js
export default (sequelize, DataTypes) => {
  const SupplierLedger = sequelize.define('SupplierLedger', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    supplier_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    currency_balance: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    pure_metal_balance_24k_grams: { type: DataTypes.DECIMAL(12, 4), defaultValue: 0 },
  }, { tableName: 'supplier_ledgers' });

  SupplierLedger.associate = (models) => {
    SupplierLedger.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
  };

  return SupplierLedger;
};
