// models/displayTray.js
// A physical tray. It has a fixed number of slots, and every slot holds at most one individual
// piece (see DisplayTrayItem). Many trays can hold the same design, at different counters.
export default (sequelize, DataTypes) => {
  const DisplayTray = sequelize.define('DisplayTray', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    // Optional label only. A tray is identified by its name and the designs it holds, not by category.
    category_id: { type: DataTypes.INTEGER, allowNull: true },
    // Where the tray is right now: a counter, a box, the safe ... (any location in the tree).
    location_id: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING, allowNull: false }, // e.g. "Ladies Ring - Tray 3"
    total_slots: { type: DataTypes.INTEGER, allowNull: false },
    empty_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 }, // weight of the empty tray
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  }, {
    tableName: 'display_trays',
    indexes: [{ unique: true, fields: ['tenant_id', 'branch_id', 'name'] }],
  });

  DisplayTray.associate = (models) => {
    // NO ACTION on purpose: the column is optional now, but databases created earlier still have
    // it as NOT NULL while the foreign key is rebuilt. SET NULL on a NOT NULL column is rejected by
    // MySQL (errno 150), so the key must not use it.
    DisplayTray.belongsTo(models.Category, { foreignKey: 'category_id', onDelete: 'NO ACTION' });
    DisplayTray.belongsTo(models.Location, { foreignKey: 'location_id' });
    DisplayTray.hasMany(models.DisplayTrayItem, { foreignKey: 'tray_id' });
    DisplayTray.hasMany(models.DisplayTrayAudit, { foreignKey: 'tray_id' });
  };

  return DisplayTray;
};
