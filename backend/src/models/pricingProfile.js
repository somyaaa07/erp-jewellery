// models/pricingProfile.js
// Separate rules for RETAIL and WHOLESALE - this is where the two prices diverge.
// Resolution order (most specific first): branch+category > branch only > category only > tenant default.
export default (sequelize, DataTypes) => {
  const PricingProfile = sequelize.define('PricingProfile', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: true },
    category_id: { type: DataTypes.INTEGER, allowNull: true },
    profile_type: { type: DataTypes.ENUM('RETAIL', 'WHOLESALE'), allowNull: false },

    making_charge_type: { type: DataTypes.ENUM('PER_GRAM', 'PERCENT_OF_GOLD', 'FLAT'), allowNull: false, defaultValue: 'PERCENT_OF_GOLD' },
    making_charge_value: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    wastage_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    gst_percent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 3 },
    other_charges_flat: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },

    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, { tableName: 'pricing_profiles' });

  PricingProfile.associate = (models) => {
    PricingProfile.belongsTo(models.Category, { foreignKey: 'category_id' });
  };

  return PricingProfile;
};
