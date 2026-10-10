// models/dailyStockReport.js
// Daily Stock Report (DSR) for the wholesale store, weight-wise, one line per category.
//   Closing (system) = Opening + Addition - Sale (+ Other, net)
//   Difference       = Physical (weighed) - Closing (system)
// A report is finalised with two signatures; after that it is locked.
export default (sequelize, DataTypes) => {
  const DailyStockReport = sequelize.define('DailyStockReport', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    report_date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM('DRAFT', 'SIGNED'), allowNull: false, defaultValue: 'DRAFT' },

    signature_1_user_id: { type: DataTypes.INTEGER, allowNull: true },
    signature_1_name: { type: DataTypes.STRING, allowNull: true },
    signature_1_at: { type: DataTypes.DATE, allowNull: true },
    signature_2_user_id: { type: DataTypes.INTEGER, allowNull: true },
    signature_2_name: { type: DataTypes.STRING, allowNull: true },
    signature_2_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    tableName: 'daily_stock_reports',
    indexes: [{ unique: true, fields: ['tenant_id', 'branch_id', 'report_date'] }],
  });

  DailyStockReport.associate = (models) => {
    DailyStockReport.hasMany(models.DailyStockReportLine, { foreignKey: 'report_id' });
  };

  return DailyStockReport;
};
