// models/bulkItem.js
export default (sequelize, DataTypes) => {
  const BulkItem = sequelize.define('BulkItem', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    item_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    total_pieces: { type: DataTypes.INTEGER, allowNull: false },
    total_gross_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    total_net_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    calculated_avg_net_weight: { type: DataTypes.DECIMAL(10, 4), allowNull: true },
  }, {
    tableName: 'bulk_items',
    hooks: {
      beforeSave: (bulkItem) => {
        if (bulkItem.total_pieces > 0) {
          bulkItem.calculated_avg_net_weight = (
            parseFloat(bulkItem.total_net_weight) / bulkItem.total_pieces
          ).toFixed(4);
        }
      },
    },
  });

  BulkItem.associate = (models) => {
    BulkItem.belongsTo(models.Item, { foreignKey: 'item_id' });
  };

  return BulkItem;
};