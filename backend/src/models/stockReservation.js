// models/stockReservation.js
export default (sequelize, DataTypes) => {
  const StockReservation = sequelize.define('StockReservation', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    item_id: { type: DataTypes.INTEGER, allowNull: false },
    reserved_for_customer_id: { type: DataTypes.INTEGER, allowNull: true },
    reserved_by_user_id: { type: DataTypes.INTEGER, allowNull: false },
    reserved_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.ENUM('ACTIVE', 'RELEASED', 'CONVERTED'), defaultValue: 'ACTIVE' },
    notes: { type: DataTypes.STRING, allowNull: true },
  }, { tableName: 'stock_reservations' });

  StockReservation.associate = (models) => {
    StockReservation.belongsTo(models.Item, { foreignKey: 'item_id' });
    StockReservation.belongsTo(models.Customer, { foreignKey: 'reserved_for_customer_id' });
  };

  return StockReservation;
};
