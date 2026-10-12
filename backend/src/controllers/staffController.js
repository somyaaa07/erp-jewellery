// backend/src/controllers/staffController.js
import { Op } from 'sequelize';
import db from '../models/index.js';
import { AppError } from '../middlewares/errorHandler.js';
import rbac from '../middlewares/rbac.js';

const { User, StaffProfile, Branch, Tenant, AuditLog } = db;

const ALLOWED_ROLES = ['ADMIN', 'MANAGER', 'SALESMAN', 'KARIGAR_INCHARGE'];
const VALID_STATUSES = ['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED'];
const VALID_EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'PROBATION'];
const VALID_GENDERS = ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY'];

/**
 * Resolve effective tenant_id from authenticated user.
 * SUPER_ADMIN can optionally inspect another tenant via query param.
 */
function resolveTenantId(req) {
  if (req.user.role === 'SUPER_ADMIN') {
    return req.query.tenant_id ? parseInt(req.query.tenant_id, 10) : req.user.tenant_id;
  }
  return req.user.tenant_id;
}

/**
 * Enforce branch scoping:
 * - Branch Managers are strictly scoped to their assigned branch.
 * - Admins and SuperAdmins can query across all branches or filter by any branch within the tenant.
 */
function resolveBranchScope(req) {
  if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'ADMIN') {
    return null;
  }
  return req.user.branch_id || null;
}

