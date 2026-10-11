// scripts/seedDemoData.js
// Creates a working demo setup so the app can be tested immediately:
// tenant -> branch -> storage hierarchy (safe, boxes, counters) -> admin user -> categories ->
// purities -> gold rates -> pricing profiles -> designs -> opening stock -> display trays on
// counters -> a design with an unknown quantity -> a design issued to a karigar.
//
// It shows the current rules: one box holds many designs, one design can sit in several boxes and
// on several counters, and a quantity that is not final is never stored as zero.
//
// Usage: npm run db:seed:demo
import dotenv from 'dotenv';
dotenv.config();
import db from '../models/index.js';

const {
  sequelize, Tenant, Branch, Location, User, Category, PurityMaster,
  GoldRate, PricingProfile, Item,
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

  // ---- Storage hierarchy (Safe > Box > Sub-box, Counters, Display Tray root) ----
  // Wholesale Store = the Main Safe. Its boxes (dibbas) can hold many designs each.
  const place = async (name, parent, storage_type, container_type) => {
    const [row] = await Location.findOrCreate({
      where: { tenant_id: tenant.id, branch_id: branch.id, name, parent_id: parent ? parent.id : null },
      defaults: {
        tenant_id: tenant.id, branch_id: branch.id, name, parent_id: parent ? parent.id : null,
        level: parent ? parent.level + 1 : 1, storage_type, container_type, empty_weight: 0,
      },
    });
    return row;
  };
  const mainSafe = await place('Main Safe', null, 'WHOLESALE_STORE', 'SAFE');
  const boxD1 = await place('Dibba D1', mainSafe, 'GENERAL', 'BOX');
  const boxD2 = await place('Dibba D2', mainSafe, 'GENERAL', 'BOX');
  const boxD2A = await place('Dibba D2-A', boxD2, 'GENERAL', 'BOX');
  const boxD6 = await place('Dibba D6', mainSafe, 'GENERAL', 'BOX');
  const boxD7 = await place('Dibba D7', mainSafe, 'GENERAL', 'BOX');
  // The Display Tray root is its own top-level place, not inside the Main Safe.
  await place('Display Tray', null, 'TRAY_DISPLAY', 'OTHER');
  const counter1 = await place('Counter C1', null, 'GENERAL', 'COUNTER');
  const counter2 = await place('Counter C2', null, 'GENERAL', 'COUNTER');
  console.log('✅ Storage hierarchy ready: Main Safe > Dibba D1, D2 (> D2-A), D6, D7; Counters C1, C2; Display Tray');

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
    { name: 'Kundal', code: 'KUNDAL', gender_applicable: 'FEMALE' },
    { name: 'Baali', code: 'BAALI', gender_applicable: 'FEMALE' },
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

  // ---- Designs, stock, trays and karigar ----
  // Everything below goes through the same controller functions the screens use, so the demo data
  // follows exactly the same rules (box placement, opening stock, tray deduction, karigar flow).
  const call = (fn, { body = {}, query = {}, params = {} } = {}) => new Promise((resolve, reject) => {
    const req = {
      body, query, params,
      user: { id: admin.id, name: admin.name, role: 'ADMIN' },
      scope: { tenant_id: tenant.id, branch_id: branch.id },
    };
    const res = { status(code) { this.code = code; return this; }, json(data) { resolve(data); } };
    fn(req, res, reject);
  });
  const { createProductMaster } = await import('../controllers/productMasterController.js');
  const { createOpeningStock } = await import('../controllers/openingStockController.js');
  const { createTray, addPiece } = await import('../controllers/displayTrayController.js');
  const { placeDesign } = await import('../controllers/locationController.js');
  const { createManufacturingOrder } = await import('../controllers/manufacturingController.js');

  const alreadyStocked = await Item.count({ where: { tenant_id: tenant.id } });
  if (alreadyStocked > 0) {
    console.log('ℹ️  Stock already exists, skipping sample designs and stock.');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const design = (category, code, name, extra = {}) => call(createProductMaster, {
      body: {
        category_id: categories[category].id, design_code: code, product_name: name,
        metal_type: 'GOLD', default_purity: '22K', gender_category: extra.gender || 'UNISEX',
        box_location_id: extra.box ? extra.box.id : undefined,
      },
    });

    // Designs are created inside a box (or none: they land in the "Unallocated" box). Quantity stays
    // "not final" until opening stock or a purchase gives it a real number.
    const maleRing = await design('RING', 'MR-001', 'Male Gold Ring', { gender: 'MALE', box: boxD1 });
    const ladiesRing = await design('RING', 'LR-001', 'Ladies Ring', { gender: 'FEMALE', box: boxD1 });
    const necklace = await design('NECKLACE', 'FN-001', 'Female Gold Necklace', { gender: 'FEMALE', box: boxD2 });
    const kundal = await design('KUNDAL', 'KD-001', 'Kundal Plain', { gender: 'FEMALE', box: boxD2 });
    const baali = await design('BAALI', 'BL-001', 'Baali', { gender: 'FEMALE', box: boxD6 });
    const chain = await design('CHAIN', 'CH-001', 'Gold Chain', { box: boxD7 });         // quantity not final
    const necklaceSet = await design('NECKLACE', 'NS-001', 'Necklace Set', { box: boxD7 }); // goes to the karigar
    await design('BANGLE', 'BG-001', 'Gold Bangle');                                       // no box chosen
    console.log('✅ 8 designs created (one box holds several designs; BG-001 has no box -> "Unallocated")');

    // Opening stock: quantity and weight per design, entered once.
    const opening = (d, pieces, weight) => call(createOpeningStock, {
      body: { product_master_id: d.id, opening_pieces: pieces, opening_weight: weight, as_on_date: today, notes: 'Demo opening stock' },
    });
    await opening(maleRing, 8, 40);
    await opening(ladiesRing, 12, 30);
    await opening(necklace, 2, 40);
    await opening(kundal, 20, 60);
    await opening(baali, 10, 80);
    console.log('✅ Opening stock entered (CH-001, NS-001 and BG-001 stay "quantity not final")');

    // The same design can also sit in a second box.
    await call(placeDesign, { params: { id: boxD2A.id }, body: { product_master_id: maleRing.id, pieces: 4, weight: 20 } });
    console.log('✅ Male Gold Ring is also in Dibba D2-A (4 pcs): one design, two boxes');

    // Trays on counters. Each piece is entered one by one and is taken out of wholesale stock.
    const tray1 = await call(createTray, { body: { name: 'T1', total_slots: 4, location_id: counter1.id } });
    const tray2 = await call(createTray, { body: { name: 'T2', total_slots: 4, location_id: counter2.id } });
    // source_location_id says which dibba the piece is taken from (otherwise the system picks one).
    const piece = (tray, d, weight, fromBox) => call(addPiece, {
      params: { id: tray.id }, body: { product_master_id: d.id, weight, source_location_id: fromBox.id },
    });
    await piece(tray1, maleRing, 5.1, boxD1);
    await piece(tray1, maleRing, 4.8, boxD1);
    await piece(tray1, ladiesRing, 2.5, boxD1);
    await piece(tray2, maleRing, 5.0, boxD1);
    await piece(tray2, kundal, 3.1, boxD2);
    console.log('✅ Trays T1 (Counter C1) and T2 (Counter C2) filled; the same design is on both counters');

    // Karigar: the Necklace Set has no final quantity, so it is issued as it is and the finished
    // pieces will later be received back into the same stock row.
    const lot = await Item.findOne({ where: { tenant_id: tenant.id, product_master_id: necklaceSet.id } });
    await call(createManufacturingOrder, {
      body: { karigar_name: 'Ramesh Karigar', product_master_id: necklaceSet.id, issued_weight: 120, expected_pieces: 6, source_item_id: lot.id, notes: 'Demo order' },
    });
    console.log('✅ Necklace Set issued to Ramesh Karigar (receive it from the Karigar screen)');
  }

  console.log('\n🎉 Demo data ready. Login with admin@demo.test / Admin@123');
  console.log('   Open Storage Map to see the hierarchy, Find Stock to search, Display Trays for T1 / T2.');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Demo seed failed:', err);
  process.exit(1);
});