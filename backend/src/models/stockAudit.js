// models/stockAudit.js
export default (sequelize, DataTypes) => {
  const StockAudit = sequelize.define('StockAudit', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    audit_date: { type: DataTypes.DATEONLY, allowNull: false },
    conducted_by: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('IN_PROGRESS', 'COMPLETED'), defaultValue: 'IN_PROGRESS' },
    notes: { type: DataTypes.STRING, allowNull: true },
  }, { tableName: 'stock_audits' });

  StockAudit.associate = (models) => {
    StockAudit.hasMany(models.StockAuditItem, { foreignKey: 'audit_id' });
  };

  return StockAudit;
};
