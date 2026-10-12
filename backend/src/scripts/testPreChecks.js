import db from '../models/index.js';

const { Branch, StaffProfile, User } = db;

async function runPreChecks() {
  console.log('Running Pre-Phase 3 Verification Checks...');
  let passed = 0;
  let total = 0;

  function assert(cond, msg) {
    total++;
    if (cond) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
    }
  }

  try {
    // Check 1: Branch deletion protection
    // Find a branch that has staff
    const branchWithStaff = await Branch.findOne({
      include: [{ model: StaffProfile, as: 'staffProfiles', required: true }]
    });

    if (branchWithStaff) {
      let threw = false;
      try {
        await branchWithStaff.destroy();
      } catch (err) {
        threw = true;
        assert(err.message.includes('Cannot delete branch'), 'Branch.destroy() blocked because staff depend on it');
      }
      assert(threw, 'Branch deletion threw error as expected');
    } else {
      console.log('Notice: No branch with staff currently in DB to test destroy hook directly, verified hook registered');
      assert(typeof Branch.hooks?.beforeDestroy === 'function' || Branch.hasHook('beforeDestroy'), 'Branch beforeDestroy hook is registered');
    }

    // Check 2: Verify foreign key behavior: branch_id is nullable (ON DELETE SET NULL)
    const [cols] = await db.sequelize.query("SHOW COLUMNS FROM staff_profiles LIKE 'branch_id'");
    assert(cols[0].Null === 'YES', 'staff_profiles.branch_id column is nullable (safe for ON DELETE SET NULL)');

    console.log(`\nPre-check summary: ${passed}/${total} passed`);
  } catch (err) {
    console.error('Pre-check error:', err);
  } finally {
    await db.sequelize.close();
  }
}

runPreChecks();
