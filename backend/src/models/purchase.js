// models/purchase.js (redesigned)
//
// Raw-material purchase only - this shop only buys GOLD and SILVER as raw material from
// suppliers (metal_type is restricted to those two below). Every purchase also records how
// GST applies to it:
//   WITH_GST     - normal invoice, supplier charges GST, tax_amount is part of what we owe them.
//   WITHOUT_GST  - unregistered/small supplier, no GST on this purchase (tax_amount stays 0).
//   REVERSE_GST  - reverse charge: WE are liable to pay the GST directly to the government, not
//                  to the supplier. So it is tracked separately (reverse_charge_gst_amount) and
//                  is NOT added to total_amount owed to the supplier.
export default (sequelize, DataTypes) => {
  const Purchase = sequelize.define('Purchase', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    tenant_id: { type: DataTypes.INTEGER, allowNull: false },
    branch_id: { type: DataTypes.INTEGER, allowNull: false },
    supplier_id: { type: DataTypes.INTEGER, allowNull: false },
    purchase_number: { type: DataTypes.STRING, allowNull: false },
    // Same as purchase_number - kept as its own field because this is what prints on the
    // supplier-facing purchase receipt, separate from any internal renumbering later.
    receipt_number: { type: DataTypes.STRING, allowNull: true },
    purchase_date: { type: DataTypes.DATEONLY, allowNull: false },
    metal_type: { type: DataTypes.ENUM('GOLD', 'SILVER'), allowNull: false },
    gross_weight: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
    tunch_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
    pure_weight_24k_equivalent: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    gst_type: {
      type: DataTypes.ENUM('WITH_GST', 'WITHOUT_GST', 'REVERSE_GST'),
      allowNull: false,
      defaultValue: 'WITH_GST',
    },
    subtotal_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    tax_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    // Only filled when gst_type = REVERSE_GST - the GST we self-assess and pay to the
    // government, kept out of total_amount because the supplier is never paid this portion.
    reverse_charge_gst_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    total_amount: { type: DataTypes.DECIMAL(14, 2), defaultValue: 0 },
    verification_status: { type: DataTypes.ENUM('PENDING_TUNCH', 'VERIFIED'), defaultValue: 'PENDING_TUNCH' },
    is_jangad: { type: DataTypes.BOOLEAN, defaultValue: false },
    received_into_inventory: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, {
    tableName: 'purchases',
    indexes: [{ unique: true, fields: ['tenant_id', 'purchase_number'] }],
  });

  Purchase.associate = (models) => {
    Purchase.belongsTo(models.Supplier, { foreignKey: 'supplier_id' });
    Purchase.hasMany(models.PurchaseItem, { foreignKey: 'purchase_id' });
  };

  return Purchase;
};
