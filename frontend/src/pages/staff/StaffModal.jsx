// frontend/src/pages/staff/StaffModal.jsx
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Modal, errorMessage } from '../../components/ui';

const ROLES = [
  { value: 'SALESMAN', label: 'Salesman (POS / Billing & Stock View)' },
  { value: 'MANAGER', label: 'Branch Manager (Branch Operations)' },
  { value: 'KARIGAR_INCHARGE', label: 'Karigar In-charge (Manufacturing / Workshop)' },
  { value: 'ADMIN', label: 'Store Admin (Full Store Administration)' },
];

const STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'ON_LEAVE', label: 'On Leave' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export default function StaffModal({
  open,
  staff,
  branches = [],
  isManager = false,
  managerBranchId = null,
  onClose,
  onSaved,
}) {
  const isEditing = Boolean(staff);
  const existingHasLogin = Boolean(staff?.user_id || staff?.User);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    employee_id: '',
    branch_id: '',
    department: 'Sales',
    designation: 'Sales Executive',
    joining_date: new Date().toISOString().slice(0, 10),
    status: 'ACTIVE',
    create_login: false,
    role: 'SALESMAN',
    password: '',
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (staff) {
      const p = staff.StaffProfile || staff;
      const hasLogin = Boolean(staff.user_id || staff.User || staff.email);
      setForm({
        name: staff.name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || '',
        email: staff.email || p.email || '',
        phone: p.phone || staff.phone || '',
        address: p.address || staff.address || '',
        employee_id: p.employee_id || '',
        branch_id: staff.branch_id ? String(staff.branch_id) : (p.branch_id ? String(p.branch_id) : ''),
        department: p.department || 'Sales',
        designation: p.designation || 'Sales Executive',
        joining_date: p.joining_date ? String(p.joining_date).slice(0, 10) : new Date().toISOString().slice(0, 10),
        status: p.status || (staff.is_active ? 'ACTIVE' : 'INACTIVE'),
        create_login: hasLogin,
        role: staff.role || staff.User?.role || 'SALESMAN',
        password: '',
      });
    } else {
      setForm({
        name: '',
        email: '',
        phone: '',
        address: '',
        employee_id: '',
        branch_id: isManager && managerBranchId ? String(managerBranchId) : '',
        department: 'Sales',
        designation: 'Sales Executive',
        joining_date: new Date().toISOString().slice(0, 10),
        status: 'ACTIVE',
        create_login: false,
        role: 'SALESMAN',
        password: '',
      });
    }
  }, [staff, open, isManager, managerBranchId]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Full Name is required');
      return;
    }

    if (form.create_login && !form.email.trim()) {
      toast.error('Email address is required to create a login account');
      return;
    }

    if (isManager && form.create_login && (form.role === 'ADMIN' || form.role === 'SUPER_ADMIN')) {
      toast.error('Branch Managers are not permitted to assign administrative roles');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        first_name: form.name.trim().split(' ')[0] || form.name.trim(),
        last_name: form.name.trim().split(' ').slice(1).join(' ') || '',
        email: form.email.trim() ? form.email.trim().toLowerCase() : null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        employee_id: form.employee_id.trim() || undefined,
        branch_id: isManager && managerBranchId ? managerBranchId : form.branch_id ? parseInt(form.branch_id, 10) : null,
        department: form.department.trim(),
        designation: form.designation.trim(),
        joining_date: form.joining_date,
        status: form.status,
        create_login: form.create_login,
      };

      if (form.create_login) {
        payload.role = form.role;
        if (form.password && form.password.trim()) {
          payload.password = form.password.trim();
        }
      }

      if (isEditing) {
        await api.put(`/staff/${staff.id}`, payload);
        toast.success('Staff details updated successfully');
      } else {
        await api.post('/staff', payload);
        toast.success('Staff member added successfully');
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save staff record'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      size="lg"
      title={isEditing ? `Edit Staff — ${form.name || staff?.name}` : 'Add New Staff Member'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Staff'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {/* Personal Information */}
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 8, color: 'var(--primary)' }}>Personal Information</h4>
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="staff_name">Full Name *</label>
              <input
                id="staff_name"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. Rahul Sharma"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="staff_email">
                Email Address {form.create_login ? '*' : '(optional for no-login staff)'}
              </label>
              <input
                id="staff_email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                placeholder="e.g. rahul@jewellery.test"
                required={form.create_login}
              />
            </div>
            <div className="form-group">
              <label htmlFor="staff_phone">Mobile / Phone</label>
              <input
                id="staff_phone"
                name="phone"
                type="tel"
                value={form.phone}
                onChange={handleChange}
                placeholder="e.g. 9811122233"
              />
            </div>
            <div className="form-group">
              <label htmlFor="staff_address">Residential Address</label>
              <input
                id="staff_address"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="e.g. Sector 18, Noida"
              />
            </div>
          </div>
        </div>

        {/* Employment Information */}
        <div style={{ marginBottom: 16 }}>
          <h4 style={{ marginBottom: 8, color: 'var(--primary)' }}>Employment Information</h4>
          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="staff_emp_id">Employee ID</label>
              <input
                id="staff_emp_id"
                name="employee_id"
                value={form.employee_id}
                onChange={handleChange}
                placeholder="Auto-generated if blank (e.g. EMP-001)"
              />
            </div>
            <div className="form-group">
              <label htmlFor="staff_branch">Assigned Branch</label>
              <select
                id="staff_branch"
                name="branch_id"
                value={form.branch_id}
                onChange={handleChange}
                disabled={isManager}
              >
                <option value="">All Branches / Head Office</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {isManager && (
                <p className="field-hint">Fixed to your current branch</p>
              )}
            </div>
            <div className="form-group">
              <label htmlFor="staff_department">Department</label>
              <input
                id="staff_department"
                name="department"
                value={form.department}
                onChange={handleChange}
                placeholder="e.g. Retail Sales, Inventory, Karigar, Accounts"
              />
            </div>
            <div className="form-group">
              <label htmlFor="staff_designation">Designation</label>
              <input
                id="staff_designation"
                name="designation"
                value={form.designation}
                onChange={handleChange}
                placeholder="e.g. Senior Sales Executive, Branch Accountant"
              />
            </div>
            <div className="form-group">
              <label htmlFor="staff_joining">Joining Date</label>
              <input
                id="staff_joining"
                name="joining_date"
                type="date"
                value={form.joining_date}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <label htmlFor="staff_status">Staff Status</label>
              <select
                id="staff_status"
                name="status"
                value={form.status}
                onChange={handleChange}
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ERP Login & Security */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <h4 style={{ marginBottom: 8, color: 'var(--primary)' }}>ERP Login &amp; Access Control</h4>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600 }}>
              <input
                type="checkbox"
                name="create_login"
                checked={form.create_login}
                onChange={handleChange}
                disabled={isEditing && existingHasLogin}
              />
              <span>
                {isEditing && existingHasLogin
                  ? 'ERP Login Enabled (Linked User Account)'
                  : 'Create ERP Login for this Staff Member'}
              </span>
            </label>
          </div>

          {!form.create_login ? (
            <div style={{ padding: '10px 14px', background: 'var(--bg-subtle, #f8f9fa)', borderRadius: 6, fontSize: 13, color: 'var(--text-muted)' }}>
              <strong>No Login Account:</strong> This staff member will be registered in the directory without credentials (<code>user_id = null</code>). They will not be able to log in to the ERP, but their profile, branch attendance, and operational assignments are fully tracked.
            </div>
          ) : (
            <div className="form-grid-2" style={{ marginTop: 10 }}>
              <div className="form-group">
                <label htmlFor="staff_role">System Role *</label>
                <select
                  id="staff_role"
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  disabled={isManager}
                  required
                >
                  {ROLES.filter((r) => !isManager || r.value !== 'ADMIN').map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  Defines module permissions and operational access scope in the ERP.
                </p>
              </div>
              <div className="form-group">
                <label htmlFor="staff_pwd">
                  {isEditing && existingHasLogin ? 'Reset Password (optional)' : 'Initial Password'}
                </label>
                <input
                  id="staff_pwd"
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder={isEditing && existingHasLogin ? 'Leave blank to retain current password' : 'Staff@123 (default if blank)'}
                  autoComplete="new-password"
                />
                <p className="field-hint">
                  {isEditing && existingHasLogin
                    ? 'Enter new password only if resetting credentials.'
                    : 'Default password is Staff@123 if left empty.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}
