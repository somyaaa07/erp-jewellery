// middlewares/tenantScope.js
// Builds req.scope = { tenant_id, branch_id } from the AUTHENTICATED USER.

const tenantScope = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: "Authentication required before tenant scoping",
    });
  }

  // SUPER_ADMIN can access everything
  if (req.user.role === "SUPER_ADMIN") {
    req.scope = {
      tenant_id: null,
      branch_id: null,
      isSuperAdmin: true,
    };

    return next();
  }

  // Every other user must belong to a tenant
  if (!req.user.tenant_id) {
    return res.status(403).json({
      error: "User is not associated with any tenant",
    });
  }

  req.scope = {
    tenant_id: req.user.tenant_id,
    branch_id: req.user.branch_id || null, // null => all branches of this tenant
    isSuperAdmin: false,
  };

  next();
};

export default tenantScope;