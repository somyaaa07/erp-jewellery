// models/pieceItem.js
export default (sequelize, DataTypes) => {
  const PieceItem = sequelize.define('PieceItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    item_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    sku: { type: DataTypes.STRING, allowNull: false, unique: true },
    gross_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    less_weight: { type: DataTypes.DECIMAL(10, 3), defaultValue: 0 },
    net_weight: {
      type: DataTypes.VIRTUAL,
      get() { return (parseFloat(this.gross_weight) - parseFloat(this.less_weight || 0)).toFixed(3); },
    },
  }, { tableName: 'piece_items' });

  PieceItem.associate = (models) => {
    PieceItem.belongsTo(models.Item, { foreignKey: 'item_id' });
  };

  return PieceItem;
};