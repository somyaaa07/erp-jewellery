// models/itemImage.js
export default (sequelize, DataTypes) => {
  const ItemImage = sequelize.define('ItemImage', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    image_url: { type: DataTypes.STRING, allowNull: false },
    sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { tableName: 'item_images' });

  ItemImage.associate = (models) => {
    ItemImage.belongsTo(models.Item, { foreignKey: 'item_id' });
  };

  return ItemImage;
};