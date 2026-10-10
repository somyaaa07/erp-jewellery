// models/stoneDetail.js
export default (sequelize, DataTypes) => {
  const StoneDetail = sequelize.define('StoneDetail', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    stone_type: {
      type: DataTypes.ENUM('NATURAL_DIAMOND', 'LAB_GROWN_DIAMOND', 'RUBY', 'SYNTHETIC', 'OTHER'),
      allowNull: false,
    },
    stone_pieces_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    stone_weight_carat: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
    color: { type: DataTypes.STRING },
    clarity: { type: DataTypes.STRING },
    cut: { type: DataTypes.STRING },
    lab_code: { type: DataTypes.STRING },
    stone_rate: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    stone_amount: {
      type: DataTypes.VIRTUAL,
      get() {
        if (this.stone_rate == null) return null;
        return (parseFloat(this.stone_rate) * parseFloat(this.stone_weight_carat)).toFixed(2);
      },
    },
  }, { tableName: 'stone_details' });

  StoneDetail.associate = (models) => {
    StoneDetail.belongsTo(models.Item, { foreignKey: 'item_id' });
  };

  return StoneDetail;
};