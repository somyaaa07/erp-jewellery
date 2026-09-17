// models/location.js
export default (sequelize, DataTypes) => {
  const Location = sequelize.define('Location', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    parent_id: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    level: { type: DataTypes.INTEGER, allowNull: false },
  }, { tableName: 'locations' });

  Location.associate = (models) => {
    Location.belongsTo(models.Branch, { foreignKey: 'branch_id' });
    Location.belongsTo(Location, { as: 'parent', foreignKey: 'parent_id' });
    Location.hasMany(Location, { as: 'children', foreignKey: 'parent_id' });
    Location.hasMany(models.Item, { foreignKey: 'location_id' });
  };

  return Location;
};