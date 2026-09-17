// models/category.js
// Master list of jewellery categories: RING, NECKLACE, EARRING, BRACELET, BANGLE, PENDANT, CHAIN...
export default (sequelize, DataTypes) => {
  const Category = sequelize.define('Category', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    code: { type: DataTypes.STRING, allowNull: false },
    gender_applicable: {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'UNISEX', 'KIDS', 'ALL'),
      defaultValue: 'ALL',
    },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'categories',
    indexes: [{ unique: true, fields: ['tenant_id', 'code'] }],
  });

  Category.associate = (models) => {
    Category.hasMany(models.ProductMaster, { foreignKey: 'category_id' });
    Category.hasMany(models.PricingProfile, { foreignKey: 'category_id' });
  };

  return Category;
};
