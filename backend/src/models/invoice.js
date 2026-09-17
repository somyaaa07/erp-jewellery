// models/invoice.js
export default (sequelize, DataTypes) => {
  const Invoice = sequelize.define('Invoice', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    sale_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    invoice_number: { type: DataTypes.STRING, allowNull: false },
    generated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    total_amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
  }, {
    tableName: 'invoices',
    indexes: [{ unique: true, fields: ['tenant_id', 'invoice_number'] }],
  });

  Invoice.associate = (models) => {
    Invoice.belongsTo(models.Sale, { foreignKey: 'sale_id' });
  };

  return Invoice;
};
