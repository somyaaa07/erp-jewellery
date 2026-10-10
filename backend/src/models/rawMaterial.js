// models/rawMaterial.js
// Separate from finished jewellery inventory - this is raw gold/silver/diamond/stone stock
// used by the Manufacturing module when issuing material to a karigar.
export default (sequelize, DataTypes) => {
  const RawMaterial = sequelize.define('RawMaterial', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    location_id: { type: DataTypes.INTEGER, allowNull: true },
    material_type: { type: DataTypes.ENUM('GOLD', 'SILVER', 'DIAMOND', 'STONE', 'OTHER'), allowNull: false },
    purity: { type: DataTypes.STRING, allowNull: true },
    quantity: { type: DataTypes.DECIMAL(12, 3), allowNull: false, defaultValue: 0 },
    unit: { type: DataTypes.ENUM('GRAM', 'CARAT', 'PIECE', 'KG'), defaultValue: 'GRAM' },
    notes: { type: DataTypes.STRING, allowNull: true },
  }, { tableName: 'raw_materials' });

  RawMaterial.associate = (models) => {
    RawMaterial.hasMany(models.ManufacturingOrder, { foreignKey: 'raw_material_id' });
  };

  return RawMaterial;
};
