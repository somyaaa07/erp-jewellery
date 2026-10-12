// frontend/src/pages/staff/StaffForm.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
  PageHeader,
  Card,
  Alert,
  Loading,
  errorMessage,
} from '../../components/ui';

const DEPARTMENTS = [
  'Sales',
  'Inventory',
  'Accounts',
  'Operations',
  'Management',
  'Workshop',
  'Security',
  'Other',
];

const DESIGNATIONS = [
  'Store Manager',
  'Sales Executive',
  'Cashier',
  'Jeweller',
  'Karigar',
  'Accountant',
  'Stock Manager',
  'Supervisor',
  'Security Guard',
  'Other',
];

const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full Time' },
  { value: 'PART_TIME', label: 'Part Time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERN', label: 'Intern' },
  { value: 'PROBATION', label: 'Probation' },
];

const GENDERS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
  { value: 'PREFER_NOT_TO_SAY', label: 'Prefer not to say' },
];

const ALLOWED_ROLES = [
  { value: 'SALESMAN', label: 'Salesman (POS / Billing & Stock View)' },
  { value: 'MANAGER', label: 'Branch Manager (Branch Operations)' },
  { value: 'KARIGAR_INCHARGE', label: 'Karigar In-charge (Manufacturing / Workshop)' },
  { value: 'ADMIN', label: 'Store Admin (Full Store Administration)' },
];

