// middlewares/rbac.js
// Usage:
// router.get("/items", auth, tenantScope, rbac("INVENTORY_VIEW"), controller.list)

const PERMISSIONS = {
  SUPER_ADMIN: ["*"],

  ADMIN: [
    "INVENTORY_VIEW",
    "INVENTORY_EDIT",
    "POS_VIEW",
    "POS_BILL",
    "ACCOUNTING_VIEW",
    "ACCOUNTING_EDIT",
    "ACCOUNTING_VIEW_MARGIN",
    "PURCHASING_VIEW",
    "PURCHASING_EDIT",
    "HR_VIEW",
    "HR_EDIT",
    "HR_APPROVE_L1",
    "HR_APPROVE_L2",
    "KARIGAR_VIEW",
    "KARIGAR_EDIT",
    "USER_MANAGE",
    "RATE_LOCK",
    "AUDIT_VIEW",
    // Staff Directory permissions
    "STAFF_VIEW",
    "STAFF_CREATE",
    "STAFF_EDIT",
    "STAFF_DEACTIVATE",
    "STAFF_VIEW_SENSITIVE",
    // Attendance & Shift permissions
    "ATTENDANCE_VIEW",
    "ATTENDANCE_MARK",
    "ATTENDANCE_EDIT",
    "ATTENDANCE_REPORT",
    "SHIFT_VIEW",
    "SHIFT_MANAGE",
    // Leave Management permissions
    "LEAVE_VIEW",
    "LEAVE_RECORD",
    "LEAVE_CANCEL",
    "LEAVE_BALANCE_VIEW",
    "LEAVE_TYPE_MANAGE",
  ],

  MANAGER: [
    "INVENTORY_VIEW",
    "INVENTORY_EDIT",
    "POS_VIEW",
    "POS_BILL",
    "ACCOUNTING_VIEW",
    "PURCHASING_VIEW",
    "PURCHASING_EDIT",
    "HR_VIEW",
    "HR_EDIT",
    "HR_APPROVE_L1",
    "KARIGAR_VIEW",
    "KARIGAR_EDIT",
    "RATE_LOCK",
    // Staff Directory permissions (cannot view sensitive info like emergency/dob)
    "STAFF_VIEW",
    "STAFF_CREATE",
    "STAFF_EDIT",
    "STAFF_DEACTIVATE",
    // Attendance & Shift permissions (branch-scoped)
    "ATTENDANCE_VIEW",
    "ATTENDANCE_MARK",
    "ATTENDANCE_EDIT",
    "ATTENDANCE_REPORT",
    "SHIFT_VIEW",
    // Leave Management permissions (branch-scoped)
    "LEAVE_VIEW",
    "LEAVE_RECORD",
    "LEAVE_CANCEL",
    "LEAVE_BALANCE_VIEW",
  ],

  SALESMAN: [
    "INVENTORY_VIEW",
    "POS_VIEW",
    "POS_BILL",
    "ATTENDANCE_VIEW",
  ],

  KARIGAR_INCHARGE: [
    "KARIGAR_VIEW",
    "KARIGAR_EDIT",
    "INVENTORY_VIEW",
    "ATTENDANCE_VIEW",
  ],
};

const SENSITIVE_FIELDS = [
  "profit_margin",
  "cost_price",
  "total_stock_valuation",
  "making_margin_profit",
];

const STAFF_SENSITIVE_FIELDS = [
  "emergency_contact_name",
  "emergency_contact_phone",
  "dob",
];

// Mapping for backward compatibility with legacy HR permissions
const PERMISSION_ALIASES = {
  STAFF_VIEW: ["HR_VIEW"],
  STAFF_CREATE: ["HR_EDIT"],
  STAFF_EDIT: ["HR_EDIT"],
  STAFF_DEACTIVATE: ["HR_EDIT", "USER_MANAGE"],
  ATTENDANCE_VIEW: ["HR_VIEW"],
  ATTENDANCE_MARK: ["HR_EDIT"],
  ATTENDANCE_EDIT: ["HR_EDIT"],
  ATTENDANCE_REPORT: ["HR_VIEW"],
  SHIFT_VIEW: ["HR_VIEW"],
  SHIFT_MANAGE: ["HR_EDIT"],
  LEAVE_VIEW: ["HR_VIEW"],
  LEAVE_RECORD: ["HR_EDIT"],
  LEAVE_CANCEL: ["HR_EDIT"],
  LEAVE_BALANCE_VIEW: ["HR_VIEW"],
  LEAVE_TYPE_MANAGE: ["HR_EDIT"],
};

const rbac = (requiredPermission) => {
  return (req, res, next) => {
    const role = req.user?.role;

    if (!role) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    const allowed = PERMISSIONS[role] || [];
    const aliases = PERMISSION_ALIASES[requiredPermission] || [];

    if (
      allowed.includes("*") ||
      allowed.includes(requiredPermission) ||
      aliases.some((alias) => allowed.includes(alias))
    ) {
      return next();
    }

    return res.status(403).json({
      error: `Role '${role}' lacks permission '${requiredPermission}'`,
    });
  };
};

// Check if user has permission
rbac.hasPermission = (user, permission) => {
  if (!user || !user.role) return false;
  const allowed = PERMISSIONS[user.role] || [];
  if (allowed.includes("*") || allowed.includes(permission)) return true;
  const aliases = PERMISSION_ALIASES[permission] || [];
  return aliases.some((a) => allowed.includes(a));
};

// Remove inventory/accounting sensitive fields for non-admin users
rbac.stripSensitiveFields = (req, data) => {
  const canSeeMargins =
    PERMISSIONS[req.user.role]?.includes(
      "ACCOUNTING_VIEW_MARGIN"
    ) ||
    PERMISSIONS[req.user.role]?.includes("*");

  if (canSeeMargins) {
    return data;
  }

  const strip = (obj) => {
    const clone = { ...obj };

    SENSITIVE_FIELDS.forEach((field) => {
      delete clone[field];
    });

    return clone;
  };

  return Array.isArray(data)
    ? data.map(strip)
    : strip(data);
};

// Remove staff sensitive fields for users without STAFF_VIEW_SENSITIVE
rbac.stripStaffSensitiveFields = (req, data) => {
  const canSeeSensitive =
    req.user?.role === "SUPER_ADMIN" ||
    req.user?.role === "ADMIN" ||
    PERMISSIONS[req.user?.role]?.includes("STAFF_VIEW_SENSITIVE") ||
    PERMISSIONS[req.user?.role]?.includes("*");

  if (canSeeSensitive) {
    return data;
  }

  const strip = (item) => {
    if (!item) return item;
    const raw = typeof item.toJSON === "function" ? item.toJSON() : { ...item };
    
    // Strip from root if present
    STAFF_SENSITIVE_FIELDS.forEach((field) => {
      if (field in raw) delete raw[field];
    });

    // Strip from StaffProfile nested relation if present
    if (raw.StaffProfile) {
      raw.StaffProfile = { ...raw.StaffProfile };
      STAFF_SENSITIVE_FIELDS.forEach((field) => {
        delete raw.StaffProfile[field];
      });
    }

    return raw;
  };

  return Array.isArray(data) ? data.map(strip) : strip(data);
};

export default rbac;