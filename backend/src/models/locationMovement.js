// models/locationMovement.js
// Audit trail for moves of containers (box, tray, counter ...), trays and stock lots.
// Paths are stored as text snapshots, so the history stays readable even after a container is
// renamed or moved again.
export default (sequelize, DataTypes) => {
  const LocationMovement = sequelize.define('LocationMovement', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    entity_type: { type: DataTypes.ENUM('LOCATION', 'TRAY', 'STOCK_LOT', 'TRAY_PIECE'), allowNull: false },
    entity_id: { type: DataTypes.INTEGER, allowNull: false },
    entity_label: { type: DataTypes.STRING, allowNull: false },
    from_location_id: { type: DataTypes.INTEGER, allowNull: true },
    to_location_id: { type: DataTypes.INTEGER, allowNull: true },
    from_path: { type: DataTypes.STRING(500), allowNull: true },
    to_path: { type: DataTypes.STRING(500), allowNull: true },
    quantity: { type: DataTypes.INTEGER, allowNull: true },
    weight: { type: DataTypes.DECIMAL(12, 3), allowNull: true },
    reason: { type: DataTypes.STRING, allowNull: true },
    moved_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'location_movements',
    indexes: [{ fields: ['tenant_id', 'entity_type', 'entity_id'] }],
  });
  return LocationMovement;
};
