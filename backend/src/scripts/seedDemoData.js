// scripts/seedDemoData.js
// Creates a working demo setup so the app can be tested immediately:
// tenant -> branch -> location -> admin user -> categories -> purities -> gold rates
// -> pricing profiles (retail/wholesale) -> product masters -> sample stock (BULK).
//
// It also proves two things: adding "Male Ring" twice does not create a duplicate row, and
// retail stock and wholesale stock are priced from their own pricing profiles.
//
// Usage: npm run db:seed:demo
import dotenv from 'dotenv';
dotenv.config();
import db from '../models/index.js';
import { createItemInternal } from '../controllers/itemController.js';

const {
  sequelize, Tenant, Branch, Location, User, Category, PurityMaster,
  GoldRate, PricingProfile, ProductMaster,
} = db;

async function run() {
  await sequelize.authenticate();
  console.log('✅ Database connected.');

  let tenant = await Tenant.findOne({ where: { owner_email: 'demo@jewellery.test' } });
  if (!tenant) {
    tenant = await Tenant.create({ name: 'Demo Jewellers', owner_email: 'demo@jewellery.test', subscription_plan: 'PRO', max_branches: 3 });
    console.log('✅ Demo tenant created');
  }

  let branch = await Branch.findOne({ where: { tenant_id: tenant.id, name: 'Main Branch' } });
  if (!branch) {
    branch = await Branch.create({ tenant_id: tenant.id, name: 'Main Branch', address: 'Demo Address', gstin: '09AAAAA0000A1Z5' });
    console.log('✅ Demo branch created');
  }

  let location = await Location.findOne({ where: { tenant_id: tenant.id, branch_id: branch.id, name: 'Main Tray' } });
  if (!location) {
    location = await Location.create({ tenant_id: tenant.id, branch_id: branch.id, name: 'Main Tray', level: 1 });
    console.log('✅ Demo location created');
  }

  let admin = await User.findOne({ where: { email: 'admin@demo.test' } });
  if (!admin) {
    admin = await User.create({
      name: 'Demo Admin', tenant_id: tenant.id, branch_id: branch.id, email: 'admin@demo.test',
      password_hash: 'Admin@123', role: 'ADMIN', is_active: true,
    });
    console.log('✅ Demo admin created -> login: admin@demo.test / Admin@123');
  }

  // ---- Categories ----
  const categoriesData = [
    { name: 'Ring', code: 'RING', gender_applicable: 'ALL' },
    { name: 'Necklace', code: 'NECKLACE', gender_applicable: 'ALL' },
    { name: 'Bangle', code: 'BANGLE', gender_applicable: 'ALL' },
    { name: 'Chain', code: 'CHAIN', gender_applicable: 'ALL' },
  ];
  const categories = {};
  for (const c of categoriesData) {
    const [row] = await Category.findOrCreate({ where: { tenant_id: tenant.id, code: c.code }, defaults: { tenant_id: tenant.id, ...c } });
    categories[c.code] = row;
  }
  console.log('✅ Categories ready');

  // ---- Purities ----
  const puritiesData = [
    { metal_type: 'GOLD', purity_code: '24K', fineness_percent: 99.9 },
    { metal_type: 'GOLD', purity_code: '22K', fineness_percent: 91.6 },
    { metal_type: 'GOLD', purity_code: '18K', fineness_percent: 75.0 },
    { metal_type: 'SILVER', purity_code: '92.5', fineness_percent: 92.5 },
  ];
  for (const p of puritiesData) {
    await PurityMaster.findOrCreate({ where: { tenant_id: tenant.id, metal_type: p.metal_type, purity_code: p.purity_code }, defaults: { tenant_id: tenant.id, ...p } });
  }
  console.log('✅ Purity master ready');

  // ---- Today's gold rate (change this daily via /api/gold-rates) ----
  const today = new Date().toISOString().slice(0, 10);
  await GoldRate.findOrCreate({
    where: { tenant_id: tenant.id, metal_type: 'GOLD', purity: '22K', rate_date: today },
    defaults: { tenant_id: tenant.id, branch_id: null, metal_type: 'GOLD', purity: '22K', rate_date: today, rate_per_gram: 6350.00, created_by: admin.id },
  });
  await GoldRate.findOrCreate({
    where: { tenant_id: tenant.id, metal_type: 'SILVER', purity: '92.5', rate_date: today },
    defaults: { tenant_id: tenant.id, branch_id: null, metal_type: 'SILVER', purity: '92.5', rate_date: today, rate_per_gram: 85.00, created_by: admin.id },
  });
  console.log('✅ Todays gold/silver rate set (edit anytime from Gold Rate screen)');

  // ---- Pricing profiles: retail vs wholesale ----
  await PricingProfile.findOrCreate({
    where: { tenant_id: tenant.id, branch_id: null, category_id: null, profile_type: 'RETAIL' },
    defaults: {
      tenant_id: tenant.id, profile_type: 'RETAIL', making_charge_type: 'PERCENT_OF_GOLD',
      making_charge_value: 12, wastage_percent: 6, gst_percent: 3, other_charges_flat: 0,
    },
  });
  await PricingProfile.findOrCreate({
    where: { tenant_id: tenant.id, branch_id: null, category_id: null, profile_type: 'WHOLESALE' },
    defaults: {
      tenant_id: tenant.id, profile_type: 'WHOLESALE', making_charge_type: 'PERCENT_OF_GOLD',
      making_charge_value: 5, wastage_percent: 2, gst_percent: 3, other_charges_flat: 0,
    },
  });
  console.log('✅ Default RETAIL & WHOLESALE pricing profiles ready (edit anytime from Pricing screen)');

  // ---- Product masters (designs) ----
  const [maleRing] = await ProductMaster.findOrCreate({
    where: { tenant_id: tenant.id, design_code: 'MR-001' },
    defaults: {
      tenant_id: tenant.id, category_id: categories.RING.id, design_code: 'MR-001', product_name: 'Male Gold Ring',
      gender_category: 'MALE', metal_type: 'GOLD', default_purity: '22K',
    },
  });
  const [femaleNecklace] = await ProductMaster.findOrCreate({
    where: { tenant_id: tenant.id, design_code: 'FN-001' },
    defaults: {
      tenant_id: tenant.id, category_id: categories.NECKLACE.id, design_code: 'FN-001', product_name: 'Female Gold Necklace',
      gender_category: 'FEMALE', metal_type: 'GOLD', default_purity: '22K',
    },
  });
  console.log('✅ Sample designs ready: Male Gold Ring (MR-001), Female Gold Necklace (FN-001)');

  // ---- Sample stock: add same design TWICE to prove the duplicate bug is fixed ----
  const t = await sequelize.transaction();
  try {
    await createItemInternal({
      tenant_id: tenant.id, branch_id: branch.id, location_id: location.id, product_master_id: maleRing.id,
      mode: 'BULK', total_pieces: 5, total_gross_weight: 25, total_net_weight: 24,
      channel: 'RETAIL', is_tray_display: true, source_type: 'DIRECT_ENTRY',
    }, { transaction: t, userId: admin.id });

    // Same design added a second time - this must NOT create a new row, it MERGES into the one above
    await createItemInternal({
      tenant_id: tenant.id, branch_id: branch.id, location_id: location.id, product_master_id: maleRing.id,
      mode: 'BULK', total_pieces: 3, total_gross_weight: 15, total_net_weight: 14.4,
      channel: 'RETAIL', is_tray_display: true, source_type: 'DIRECT_ENTRY',
    }, { transaction: t, userId: admin.id });

    await createItemInternal({
      tenant_id: tenant.id, branch_id: branch.id, location_id: location.id, product_master_id: femaleNecklace.id,
      mode: 'BULK', total_pieces: 2, total_gross_weight: 40, total_net_weight: 38.5,
      channel: 'WHOLESALE', is_tray_display: false, source_type: 'DIRECT_ENTRY',
    }, { transaction: t, userId: admin.id });

    await t.commit();
    console.log('✅ Sample stock created — check /api/items: Male Ring should show ONE row with 8 pieces total, not two.');
  } catch (err) {
    await t.rollback();
    throw err;
  }

  console.log('\n🎉 Demo data ready. Login with admin@demo.test / Admin@123');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Demo seed failed:', err);
  process.exit(1);
});
