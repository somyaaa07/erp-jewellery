// models/location.js
//
// A Location can now optionally be a physical STORAGE CONTAINER (the wholesale box, or the
// display tray). Those containers have a fixed empty weight (the tare weight of the box/tray
// itself, before any stock is in it) and a fixed capacity - how much weight or how many pieces
// it can physically hold. This is what lets "how much is in this box right now" be tracked
// accurately: current stock weight = sum of items inside - empty_weight is NOT part of the
// stock, it's just the container's own weight, kept here for reference when someone weighs the
// whole box on a scale.
export default (sequelize, DataTypes) => {
  const Location = sequelize.define('Location', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    parent_id: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false },
    level: { type: DataTypes.INTEGER, allowNull: false },

    // GENERAL = any regular shelf/drawer, not tracked as a weighed container.
    // WHOLESALE_STORE = the main storage - every branch gets exactly one of these automatically.
    // TRAY_DISPLAY = the counter tray - stock is moved here FROM the wholesale store to be shown
    // to walk-in customers. It never receives fresh purchase/manufacturing stock directly.
    storage_type: {
      type: DataTypes.ENUM('GENERAL', 'WHOLESALE_STORE', 'TRAY_DISPLAY'),
      allowNull: false,
      defaultValue: 'GENERAL',
    },
    // Weight of the box/tray itself when empty (grams). Just for reference (e.g. tallying a
    // scale reading of the whole box) - never added to or subtracted from item stock totals.
    empty_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
    // Maximum stock weight (grams) this container may hold. Null = no weight limit enforced.
    capacity_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    // Maximum number of pieces this container may hold. Null = no piece limit enforced.
    capacity_pieces: { type: DataTypes.INTEGER, allowNull: true },
  }, { tableName: 'locations' });

  Location.associate = (models) => {
    Location.belongsTo(models.Branch, { foreignKey: 'branch_id' });
    Location.belongsTo(Location, { as: 'parent', foreignKey: 'parent_id' });
    Location.hasMany(Location, { as: 'children', foreignKey: 'parent_id' });
    Location.hasMany(models.Item, { foreignKey: 'location_id' });
  };

  return Location;
};