// models/metalDetail.js
export default (sequelize, DataTypes) => {
  const MetalDetail = sequelize.define('MetalDetail', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    item_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    metal_type: { type: DataTypes.ENUM('GOLD', 'SILVER', 'PLATINUM', 'BANDHEL'), allowNull: false },
    purity: { type: DataTypes.STRING, allowNull: false },
    gross_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    less_weight: { type: DataTypes.DECIMAL(10, 3), defaultValue: 0 },
    net_weight: {
      type: DataTypes.VIRTUAL,
      get() { return (parseFloat(this.gross_weight) - parseFloat(this.less_weight || 0)).toFixed(3); },
    },
    stone_weight: { type: DataTypes.DECIMAL(10, 3), defaultValue: 0 },
    base_core_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    precious_overlay_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
  }, { tableName: 'metal_details' });

  MetalDetail.associate = (models) => {
    MetalDetail.belongsTo(models.Item, { foreignKey: 'item_id' });
  };

  return MetalDetail;
};