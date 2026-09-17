// models/sale.js
export default (sequelize, DataTypes) => {
  const Sale = sequelize.define('Sale', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    customer_id: { type: DataTypes.INTEGER, allowNull: true },
    sale_number: { type: DataTypes.STRING, allowNull: false },
    sale_date: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    sale_type: { type: DataTypes.ENUM('RETAIL', 'WHOLESALE'), allowNull: false, defaultValue: 'RETAIL' },
    subtotal_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    discount_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    gst_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    payment_status: { type: DataTypes.ENUM('PAID', 'PARTIAL', 'UNPAID'), defaultValue: 'UNPAID' },
    status: { type: DataTypes.ENUM('DRAFT', 'CONFIRMED', 'CANCELLED'), defaultValue: 'DRAFT' },
  }, {
    tableName: 'sales',
    indexes: [{ unique: true, fields: ['tenant_id', 'sale_number'] }],
  });

  Sale.associate = (models) => {
    Sale.belongsTo(models.Customer, { foreignKey: 'customer_id' });
    Sale.hasMany(models.SaleItem, { foreignKey: 'sale_id' });
    Sale.hasOne(models.Invoice, { foreignKey: 'sale_id' });
  };

  return Sale;
};
