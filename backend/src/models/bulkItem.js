// models/bulkItem.js
//
// A BULK lot now lives in TWO separate physical buckets, not one row with a "some are on tray"
// counter:
//
//   WHOLESALE bucket (total_pieces / total_gross_weight / total_net_weight)
//     - this is the only real storage. Every purchase/manufacturing receipt lands here first.
//
//   TRAY bucket (tray_pieces / tray_gross_weight / tray_net_weight)
//     - stock physically moved out of the wholesale bucket onto the counter/display tray.
//     - moving stock to the tray SUBTRACTS it from the wholesale bucket and ADDS it here -
//       it is a real transfer between two buckets, not a visible subset of one total.
//
// Selling from the tray reduces the tray bucket. Selling directly out of the wholesale box
// (manual gram entry) reduces the wholesale bucket. The two buckets always add up to the true
// physical quantity of this lot across both places.
export default (sequelize, DataTypes) => {
  const BulkItem = sequelize.define('BulkItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    item_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },

    // ---- Wholesale storage bucket ----
    total_pieces: { type: DataTypes.INTEGER, allowNull: false },
    total_gross_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    total_net_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    calculated_avg_net_weight: { type: DataTypes.DECIMAL(10, 4), allowNull: true },

    // ---- Tray/display bucket ----
    tray_pieces: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    tray_gross_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
    tray_net_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 0 },
  }, {
    tableName: 'bulk_items',
    hooks: {
      // Average per-piece weight is always calculated across BOTH buckets combined, because a
      // piece on the tray and a piece still in the wholesale box are physically identical -
      // only their location differs.
      beforeSave: (bulkItem) => {
        const grandPieces = Number(bulkItem.total_pieces) + Number(bulkItem.tray_pieces || 0);
        const grandNet = Number(bulkItem.total_net_weight) + Number(bulkItem.tray_net_weight || 0);
        if (grandPieces > 0) {
          bulkItem.calculated_avg_net_weight = (grandNet / grandPieces).toFixed(4);
        }
      },
    },
  });

  // Combined totals across both buckets - for low-stock checks / reports where the
  // wholesale-vs-tray split doesn't matter, only "how much of this design do we have left".
  BulkItem.prototype.grandTotalPieces = function grandTotalPieces() {
    return Number(this.total_pieces) + Number(this.tray_pieces || 0);
  };
  BulkItem.prototype.grandTotalNetWeight = function grandTotalNetWeight() {
    return Number(this.total_net_weight) + Number(this.tray_net_weight || 0);
  };
  BulkItem.prototype.grandTotalGrossWeight = function grandTotalGrossWeight() {
    return Number(this.total_gross_weight) + Number(this.tray_gross_weight || 0);
  };

  BulkItem.associate = (models) => {
    BulkItem.belongsTo(models.Item, { foreignKey: 'item_id' });
  };

  return BulkItem;
};