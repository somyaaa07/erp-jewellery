// models/purityMaster.js
// Instead of hardcoding '22K'/'18K' everywhere, purities live in their own master table with a fineness %,
// so a 22K/18K rate can be derived from the 24K rate if desired.
export default (sequelize, DataTypes) => {
  const PurityMaster = sequelize.define('PurityMaster', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    metal_type: { type: DataTypes.ENUM('GOLD', 'SILVER', 'PLATINUM', 'BANDHEL'), allowNull: false },
    purity_code: { type: DataTypes.STRING, allowNull: false }, // '24K','22K','18K','92.5'
    fineness_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: true }, // e.g. 91.6 for 22K
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'purity_masters',
    indexes: [{ unique: true, fields: ['tenant_id', 'metal_type', 'purity_code'] }],
  });

  PurityMaster.associate = () => {};

  return PurityMaster;
};
