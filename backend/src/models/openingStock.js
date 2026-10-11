// models/openingStock.js
// Opening stock of the wholesale store, entered once per design from the
// "Designs & Categories" screen: quantity (pieces, optional) and weight (required). No HUID.
// The category is always the category of the design, so category totals are the sum of
// their designs.
export default (sequelize, DataTypes) => {
  const OpeningStock = sequelize.define('OpeningStock', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    category_id: { type: DataTypes.INTEGER, allowNull: false },
    product_master_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: true }, // the wholesale stock row this opening fed
    opening_pieces: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    opening_weight: { type: DataTypes.DECIMAL(12, 3), allowNull: false },
    as_on_date: { type: DataTypes.DATEONLY, allowNull: false },
    notes: { type: DataTypes.STRING, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    tableName: 'opening_stocks',
    indexes: [{ unique: true, fields: ['tenant_id', 'branch_id', 'product_master_id'] }],
  });

  OpeningStock.associate = (models) => {
    OpeningStock.belongsTo(models.Category, { foreignKey: 'category_id' });
    OpeningStock.belongsTo(models.ProductMaster, { foreignKey: 'product_master_id' });
  };

  return OpeningStock;
};
