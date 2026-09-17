// models/stoneMaster.js
export default (sequelize, DataTypes) => {
  const StoneMaster = sequelize.define('StoneMaster', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    stone_type: {
      type: DataTypes.ENUM('NATURAL_DIAMOND', 'LAB_GROWN_DIAMOND', 'RUBY', 'EMERALD', 'SAPPHIRE', 'SYNTHETIC', 'OTHER'),
      allowNull: false,
    },
    default_rate_per_carat: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    unit: { type: DataTypes.STRING, defaultValue: 'CARAT' },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'stone_masters',
    indexes: [{ unique: true, fields: ['tenant_id', 'stone_type'] }],
  });

  StoneMaster.associate = () => {};

  return StoneMaster;
};
