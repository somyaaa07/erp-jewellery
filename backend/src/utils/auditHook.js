// utils/auditHook.js
// Attach to any model that needs tamper-proof history.
// Pass options.userId when calling Sequelize methods:
//   item.update(data, { userId: req.user.id })
//
// The audit row is written inside the caller's transaction (options.transaction). Without that,
// a rolled-back sale or stock entry would still leave an audit row behind, so the log would
// claim something happened that never actually did.
import db from "../models/index.js";

const writeLog = async (Model, instance, options, action, before, after) => {
  try {
    await db.AuditLog.create(
      {
        tenant_id: instance.tenant_id || null,
        table_name: Model.tableName,
        record_id: instance.id,
        action,
        before_data: before,
        after_data: after,
        operator_id: options?.userId || null,
      },
      { transaction: options?.transaction }
    );
  } catch (err) {
    // Audit logging must never be the reason a real business operation fails.
    console.error(`Audit log failed for ${Model.tableName}#${instance.id}:`, err.message);
  }
};

const attachAuditHooks = (Model) => {
  Model.addHook("afterCreate", (instance, options) =>
    writeLog(Model, instance, options, "CREATE", null, instance.toJSON())
  );

  Model.addHook("afterUpdate", (instance, options) =>
    writeLog(Model, instance, options, "UPDATE", instance._previousDataValues, instance.toJSON())
  );

  Model.addHook("afterDestroy", (instance, options) =>
    writeLog(Model, instance, options, "DELETE", instance.toJSON(), null)
  );
};

export default attachAuditHooks;
