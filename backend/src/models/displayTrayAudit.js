// models/displayTrayAudit.js
// A physical check of one tray: the system's count and weight against what is actually
// counted and weighed. `difference` = physical weight - system weight (0 means it matches).
export default (sequelize, DataTypes) => {
  const DisplayTrayAudit = sequelize.define('DisplayTrayAudit', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    tray_id: { type: DataTypes.INTEGER, allowNull: false },
    audited_on: { type: DataTypes.DATEONLY, allowNull: false },
    system_count: { type: DataTypes.INTEGER, allowNull: false },
    physical_count: { type: DataTypes.INTEGER, allowNull: false },
    system_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    physical_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    difference: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    notes: { type: DataTypes.STRING, allowNull: true },
    audited_by: { type: DataTypes.INTEGER, allowNull: true },
  }, { tableName: 'display_tray_audits' });

  DisplayTrayAudit.associate = (models) => {
    DisplayTrayAudit.belongsTo(models.DisplayTray, { foreignKey: 'tray_id' });
  };

  return DisplayTrayAudit;
};
