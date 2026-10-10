// models/goldRate.js
// The daily gold/silver rate. Every change inserts a new row - old rows are never deleted or updated,
// so history is preserved and old invoices are never affected.
export default (sequelize, DataTypes) => {
  const GoldRate = sequelize.define('GoldRate', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: true }, // null = tenant-wide rate
    rate_date: { type: DataTypes.DATEONLY, allowNull: false },
    metal_type: { type: DataTypes.ENUM('GOLD', 'SILVER', 'PLATINUM', 'BANDHEL'), allowNull: false },
    purity: { type: DataTypes.STRING, allowNull: false }, // '22K','18K','24K','92.5'
    rate_per_gram: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'gold_rates',
    indexes: [{ fields: ['tenant_id', 'metal_type', 'purity', 'rate_date'] }],
  });

  GoldRate.associate = () => {};

  return GoldRate;
};
