// backend/src/migrations/20261012110000-add-storage-columns-to-locations.js
/**
 * Migration: Add storage container columns to locations table
 *
 * Adds 4 physical storage container tracking columns to `locations`:
 * 1. storage_type: ENUM('GENERAL', 'WHOLESALE_STORE', 'TRAY_DISPLAY') NOT NULL DEFAULT 'GENERAL'
 * 2. empty_weight: DECIMAL(10, 3) NOT NULL DEFAULT 0.000
 * 3. capacity_weight: DECIMAL(10, 3) NULL DEFAULT NULL
 * 4. capacity_pieces: INTEGER NULL DEFAULT NULL
 *
 * Schema Alignment:
 * Matches Sequelize model `src/models/Location.js` and business rules in
 * `branchController.js`, `locationController.js`, and `itemController.js`.
 *
 * Existing Records:
 * Any pre-existing location records (such as "Main Tray") automatically receive
 * default `storage_type = 'GENERAL'` and `empty_weight = 0.000`, preserving data integrity.
 *
 * Rollback Notice:
 * Reverting this migration (down) will drop these four columns.
 * WARNING: Any tare weights, capacity thresholds, or storage_type classifications
 * stored in these columns will be permanently removed upon rollback.
 */

const ADDED_COLUMNS = [
  'storage_type',
  'empty_weight',
  'capacity_weight',
  'capacity_pieces',
];

export const up = async (queryInterface, Sequelize) => {
  const { DataTypes } = Sequelize;
  const sequelize = queryInterface.sequelize;

  // Inspect existing columns to ensure idempotent and deterministic execution
  const [existingCols] = await sequelize.query('SHOW COLUMNS FROM `locations`');
  const colNames = existingCols.map((c) => c.Field);

  if (!colNames.includes('storage_type')) {
    await queryInterface.addColumn('locations', 'storage_type', {
      type: DataTypes.ENUM('GENERAL', 'WHOLESALE_STORE', 'TRAY_DISPLAY'),
      allowNull: false,
      defaultValue: 'GENERAL',
      after: 'level',
    });
  }

  if (!colNames.includes('empty_weight')) {
    await queryInterface.addColumn('locations', 'empty_weight', {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      defaultValue: 0,
      after: 'storage_type',
    });
  }

  if (!colNames.includes('capacity_weight')) {
    await queryInterface.addColumn('locations', 'capacity_weight', {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: true,
      defaultValue: null,
      after: 'empty_weight',
    });
  }

  if (!colNames.includes('capacity_pieces')) {
    await queryInterface.addColumn('locations', 'capacity_pieces', {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
      after: 'capacity_weight',
    });
  }

  console.log('✅ Migration 20261012110000-add-storage-columns-to-locations: UP completed.');
};

/**
 * Rollback: Reverses column additions.
 * Drops only the columns added by this migration in reverse order.
 * Does not silently swallow database errors.
 */
export const down = async (queryInterface) => {
  const sequelize = queryInterface.sequelize;

  // Inspect columns currently present before dropping
  const [existingCols] = await sequelize.query('SHOW COLUMNS FROM `locations`');
  const colNames = new Set(existingCols.map((c) => c.Field));

  // Drop in reverse creation order: capacity_pieces, capacity_weight, empty_weight, storage_type
  const colsToDrop = [...ADDED_COLUMNS].reverse();

  for (const col of colsToDrop) {
    if (colNames.has(col)) {
      await queryInterface.removeColumn('locations', col);
    }
  }

  console.log('✅ Migration 20261012110000-add-storage-columns-to-locations: DOWN (Rollback) completed.');
};
