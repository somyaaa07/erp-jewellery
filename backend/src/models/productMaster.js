// models/productMaster.js
// This is the "Design / Product Master" - for example "Male Ring 22K" or "Female Necklace 22K".
// Create a design once, and every new lot of stock merges into that same design (in BULK mode),
// which is why adding the same thing again does not create a duplicate entry.
export default (sequelize, DataTypes) => {
  const ProductMaster = sequelize.define('ProductMaster', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: true }, // null = saari branches me shared design

    category_id: { type: DataTypes.INTEGER, allowNull: false },
    design_code: { type: DataTypes.STRING, allowNull: false }, // e.g. MR-001
    product_name: { type: DataTypes.STRING, allowNull: false }, // "Male Gold Ring"
    item_subtype: { type: DataTypes.STRING, allowNull: true },
    gender_category: {
      type: DataTypes.ENUM('MALE', 'FEMALE', 'UNISEX', 'KIDS'),
      defaultValue: 'UNISEX',
    },
    metal_type: {
      type: DataTypes.ENUM('GOLD', 'SILVER', 'PLATINUM', 'BANDHEL'),
      allowNull: false,
    },
    default_purity: { type: DataTypes.STRING, allowNull: false },

    // These override the global PricingProfile when a design needs its own rate
    making_charge_type: { type: DataTypes.ENUM('PER_GRAM', 'PERCENT_OF_GOLD', 'FLAT'), allowNull: true },
    making_charge_value: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
    wastage_percent_override: { type: DataTypes.DECIMAL(5, 2), allowNull: true },

    default_image_url: { type: DataTypes.STRING, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'product_masters',
    indexes: [{ unique: true, fields: ['tenant_id', 'design_code'] }],
  });

  ProductMaster.associate = (models) => {
    ProductMaster.belongsTo(models.Category, { foreignKey: 'category_id' });
    ProductMaster.hasMany(models.Item, { foreignKey: 'product_master_id' });
    ProductMaster.hasMany(models.PurchaseItem, { foreignKey: 'product_master_id' });
    ProductMaster.hasMany(models.ManufacturingOrder, { foreignKey: 'product_master_id' });
  };

  return ProductMaster;
};
