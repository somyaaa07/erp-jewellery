// models/customer.js
export default (sequelize, DataTypes) => {
  const Customer = sequelize.define('Customer', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: true },
    address: { type: DataTypes.STRING, allowNull: true },
    gstin: { type: DataTypes.STRING, allowNull: true },
    opening_balance: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'customers',
    indexes: [{ unique: true, fields: ['tenant_id', 'phone'] }],
  });

  Customer.associate = (models) => {
    Customer.hasMany(models.Sale, { foreignKey: 'customer_id' });
    Customer.hasMany(models.StockReservation, { foreignKey: 'reserved_for_customer_id' });
    Customer.hasMany(models.RepairOrder, { foreignKey: 'customer_id' });
  };

  return Customer;
};
