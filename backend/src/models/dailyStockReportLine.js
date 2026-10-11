// models/dailyStockReportLine.js
export default (sequelize, DataTypes) => {
  const DailyStockReportLine = sequelize.define('DailyStockReportLine', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    report_id: { type: DataTypes.INTEGER, allowNull: false },
    category_id: { type: DataTypes.INTEGER, allowNull: false },
    category_name: { type: DataTypes.STRING, allowNull: false },
    opening_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    addition_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    sale_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    tray_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 }, // moved to the display tray, net
    other_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 }, // adjustments and transfers, net
    closing_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 }, // system
    physical_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: true }, // weighed on the scale
    difference: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
  }, { tableName: 'daily_stock_report_lines' });

  DailyStockReportLine.associate = (models) => {
    DailyStockReportLine.belongsTo(models.DailyStockReport, { foreignKey: 'report_id' });
  };

  return DailyStockReportLine;
};