// GET /api/staff - List staff members with filters, search, sorting, and pagination
export const listStaff = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId && req.user.role !== 'SUPER_ADMIN') {
      throw new AppError('User is not associated with any tenant', 403);
    }

    const branchScope = resolveBranchScope(req);
    const {
      search,
      branch_id,
      department,
      designation,
      employment_type,
      status,
      role,
      has_login,
      page,
      limit,
      sortBy = 'id',
      sortOrder = 'DESC',
    } = req.query;

    const profileWhere = {};
    if (tenantId) profileWhere.tenant_id = tenantId;

    // Branch isolation: Manager strictly limited to their own branch
    if (branchScope) {
      if (branch_id && parseInt(branch_id, 10) !== branchScope) {
        throw new AppError('Access denied: You are only authorized to view staff in your branch', 403);
      }
      profileWhere.branch_id = branchScope;
    } else if (branch_id) {
      profileWhere.branch_id = parseInt(branch_id, 10);
    }

    if (department && department.trim()) {
      profileWhere.department = department.trim();
    }

    if (designation && designation.trim()) {
      profileWhere.designation = designation.trim();
    }

    if (employment_type && VALID_EMPLOYMENT_TYPES.includes(employment_type)) {
      profileWhere.employment_type = employment_type;
    }

    if (status && VALID_STATUSES.includes(status)) {
      profileWhere.status = status;
    }

    if (has_login === 'true') {
      profileWhere.user_id = { [Op.ne]: null };
    } else if (has_login === 'false') {
      profileWhere.user_id = null;
    }

    const userWhere = {};
    if (role && ALLOWED_ROLES.includes(role)) {
      userWhere.role = role;
    }

    // Search query across name, email, employee_id, phone, department, designation
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      profileWhere[Op.or] = [
        { first_name: { [Op.like]: q } },
        { last_name: { [Op.like]: q } },
        { employee_id: { [Op.like]: q } },
        { email: { [Op.like]: q } },
        { phone: { [Op.like]: q } },
        { department: { [Op.like]: q } },
        { designation: { [Op.like]: q } },
        { '$User.name$': { [Op.like]: q } },
        { '$User.email$': { [Op.like]: q } },
      ];
    }

    // Sorting
    const allowedSortFields = {
      id: ['id', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'],
      first_name: ['first_name', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'],
      last_name: ['last_name', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'],
      employee_id: ['employee_id', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'],
      joining_date: ['joining_date', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'],
      status: ['status', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'],
      department: ['department', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'],
      designation: ['designation', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'],
      created_at: ['created_at', sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC'],
    };
    const order = [allowedSortFields[sortBy] || allowedSortFields.id];

    // Pagination
    const isPaginated = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = isPaginated ? (pageNum - 1) * pageSize : undefined;
    const take = isPaginated ? pageSize : undefined;

    const { count, rows } = await StaffProfile.findAndCountAll({
      where: profileWhere,
      include: [
        {
          model: User,
          as: 'User',
          where: Object.keys(userWhere).length ? userWhere : undefined,
          attributes: ['id', 'name', 'email', 'role', 'is_active', 'branch_id'],
          required: Object.keys(userWhere).length > 0,
        },
        {
          model: Branch,
          as: 'Branch',
          attributes: ['id', 'name', 'address'],
          required: false,
        },
        {
          model: User,
          as: 'ReportingManager',
          attributes: ['id', 'name', 'email', 'role'],
          required: false,
        },
      ],
      order,
      limit: take,
      offset,
      distinct: true,
    });

    res.setHeader('X-Total-Count', count);

    // Apply sensitive field stripping for non-admin users
    const sanitizedRows = rbac.stripStaffSensitiveFields(req, rows);

    if (isPaginated) {
      return res.json({
        data: sanitizedRows,
        pagination: {
          total: count,
          page: pageNum,
          limit: pageSize,
          totalPages: Math.ceil(count / pageSize),
        },
      });
    }

    // Return array directly for backwards compatibility when no page param is supplied
    return res.json(sanitizedRows);
  } catch (err) {
    next(err);
  }
};

// GET /api/staff/:id - View single staff member profile
export const getStaffById = async (req, res, next) => {
  try {
    const tenantId = resolveTenantId(req);
    const branchScope = resolveBranchScope(req);
    const id = parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
      throw new AppError('Invalid staff ID parameter', 400);
    }

    // Try finding by StaffProfile.id first, or fallback to StaffProfile.user_id
    const where = {
      tenant_id: tenantId,
      [Op.or]: [{ id }, { user_id: id }],
    };

    if (branchScope) {
      where.branch_id = branchScope;
    }

    const staff = await StaffProfile.findOne({
      where,
      include: [
        {
          model: User,
          as: 'User',
          attributes: ['id', 'name', 'email', 'role', 'is_active', 'branch_id', 'created_at'],
          required: false,
        },
        {
          model: Branch,
          as: 'Branch',
          attributes: ['id', 'name', 'address', 'gstin'],
          required: false,
        },
        {
          model: User,
          as: 'ReportingManager',
          attributes: ['id', 'name', 'email', 'role'],
          required: false,
        },
      ],
    });

    if (!staff) {
      throw new AppError('Staff member not found or access denied', 404);
    }

    const sanitized = rbac.stripStaffSensitiveFields(req, staff);
    res.json(sanitized);
  } catch (err) {
    next(err);
  }
};

// POST /api/staff - Add a new staff member (with or without login account)
export const createStaff = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      throw new AppError('Tenant context is required', 403);
    }

    const branchScope = resolveBranchScope(req);
    const {
      first_name,
      last_name,
      email,
      phone,
      address,
      dob,
      gender,
      emergency_contact_name,
      emergency_contact_phone,
      department,
      designation,
      employment_type = 'FULL_TIME',
      reporting_manager_id,
      joining_date,
      status = 'ACTIVE',
      notes,
      branch_id,
      employee_id,
      // Login account parameters
      create_login,
      password,
      role = 'SALESMAN',
    } = req.body;

    if (!first_name || !first_name.trim()) {
      throw new AppError('First name is required', 400);
    }

    // Validate employment type and gender if provided
    if (employment_type && !VALID_EMPLOYMENT_TYPES.includes(employment_type)) {
      throw new AppError(`Invalid employment type. Allowed: ${VALID_EMPLOYMENT_TYPES.join(', ')}`, 400);
    }

    if (gender && !VALID_GENDERS.includes(gender)) {
      throw new AppError(`Invalid gender option. Allowed: ${VALID_GENDERS.join(', ')}`, 400);
    }

    // Branch assignment security
    let assignedBranchId = branch_id ? parseInt(branch_id, 10) : null;
    if (branchScope) {
      // Manager can only add staff to their own branch
      assignedBranchId = branchScope;
    } else if (assignedBranchId) {
      // Admin assigning branch: ensure branch belongs to this tenant
      const branch = await Branch.findOne({
        where: { id: assignedBranchId, tenant_id: tenantId },
        transaction: t,
      });
      if (!branch) {
        throw new AppError('Selected branch does not belong to your organization', 400);
      }
    }

    // Validate reporting manager if provided
    let assignedManagerId = reporting_manager_id ? parseInt(reporting_manager_id, 10) : null;
    if (assignedManagerId) {
      const manager = await User.findOne({
        where: { id: assignedManagerId, tenant_id: tenantId },
        transaction: t,
      });
      if (!manager) {
        throw new AppError('Selected reporting manager does not belong to your organization', 400);
      }
      if (!manager.is_active) {
        throw new AppError('Selected reporting manager is inactive and cannot be assigned', 400);
      }
      const allowedManagerRoles = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'];
      if (!allowedManagerRoles.includes(manager.role)) {
        throw new AppError('Selected reporting manager must hold an authorized managerial or administrative role', 400);
      }
      if (email && manager.email.toLowerCase() === email.trim().toLowerCase()) {
        throw new AppError('An employee cannot be their own reporting manager', 400);
      }
    }

    // Determine if a login account is to be created
    const wantsLogin = create_login === true || (create_login === undefined && Boolean(password && password.trim()));

    let user = null;
    if (wantsLogin) {
      if (!email || !email.trim()) {
        throw new AppError('Email address is required to create a login account', 400);
      }

      if (!ALLOWED_ROLES.includes(role)) {
        throw new AppError(`Invalid role. Allowed roles: ${ALLOWED_ROLES.join(', ')}`, 400);
      }

      if ((branchScope || req.user.role === 'MANAGER') && (role === 'ADMIN' || role === 'SUPER_ADMIN')) {
        throw new AppError('Branch Managers cannot assign administrative roles', 403);
      }

      const cleanEmail = email.trim().toLowerCase();
      const existingUser = await User.findOne({ where: { email: cleanEmail }, transaction: t });
      if (existingUser) {
        throw new AppError('A login account with this email address already exists', 400);
      }

      const defaultPassword = password && password.trim() ? password.trim() : 'Staff@123';
      const fullName = `${first_name.trim()} ${last_name ? last_name.trim() : ''}`.trim();

      user = await User.create(
        {
          tenant_id: tenantId,
          branch_id: assignedBranchId,
          name: fullName,
          email: cleanEmail,
          password_hash: defaultPassword,
          role,
          is_active: status === 'ACTIVE',
        },
        { transaction: t }
      );
    }

    // Generate unique employee_id within tenant if not provided
    let finalEmpId = employee_id?.trim();
    if (!finalEmpId) {
      const count = await StaffProfile.count({ where: { tenant_id: tenantId }, transaction: t });
      finalEmpId = `EMP-${String(count + 1).padStart(4, '0')}`;
    } else {
      const existingProfile = await StaffProfile.findOne({
        where: { tenant_id: tenantId, employee_id: finalEmpId },
        transaction: t,
      });
      if (existingProfile) {
        throw new AppError(`Employee ID '${finalEmpId}' already exists in your organization`, 400);
      }
    }

    // Create StaffProfile
    const profile = await StaffProfile.create(
      {
        user_id: user ? user.id : null,
        tenant_id: tenantId,
        branch_id: assignedBranchId,
        employee_id: finalEmpId,
        first_name: first_name.trim(),
        last_name: last_name ? last_name.trim() : '',
        email: email ? email.trim().toLowerCase() : (user ? user.email : null),
        phone: phone ? phone.trim() : null,
        dob: dob || null,
        gender: gender || null,
        address: address ? address.trim() : null,
        emergency_contact_name: emergency_contact_name ? emergency_contact_name.trim() : null,
        emergency_contact_phone: emergency_contact_phone ? emergency_contact_phone.trim() : null,
        department: department ? department.trim() : null,
        designation: designation ? designation.trim() : (role ? role.replace('_', ' ') : 'Staff'),
        employment_type: VALID_EMPLOYMENT_TYPES.includes(employment_type) ? employment_type : 'FULL_TIME',
        reporting_manager_id: assignedManagerId,
        joining_date: joining_date || new Date().toISOString().slice(0, 10),
        status: VALID_STATUSES.includes(status) ? status : 'ACTIVE',
        notes: notes ? notes.trim() : null,
        transfer_history: [],
      },
      { transaction: t, userId: req.user.id }
    );

    // Record explicit audit log entry
    await AuditLog.create(
      {
        tenant_id: tenantId,
        table_name: 'staff_profiles',
        record_id: profile.id,
        action: 'CREATE',
        before_data: null,
        after_data: {
          id: profile.id,
          employee_id: profile.employee_id,
          name: `${profile.first_name} ${profile.last_name}`,
          user_id: profile.user_id,
          branch_id: profile.branch_id,
          status: profile.status,
        },
        operator_id: req.user.id,
      },
      { transaction: t }
    );

    await t.commit();

    const created = await StaffProfile.findByPk(profile.id, {
      include: [
        { model: User, as: 'User', attributes: ['id', 'name', 'email', 'role', 'is_active', 'branch_id'] },
        { model: Branch, as: 'Branch', attributes: ['id', 'name', 'address'] },
        { model: User, as: 'ReportingManager', attributes: ['id', 'name', 'email', 'role'] },
      ],
    });

    res.status(201).json(created);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// PUT /api/staff/:id - Edit staff member details
export const updateStaff = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const tenantId = resolveTenantId(req);
    const branchScope = resolveBranchScope(req);
    const id = parseInt(req.params.id, 10);

    if (Number.isNaN(id)) {
      throw new AppError('Invalid staff ID parameter', 400);
    }

    const profileWhere = {
      tenant_id: tenantId,
      [Op.or]: [{ id }, { user_id: id }],
    };
    if (branchScope) {
      profileWhere.branch_id = branchScope;
    }

    const profile = await StaffProfile.findOne({ where: profileWhere, transaction: t });
    if (!profile) {
      throw new AppError('Staff member not found or access denied', 404);
    }

    const {
      first_name,
      last_name,
      email,
      phone,
      address,
      dob,
      gender,
      emergency_contact_name,
      emergency_contact_phone,
      department,
      designation,
      employment_type,
      reporting_manager_id,
      joining_date,
      status,
      notes,
      branch_id,
      employee_id,
      // Login account options
      create_login,
      password,
      role,
    } = req.body;

    const previousProfileData = profile.toJSON();

    // Employee ID uniqueness check if updated
    if (employee_id && employee_id.trim() !== profile.employee_id) {
      const empExists = await StaffProfile.findOne({
        where: {
          tenant_id: tenantId,
          employee_id: employee_id.trim(),
          id: { [Op.ne]: profile.id },
        },
        transaction: t,
      });
      if (empExists) {
        throw new AppError(`Employee ID '${employee_id.trim()}' is already in use`, 400);
      }
      profile.employee_id = employee_id.trim();
    }

    // Branch update check (Admins only)
    if (branch_id !== undefined && !branchScope) {
      if (branch_id) {
        const branch = await Branch.findOne({
          where: { id: branch_id, tenant_id: tenantId },
          transaction: t,
        });
        if (!branch) {
          throw new AppError('Selected branch does not belong to your organization', 400);
        }
        profile.branch_id = branch_id;
      } else {
        profile.branch_id = null;
      }
    }

    // Validate reporting manager
    if (reporting_manager_id !== undefined) {
      if (reporting_manager_id) {
        const mgrId = parseInt(reporting_manager_id, 10);
        if (mgrId === profile.user_id || mgrId === profile.id) {
          throw new AppError('An employee cannot be their own reporting manager', 400);
        }
        const manager = await User.findOne({
          where: { id: mgrId, tenant_id: tenantId },
          transaction: t,
        });
        if (!manager) {
          throw new AppError('Selected reporting manager does not belong to your organization', 400);
        }
        if (profile.email && manager.email.toLowerCase() === profile.email.toLowerCase()) {
          throw new AppError('An employee cannot be their own reporting manager', 400);
        }
        if (!manager.is_active) {
          throw new AppError('Selected reporting manager is inactive and cannot be assigned', 400);
        }
        const allowedManagerRoles = ['ADMIN', 'MANAGER', 'SUPER_ADMIN'];
        if (!allowedManagerRoles.includes(manager.role)) {
          throw new AppError('Selected reporting manager must hold an authorized managerial or administrative role', 400);
        }
        profile.reporting_manager_id = mgrId;
      } else {
        profile.reporting_manager_id = null;
      }
    }

    // Update Profile fields
    if (first_name) profile.first_name = first_name.trim();
    if (last_name !== undefined) profile.last_name = last_name ? last_name.trim() : '';
    if (email !== undefined) profile.email = email ? email.trim().toLowerCase() : null;
    if (phone !== undefined) profile.phone = phone ? phone.trim() : null;
    if (address !== undefined) profile.address = address ? address.trim() : null;
    if (dob !== undefined) profile.dob = dob || null;
    if (gender && VALID_GENDERS.includes(gender)) profile.gender = gender;
    if (emergency_contact_name !== undefined) profile.emergency_contact_name = emergency_contact_name ? emergency_contact_name.trim() : null;
    if (emergency_contact_phone !== undefined) profile.emergency_contact_phone = emergency_contact_phone ? emergency_contact_phone.trim() : null;
    if (department !== undefined) profile.department = department ? department.trim() : null;
    if (designation !== undefined) profile.designation = designation ? designation.trim() : null;
    if (employment_type && VALID_EMPLOYMENT_TYPES.includes(employment_type)) profile.employment_type = employment_type;
    if (joining_date !== undefined) profile.joining_date = joining_date || null;
    if (status && VALID_STATUSES.includes(status)) profile.status = status;
    if (notes !== undefined) profile.notes = notes ? notes.trim() : null;

    // Handle User account synchronization or creation
    let user = null;
    if (profile.user_id) {
      user = await User.findOne({ where: { id: profile.user_id, tenant_id: tenantId }, transaction: t });
    }

    const effectiveFullName = `${profile.first_name} ${profile.last_name || ''}`.trim();

    if (user) {
      user.name = effectiveFullName;
      if (profile.branch_id !== undefined) user.branch_id = profile.branch_id;

      // Update email if changed
      const cleanEmail = email ? email.trim().toLowerCase() : user.email;
      if (cleanEmail !== user.email) {
        const emailTaken = await User.findOne({
          where: { email: cleanEmail, id: { [Op.ne]: user.id } },
          transaction: t,
        });
        if (emailTaken) {
          throw new AppError('Email is already taken by another account', 400);
        }
        user.email = cleanEmail;
      }

      // Update role
      if (role) {
        if (!ALLOWED_ROLES.includes(role)) {
          throw new AppError('Invalid role assignment', 400);
        }
        if ((branchScope || req.user.role === 'MANAGER') && (role === 'ADMIN' || role === 'SUPER_ADMIN')) {
          throw new AppError('Branch Managers cannot assign administrative roles', 403);
        }
        user.role = role;
      }

      // Update password if supplied
      if (password && password.trim()) {
        user.password_hash = password.trim();
      }

      if (status && VALID_STATUSES.includes(status)) {
        user.is_active = status === 'ACTIVE';
      }

      await user.save({ transaction: t });
    } else if (create_login && password && password.trim()) {
      // Create new login account for this staff member
      const cleanEmail = (email || profile.email)?.trim().toLowerCase();
      if (!cleanEmail) {
        throw new AppError('Email address is required to create a login account', 400);
      }
      const existingUser = await User.findOne({ where: { email: cleanEmail }, transaction: t });
      if (existingUser) {
        throw new AppError('A login account with this email already exists', 400);
      }

      const assignedRole = role && ALLOWED_ROLES.includes(role) ? role : 'SALESMAN';
      if ((branchScope || req.user.role === 'MANAGER') && (assignedRole === 'ADMIN' || assignedRole === 'SUPER_ADMIN')) {
        throw new AppError('Branch Managers cannot assign administrative roles', 403);
      }

      user = await User.create(
        {
          tenant_id: tenantId,
          branch_id: profile.branch_id,
          name: effectiveFullName,
          email: cleanEmail,
          password_hash: password.trim(),
          role: assignedRole,
          is_active: profile.status === 'ACTIVE',
        },
        { transaction: t }
      );
      profile.user_id = user.id;
    }

    await profile.save({ transaction: t, userId: req.user.id });

    // Record audit log
    await AuditLog.create(
      {
        tenant_id: tenantId,
        table_name: 'staff_profiles',
        record_id: profile.id,
        action: 'UPDATE',
        before_data: previousProfileData,
        after_data: profile.toJSON(),
        operator_id: req.user.id,
      },
      { transaction: t }
    );

    await t.commit();

    const updated = await StaffProfile.findByPk(profile.id, {
      include: [
        { model: User, as: 'User', attributes: ['id', 'name', 'email', 'role', 'is_active', 'branch_id'] },
        { model: Branch, as: 'Branch', attributes: ['id', 'name', 'address'] },
        { model: User, as: 'ReportingManager', attributes: ['id', 'name', 'email', 'role'] },
      ],
    });

    const sanitized = rbac.stripStaffSensitiveFields(req, updated);
    res.json(sanitized);
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// PATCH /api/staff/:id/status - Toggle/Update staff status (Soft activate/deactivate)
export const updateStaffStatus = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const tenantId = resolveTenantId(req);
    const branchScope = resolveBranchScope(req);
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      throw new AppError(`Status must be one of: ${VALID_STATUSES.join(', ')}`, 400);
    }

    const where = {
      tenant_id: tenantId,
      [Op.or]: [{ id }, { user_id: id }],
    };
    if (branchScope) {
      where.branch_id = branchScope;
    }

    const profile = await StaffProfile.findOne({ where, transaction: t });
    if (!profile) {
      throw new AppError('Staff member not found or access denied', 404);
    }

    const oldStatus = profile.status;
    profile.status = status;
    await profile.save({ transaction: t, userId: req.user.id });

    // Synchronize login account state if present
    if (profile.user_id) {
      const user = await User.findByPk(profile.user_id, { transaction: t });
      if (user) {
        user.is_active = status === 'ACTIVE';
        await user.save({ transaction: t });
      }
    }

    await AuditLog.create(
      {
        tenant_id: tenantId,
        table_name: 'staff_profiles',
        record_id: profile.id,
        action: 'UPDATE',
        before_data: { status: oldStatus },
        after_data: { status: profile.status, is_active: profile.status === 'ACTIVE' },
        operator_id: req.user.id,
      },
      { transaction: t }
    );

    await t.commit();

    res.json({
      id: profile.id,
      employee_id: profile.employee_id,
      name: `${profile.first_name} ${profile.last_name || ''}`.trim(),
      status: profile.status,
      is_active: profile.status === 'ACTIVE',
      message: `Staff member marked as ${profile.status}. Historical records preserved.`,
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};

// PATCH /api/staff/:id/deactivate and DELETE /api/staff/:id - Soft deactivation preserving all historical data
export const deactivateStaff = async (req, res, next) => {
  req.body = { status: 'INACTIVE' };
  return updateStaffStatus(req, res, next);
};

// PATCH /api/staff/:id/branch - Transfer staff to another branch (Admin only)
export const transferStaffBranch = async (req, res, next) => {
  const t = await db.sequelize.transaction();
  try {
    const tenantId = resolveTenantId(req);

    if (req.user.role !== 'ADMIN' && req.user.role !== 'SUPER_ADMIN') {
      throw new AppError('Only organization Administrators can perform branch transfers', 403);
    }

    const id = parseInt(req.params.id, 10);
    const { to_branch_id, effective_date, reason } = req.body;

    if (!to_branch_id) {
      throw new AppError('Destination branch is required', 400);
    }

    // Verify destination branch belongs to this tenant
    const destBranch = await Branch.findOne({
      where: { id: to_branch_id, tenant_id: tenantId },
      transaction: t,
    });
    if (!destBranch) {
      throw new AppError('Destination branch does not belong to your organization', 400);
    }

    const profile = await StaffProfile.findOne({
      where: {
        tenant_id: tenantId,
        [Op.or]: [{ id }, { user_id: id }],
      },
      include: [{ model: Branch, as: 'Branch', attributes: ['id', 'name'] }],
      transaction: t,
    });

    if (!profile) {
      throw new AppError('Staff member not found', 404);
    }

    const fromBranchId = profile.branch_id;
    const fromBranchName = profile.Branch ? profile.Branch.name : 'Unassigned';

    profile.branch_id = destBranch.id;

    // Append transfer log in transfer_history
    const history = Array.isArray(profile.transfer_history) ? [...profile.transfer_history] : [];
    const transferRecord = {
      date: new Date().toISOString(),
      effective_date: effective_date || new Date().toISOString().slice(0, 10),
      from_branch_id: fromBranchId,
      from_branch_name: fromBranchName,
      to_branch_id: destBranch.id,
      to_branch_name: destBranch.name,
      reason: reason || 'Branch Transfer',
      transferred_by_user_id: req.user.id,
      transferred_by_name: req.user.name,
    };
    history.push(transferRecord);
    profile.transfer_history = history;

    await profile.save({ transaction: t, userId: req.user.id });

    // Sync with User record if mapped
    if (profile.user_id) {
      const user = await User.findByPk(profile.user_id, { transaction: t });
      if (user) {
        user.branch_id = destBranch.id;
        await user.save({ transaction: t });
      }
    }

    await AuditLog.create(
      {
        tenant_id: tenantId,
        table_name: 'staff_profiles',
        record_id: profile.id,
        action: 'UPDATE',
        before_data: { branch_id: fromBranchId, branch_name: fromBranchName },
        after_data: { branch_id: destBranch.id, branch_name: destBranch.name, reason: transferRecord.reason },
        operator_id: req.user.id,
      },
      { transaction: t }
    );

    await t.commit();

    const result = await StaffProfile.findByPk(profile.id, {
      include: [
        { model: User, as: 'User', attributes: ['id', 'name', 'email', 'role', 'is_active', 'branch_id'] },
        { model: Branch, as: 'Branch', attributes: ['id', 'name', 'address'] },
        { model: User, as: 'ReportingManager', attributes: ['id', 'name', 'email', 'role'] },
      ],
    });

    res.json({
      message: `Staff member successfully transferred to ${destBranch.name}`,
      staff: result,
    });
  } catch (err) {
    await t.rollback();
    next(err);
  }
};
