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
  ],

  SALESMAN: [
    "INVENTORY_VIEW",
    "POS_VIEW",
    "POS_BILL",
  ],

  KARIGAR_INCHARGE: [
    "KARIGAR_VIEW",
    "KARIGAR_EDIT",
    "INVENTORY_VIEW",
  ],
};

const SENSITIVE_FIELDS = [
  "profit_margin",
  "cost_price",
  "total_stock_valuation",
  "making_margin_profit",
];

const rbac = (requiredPermission) => {
  return (req, res, next) => {
    const role = req.user?.role;

    if (!role) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    const allowed = PERMISSIONS[role] || [];

    if (
      allowed.includes("*") ||
      allowed.includes(requiredPermission)
    ) {
      return next();
    }

    return res.status(403).json({
      error: `Role '${role}' lacks permission '${requiredPermission}'`,
    });
  };
};

// Remove sensitive fields for non-admin users
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

export default rbac;