// models/auditLog.js
export default (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: true },
    table_name: { type: DataTypes.STRING, allowNull: false },
    record_id: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE'), allowNull: false },
    before_data: { type: DataTypes.JSON, allowNull: true },
    after_data: { type: DataTypes.JSON, allowNull: true },
    operator_id: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'audit_logs',
    updatedAt: false,
  });

  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.User, { as: 'operator', foreignKey: 'operator_id' });
  };

  return AuditLog;
};