export default function StaffForm({ mode = 'create' }) {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const isEdit = mode === 'edit' || Boolean(id);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';

  // Auxiliary data
  const [branches, setBranches] = useState([]);
  const [managers, setManagers] = useState([]);
  const [fetchingStaff, setFetchingStaff] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Form State
  const [form, setForm] = useState({
    // Personal
    first_name: '',
    last_name: '',
    profile_photo: '',
    dob: '',
    gender: 'MALE',

    // Contact
    email: '',
    phone: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',

    // Employment
    employee_id: '',
    department: 'Sales',
    designation: 'Sales Executive',
    employment_type: 'FULL_TIME',
    joining_date: new Date().toISOString().split('T')[0],
    branch_id: isManager ? String(user?.branch_id || '') : '',
    reporting_manager_id: '',
    status: 'ACTIVE',
    notes: '',

    // ERP Login
    create_login: false,
    role: 'SALESMAN',
    password: '',
  });

  // Track existing user account state in edit mode
  const [existingUser, setExistingUser] = useState(null);

  // Load auxiliary data (branches, potential reporting managers)
  useEffect(() => {
    let alive = true;

    // Load branches
    api.get('/branches')
      .then((res) => {
        if (alive && Array.isArray(res.data)) {
          setBranches(res.data);
          if (!isEdit && !isManager && res.data.length > 0 && !form.branch_id) {
            setForm((prev) => ({ ...prev, branch_id: String(res.data[0].id) }));
          }
        }
      })
      .catch((err) => console.warn('Branches load error:', err.message));

    // Load potential reporting managers (Users with ADMIN or MANAGER role)
    api.get('/staff')
      .then((res) => {
        if (alive) {
          const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
          // Filter to those with managerial or administrative accounts
          const eligible = list
            .filter((s) => s.User && ['ADMIN', 'MANAGER', 'SUPER_ADMIN'].includes(s.User.role) && s.User.is_active)
            .map((s) => ({
              id: s.User.id,
              name: s.User.name || `${s.first_name || ''} ${s.last_name || ''}`.trim(),
              role: s.User.role,
              branch_id: s.branch_id || s.User.branch_id,
            }));
          setManagers(eligible);
        }
      })
      .catch((err) => console.warn('Managers load error:', err.message));

    return () => { alive = false; };
  }, [isEdit, isManager]);

  // Load staff profile in edit mode
  useEffect(() => {
    if (!isEdit || !id) return;

    let alive = true;
    setFetchingStaff(true);
    setLoadError('');

    api.get(`/staff/${id}`)
      .then((res) => {
        if (!alive) return;
        const data = res.data;
        if (!data) {
          setLoadError('Staff member profile not found.');
          return;
        }

        setExistingUser(data.User || null);

        setForm({
          first_name: data.first_name || (data.User?.name ? data.User.name.split(' ')[0] : ''),
          last_name: data.last_name || (data.User?.name ? data.User.name.split(' ').slice(1).join(' ') : ''),
          profile_photo: data.profile_photo || '',
          dob: data.dob ? data.dob.split('T')[0] : '',
          gender: data.gender || 'MALE',
          email: data.email || data.User?.email || '',
          phone: data.phone || '',
          address: data.address || '',
          emergency_contact_name: data.emergency_contact_name || '',
          emergency_contact_phone: data.emergency_contact_phone || '',
          employee_id: data.employee_id || '',
          department: data.department || 'Sales',
          designation: data.designation || 'Sales Executive',
          employment_type: data.employment_type || 'FULL_TIME',
          joining_date: data.joining_date ? data.joining_date.split('T')[0] : '',
          branch_id: data.branch_id ? String(data.branch_id) : (data.User?.branch_id ? String(data.User.branch_id) : ''),
          reporting_manager_id: data.reporting_manager_id ? String(data.reporting_manager_id) : '',
          status: data.status || 'ACTIVE',
          notes: data.notes || '',
          create_login: Boolean(data.user_id || data.User),
          role: data.User?.role || 'SALESMAN',
          password: '',
        });
      })
      .catch((err) => {
        if (alive) setLoadError(errorMessage(err, 'Failed to load staff details.'));
      })
      .finally(() => {
        if (alive) setFetchingStaff(false);
      });

    return () => { alive = false; };
  }, [id, isEdit]);

  // Handle Input Changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.first_name.trim()) {
      toast.error('First name is required.');
      return;
    }

    if (form.create_login && !form.email.trim()) {
      toast.error('A valid email address is required to create or link an ERP login account.');
      return;
    }

    // Role restrictions for branch managers
    if (isManager && form.create_login && form.role === 'ADMIN') {
      toast.error('Branch Managers are not permitted to assign the ADMIN role.');
      return;
    }

    // Prepare payload
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name ? form.last_name.trim() : '',
      profile_photo: form.profile_photo ? form.profile_photo.trim() : null,
      dob: form.dob || null,
      gender: form.gender || null,
      email: form.email ? form.email.trim().toLowerCase() : null,
      phone: form.phone ? form.phone.trim() : null,
      address: form.address ? form.address.trim() : null,
      emergency_contact_name: form.emergency_contact_name ? form.emergency_contact_name.trim() : null,
      emergency_contact_phone: form.emergency_contact_phone ? form.emergency_contact_phone.trim() : null,
      employee_id: form.employee_id ? form.employee_id.trim() : undefined,
      department: form.department || 'Sales',
      designation: form.designation || 'Sales Executive',
      employment_type: form.employment_type || 'FULL_TIME',
      joining_date: form.joining_date || null,
      status: form.status || 'ACTIVE',
      notes: form.notes ? form.notes.trim() : null,
      reporting_manager_id: form.reporting_manager_id ? parseInt(form.reporting_manager_id, 10) : null,
    };

    // Branch assignment handling
    if (!isManager && form.branch_id) {
      payload.branch_id = parseInt(form.branch_id, 10);
    } else if (isManager) {
      payload.branch_id = user?.branch_id;
    }

    // Login account handling
    payload.create_login = form.create_login;
    if (form.create_login) {
      payload.role = form.role;
      if (form.password && form.password.trim()) {
        payload.password = form.password.trim();
      }
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/staff/${id}`, payload);
        toast.success('Staff profile updated successfully.');
        navigate(`/admin/staff/${id}`);
      } else {
        const res = await api.post('/staff', payload);
        toast.success('Staff member registered successfully.');
        const newId = res.data?.id || res.data?.StaffProfile?.id;
        if (newId) {
          navigate(`/admin/staff/${newId}`);
        } else {
          navigate('/admin/staff/directory');
        }
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save staff information.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (fetchingStaff) {
    return <Loading label="Loading employee profile..." />;
  }

  if (loadError) {
    return (
      <div style={{ maxWidth: 720, margin: '20px auto' }}>
        <Alert tone="danger" title="Error Loading Staff Member">
          {loadError}
        </Alert>
        <div style={{ marginTop: 16 }}>
          <Link to="/admin/staff/directory" className="btn btn-secondary">
            ← Back to Staff Directory
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <PageHeader
        title={isEdit ? 'Edit Staff Member' : 'Register New Staff'}
        subtitle={
          isEdit
            ? `Update details for employee ${form.employee_id || `#${id}`}.`
            : 'Add a new employee to your organization with or without an ERP login account.'
        }
        actions={
          <Link to={isEdit ? `/admin/staff/${id}` : '/admin/staff/directory'} className="btn btn-secondary">
            Cancel
          </Link>
        }
      />

      <form onSubmit={handleSubmit}>
        {/* Section 1: Personal Information */}
        <Card title="1. Personal Information" note="Basic identification details" style={{ marginBottom: 18 }}>
          <div className="form-grid">
            <div className="form-group">
              <label>First Name *</label>
              <input
                type="text"
                name="first_name"
                value={form.first_name}
                onChange={handleChange}
                placeholder="e.g. Ramesh"
                required
              />
            </div>

            <div className="form-group">
              <label>Last Name</label>
              <input
                type="text"
                name="last_name"
                value={form.last_name}
                onChange={handleChange}
                placeholder="e.g. Verma"
              />
            </div>

            <div className="form-group">
              <label>Gender</label>
              <select name="gender" value={form.gender} onChange={handleChange}>
                {GENDERS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Date of Birth</label>
              <input
                type="date"
                name="dob"
                value={form.dob}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Profile Photo URL</label>
            <input
              type="url"
              name="profile_photo"
              value={form.profile_photo}
              onChange={handleChange}
              placeholder="https://example.com/photos/staff-avatar.jpg"
            />
            <p className="field-hint">Optional URL to display this employee's portrait avatar.</p>
          </div>
        </Card>

        {/* Section 2: Contact Information */}
        <Card title="2. Contact Information" note="Official and emergency reachability details" style={{ marginBottom: 18 }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Email Address {form.create_login && '*'}</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="ramesh.verma@example.com"
                required={form.create_login}
              />
              {form.create_login && (
                <p className="field-hint">Required for logging into the ERP system.</p>
              )}
            </div>

            <div className="form-group">
              <label>Phone Number</label>
              <input
                type="tel"
                name="phone"
                value={form.phone}
                onChange={handleChange}
                placeholder="+91 98765 43210"
              />
            </div>
          </div>

          <div className="form-group">
            <label>Residential / Postal Address</label>
            <textarea
              name="address"
              rows={2}
              value={form.address}
              onChange={handleChange}
              placeholder="House/Street, Landmark, City, State, PIN"
            />
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Emergency Contact Name</label>
              <input
                type="text"
                name="emergency_contact_name"
                value={form.emergency_contact_name}
                onChange={handleChange}
                placeholder="Next of kin / Family contact"
              />
            </div>

            <div className="form-group">
              <label>Emergency Contact Phone</label>
              <input
                type="tel"
                name="emergency_contact_phone"
                value={form.emergency_contact_phone}
                onChange={handleChange}
                placeholder="+91 98123 45678"
              />
            </div>
          </div>
        </Card>

        {/* Section 3: Employment Details */}
        <Card title="3. Employment Details" note="Organizational role, branch location, and reporting structure" style={{ marginBottom: 18 }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Employee ID</label>
              <input
                type="text"
                name="employee_id"
                value={form.employee_id}
                onChange={handleChange}
                placeholder={isEdit ? 'EMP-XXXX' : 'Leave blank for auto-generation (e.g. EMP-0001)'}
              />
              <p className="field-hint">
                {isEdit
                  ? 'Must be unique across your organization.'
                  : 'Optional custom alphanumeric code. If omitted, the system generates one sequentially.'}
              </p>
            </div>

            <div className="form-group">
              <label>Department *</label>
              <select name="department" value={form.department} onChange={handleChange} required>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Designation *</label>
              <select name="designation" value={form.designation} onChange={handleChange} required>
                {DESIGNATIONS.map((des) => (
                  <option key={des} value={des}>
                    {des}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Employment Type *</label>
              <select name="employment_type" value={form.employment_type} onChange={handleChange} required>
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Joining Date</label>
              <input
                type="date"
                name="joining_date"
                value={form.joining_date}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label>Assigned Branch {isAdmin ? '*' : ''}</label>
              <select
                name="branch_id"
                value={form.branch_id}
                onChange={handleChange}
                disabled={isManager}
                title={isManager ? 'Managers cannot change branch assignment' : 'Select branch'}
              >
                <option value="">{isManager ? 'Your Assigned Branch' : 'Select Branch'}</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              {isManager && (
                <p className="field-hint">Automatically bound to your branch location.</p>
              )}
            </div>

            <div className="form-group">
              <label>Reporting Manager</label>
              <select
                name="reporting_manager_id"
                value={form.reporting_manager_id}
                onChange={handleChange}
              >
                <option value="">None / Independent</option>
                {managers
                  .filter((m) => !existingUser || m.id !== existingUser.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </option>
                  ))}
              </select>
              <p className="field-hint">Assign to an authorized active manager or admin.</p>
            </div>

            <div className="form-group">
              <label>Employment Status</label>
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="SUSPENDED">Suspended</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Internal Notes & Background</label>
            <textarea
              name="notes"
              rows={2}
              value={form.notes}
              onChange={handleChange}
              placeholder="Additional internal administrative remarks or qualifications..."
            />
          </div>
        </Card>

        {/* Section 4: ERP Login & Account Settings */}
        <Card
          title="4. ERP Login Account"
          note="Configure system access credentials and security permissions"
          style={{ marginBottom: 24 }}
        >
          <div style={{ marginBottom: 14 }}>
            <label className="switch-inline" style={{ fontWeight: 600 }}>
              <input
                type="checkbox"
                name="create_login"
                checked={form.create_login}
                onChange={handleChange}
                disabled={isEdit && Boolean(existingUser)}
              />
              <span>
                {isEdit && Boolean(existingUser)
                  ? 'ERP Login Enabled (Linked Account)'
                  : 'Create ERP Login for this Staff Member'}
              </span>
            </label>
          </div>

          {!form.create_login ? (
            <div className="alert alert-info" style={{ fontSize: 13, marginBottom: 0 }}>
              <strong>No Login Account:</strong> This staff member will be registered in the directory
              without credentials (<code>user_id = null</code>). They will not be able to log in to the
              ERP, but their profile, branch attendance, assignments, and records are fully supported.
            </div>
          ) : (
            <div className="form-grid">
              <div className="form-group">
                <label>ERP Role *</label>
                <select
                  name="role"
                  value={form.role}
                  onChange={handleChange}
                  disabled={!isAdmin && isEdit}
                  required
                >
                  {ALLOWED_ROLES.filter((r) => !isManager || r.value !== 'ADMIN').map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
                <p className="field-hint">
                  Defines the employee's system permissions and navigation scope.
                </p>
              </div>

              <div className="form-group">
                <label>
                  {isEdit && existingUser ? 'Reset Password (optional)' : 'Initial Password *'}
                </label>
                <input
                  type="password"
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  placeholder={isEdit && existingUser ? 'Leave blank to retain current password' : 'Staff@123'}
                  required={!isEdit && form.create_login && !form.password}
                />
                <p className="field-hint">
                  {isEdit && existingUser
                    ? 'Enter a new password only if resetting their login credentials.'
                    : 'Default password is Staff@123 if left empty.'}
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Form Action Buttons */}
        <div className="form-actions" style={{ justifyContent: 'flex-end', gap: 12 }}>
          <Link
            to={isEdit ? `/admin/staff/${id}` : '/admin/staff/directory'}
            className="btn btn-secondary"
            disabled={submitting}
          >
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving Information...' : isEdit ? 'Save Changes' : 'Register Staff Member'}
          </button>
        </div>
      </form>
    </div>
  );
}
