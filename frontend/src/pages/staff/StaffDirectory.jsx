// frontend/src/pages/staff/StaffDirectory.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
  PageHeader,
  Card,
  Stat,
  TableWrap,
  StatusBadge,
  DataState,
  Modal,
  formatDate,
  titleCase,
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

function getInitials(firstName = '', lastName = '') {
  const f = firstName?.[0]?.toUpperCase() || '';
  const l = lastName?.[0]?.toUpperCase() || '';
  return f + l || 'E';
}

export default function StaffDirectory() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';

  // Filters & Pagination State
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(isManager ? String(user?.branch_id || '') : '');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedDesignation, setSelectedDesignation] = useState('');
  const [selectedEmploymentType, setSelectedEmploymentType] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedLoginStatus, setSelectedLoginStatus] = useState('');
  const [sortBy, setSortBy] = useState('employee_id');
  const [sortOrder, setSortOrder] = useState('ASC');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Data & States
  const [staffData, setStaffData] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Deactivation confirmation modal state
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [targetStaff, setTargetStaff] = useState(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  // Load branches for filter
  useEffect(() => {
    let alive = true;
    api.get('/branches')
      .then((res) => {
        if (alive && Array.isArray(res.data)) {
          setBranches(res.data);
        }
      })
      .catch((err) => {
        console.warn('Could not load branches for filter:', err.message);
      });
    return () => { alive = false; };
  }, []);

  // Fetch staff list with server-side filters, sorting, and pagination
  const fetchStaff = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      params.append('sortBy', sortBy);
      params.append('sortOrder', sortOrder);

      if (search.trim()) params.append('search', search.trim());
      if (selectedBranch) params.append('branch_id', selectedBranch);
      if (selectedDepartment) params.append('department', selectedDepartment);
      if (selectedDesignation) params.append('designation', selectedDesignation);
      if (selectedEmploymentType) params.append('employment_type', selectedEmploymentType);
      if (selectedStatus) params.append('status', selectedStatus);
      if (selectedLoginStatus) params.append('has_login', selectedLoginStatus);

      const res = await api.get(`/staff?${params.toString()}`);
      if (res.data?.data) {
        setStaffData(res.data.data);
        setPagination(res.data.pagination || { total: res.data.data.length, page: 1, limit, totalPages: 1 });
      } else if (Array.isArray(res.data)) {
        setStaffData(res.data);
        setPagination({ total: res.data.length, page: 1, limit, totalPages: 1 });
      }
    } catch (err) {
      setError(errorMessage(err, 'Failed to load staff directory.'));
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    sortBy,
    sortOrder,
    search,
    selectedBranch,
    selectedDepartment,
    selectedDesignation,
    selectedEmploymentType,
    selectedStatus,
    selectedLoginStatus,
  ]);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Handle header sorting click
  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(field);
      setSortOrder('ASC');
    }
    setPage(1);
  };

  // Open deactivation/activation modal
  const openStatusConfirmModal = (item) => {
    setTargetStaff(item);
    setDeactivateModalOpen(true);
  };

  // Execute soft deactivation or activation
  const handleConfirmStatusChange = async () => {
    if (!targetStaff) return;
    const isCurrentlyActive = targetStaff.status === 'ACTIVE';
    const newStatus = isCurrentlyActive ? 'INACTIVE' : 'ACTIVE';
    const actionVerb = isCurrentlyActive ? 'deactivated' : 'activated';

    setSubmittingAction(true);
    try {
      await api.patch(`/staff/${targetStaff.id}/status`, { status: newStatus });
      toast.success(`${targetStaff.first_name} ${targetStaff.last_name || ''} has been ${actionVerb}.`);
      setDeactivateModalOpen(false);
      setTargetStaff(null);
      fetchStaff();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update employee status.'));
    } finally {
      setSubmittingAction(false);
    }
  };

  // Quick stats computed from current data
  const stats = useMemo(() => {
    let total = pagination.total || staffData.length;
    let active = 0;
    let inactive = 0;
    let withLogin = 0;

    staffData.forEach((s) => {
      if (s.status === 'ACTIVE') active++;
      else if (s.status === 'INACTIVE' || s.status === 'SUSPENDED') inactive++;
      if (s.User || s.user_id) withLogin++;
    });

    return { total, active, inactive, withLogin };
  }, [pagination.total, staffData]);

  const clearFilters = () => {
    setSearch('');
    if (!isManager) setSelectedBranch('');
    setSelectedDepartment('');
    setSelectedDesignation('');
    setSelectedEmploymentType('');
    setSelectedStatus('');
    setSelectedLoginStatus('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    search.trim() ||
    (!isManager && selectedBranch) ||
    selectedDepartment ||
    selectedDesignation ||
    selectedEmploymentType ||
    selectedStatus ||
    selectedLoginStatus
  );

  return (
    <div>
      <PageHeader
        title="Staff Directory"
        subtitle="Manage employees, organizational assignments, ERP logins, and branch staffing."
        actions={
          <Link to="/admin/staff/add" className="btn btn-primary">
            + Add Staff
          </Link>
        }
      />

      {/* Summary KPI row */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Total Staff Members" value={stats.total} note="Registered directory records" />
        <Stat label="Active on Duty" value={stats.active} note="In active directory status" />
        <Stat label="Inactive / Archived" value={stats.inactive} note="Historical records preserved" />
        <Stat label="ERP Logins Enabled" value={stats.withLogin} note="Linked user login accounts" />
      </div>

      {/* Main Staff Directory Card */}
      <Card bodyClass="tight" style={{ overflow: 'hidden' }}>
        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="filter-search">
            <input
              type="search"
              placeholder="Search by name, ID, phone, or email..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Branch Filter (Admins can select any branch; Managers are restricted to their branch) */}
          <div className="filter-item">
            <select
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setPage(1);
              }}
              disabled={isManager}
              title={isManager ? 'Scoped to your assigned branch' : 'Filter by branch'}
            >
              <option value="">{isManager ? 'My Branch' : 'All Branches'}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div className="filter-item">
            <select
              value={selectedDepartment}
              onChange={(e) => {
                setSelectedDepartment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Departments</option>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Designation Filter */}
          <div className="filter-item">
            <select
              value={selectedDesignation}
              onChange={(e) => {
                setSelectedDesignation(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Designations</option>
              {DESIGNATIONS.map((des) => (
                <option key={des} value={des}>
                  {des}
                </option>
              ))}
            </select>
          </div>

          {/* Employment Type Filter */}
          <div className="filter-item">
            <select
              value={selectedEmploymentType}
              onChange={(e) => {
                setSelectedEmploymentType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Types</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="filter-item">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>

          {/* Login Status Filter */}
          <div className="filter-item">
            <select
              value={selectedLoginStatus}
              onChange={(e) => {
                setSelectedLoginStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Login Types</option>
              <option value="true">Login Enabled</option>
              <option value="false">No Login Account</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={clearFilters}
              title="Reset all active filters"
            >
              Reset
            </button>
          )}
        </div>

        {/* Directory Table Area */}
        <DataState
          loading={loading}
          error={error}
          onRetry={fetchStaff}
          empty={staffData.length === 0}
          emptyProps={{
            title: hasActiveFilters ? 'No matching staff members found' : 'Staff Directory is empty',
            text: hasActiveFilters
              ? 'Try adjusting your search criteria or resetting filters.'
              : 'Add your first employee to get started with organizational staffing.',
            action: (
              <Link to="/admin/staff/add" className="btn btn-primary">
                + Add Staff Member
              </Link>
            ),
          }}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th
                    style={{ cursor: 'pointer', minWidth: 110 }}
                    onClick={() => handleSort('employee_id')}
                  >
                    Employee ID {sortBy === 'employee_id' && (sortOrder === 'ASC' ? '▲' : '▼')}
                  </th>
                  <th
                    style={{ cursor: 'pointer', minWidth: 180 }}
                    onClick={() => handleSort('first_name')}
                  >
                    Employee {sortBy === 'first_name' && (sortOrder === 'ASC' ? '▲' : '▼')}
                  </th>
                  <th>Phone</th>
                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('department')}
                  >
                    Department {sortBy === 'department' && (sortOrder === 'ASC' ? '▲' : '▼')}
                  </th>
                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('designation')}
                  >
                    Designation {sortBy === 'designation' && (sortOrder === 'ASC' ? '▲' : '▼')}
                  </th>
                  <th>Branch</th>
                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('joining_date')}
                  >
                    Joining Date {sortBy === 'joining_date' && (sortOrder === 'ASC' ? '▲' : '▼')}
                  </th>
                  <th>Employment Type</th>
                  <th>Login Status</th>
                  <th
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleSort('status')}
                  >
                    Status {sortBy === 'status' && (sortOrder === 'ASC' ? '▲' : '▼')}
                  </th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffData.map((item) => {
                  const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.User?.name || 'Staff Member';
                  const email = item.email || item.User?.email;
                  const hasLogin = Boolean(item.user_id || item.User);
                  const role = item.User?.role;
                  const isActive = item.status === 'ACTIVE';

                  return (
                    <tr key={item.id}>
                      {/* Employee ID */}
                      <td>
                        <Link
                          to={`/admin/staff/${item.id}`}
                          style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: 'monospace' }}
                        >
                          {item.employee_id || `EMP-${String(item.id).padStart(4, '0')}`}
                        </Link>
                      </td>

                      {/* Employee (Avatar, Name, Email) */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {item.profile_photo ? (
                            <img
                              src={item.profile_photo}
                              alt={fullName}
                              className="avatar"
                              style={{ objectFit: 'cover' }}
                            />
                          ) : (
                            <div className="avatar">
                              {getInitials(item.first_name, item.last_name)}
                            </div>
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div className="cell-title">
                              <Link to={`/admin/staff/${item.id}`} style={{ color: 'inherit' }}>
                                {fullName}
                              </Link>
                            </div>
                            <div className="cell-sub">{email || 'No email provided'}</div>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td>{item.phone || '—'}</td>

                      {/* Department */}
                      <td>{item.department || '—'}</td>

                      {/* Designation */}
                      <td>{item.designation || '—'}</td>

                      {/* Branch */}
                      <td>{item.Branch?.name || 'Unassigned'}</td>

                      {/* Joining Date */}
                      <td>{formatDate(item.joining_date)}</td>

                      {/* Employment Type */}
                      <td>
                        <span className="badge neutral">
                          {titleCase(item.employment_type || 'FULL_TIME')}
                        </span>
                      </td>

                      {/* Login Status */}
                      <td>
                        {hasLogin ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span className="badge blue">Login Enabled</span>
                            {role && (
                              <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                                {titleCase(role)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="badge neutral" title="Employee has no ERP login account">
                            No Login
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td>
                        <StatusBadge value={item.status} />
                      </td>

                      {/* Actions */}
                      <td>
                        <div className="row-actions">
                          <Link
                            to={`/admin/staff/${item.id}`}
                            className="btn btn-secondary btn-sm"
                            title="View Employee Profile"
                          >
                            View
                          </Link>
                          <Link
                            to={`/admin/staff/${item.id}/edit`}
                            className="btn btn-secondary btn-sm"
                            title="Edit Staff Member"
                          >
                            Edit
                          </Link>
                          <button
                            type="button"
                            className={`btn btn-sm ${isActive ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => openStatusConfirmModal(item)}
                            title={isActive ? 'Deactivate Employee' : 'Activate Employee'}
                          >
                            {isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>

          {/* Pagination Footer */}
          <div className="pagination">
            <div className="pagination-info">
              <span>
                Showing{' '}
                <strong>
                  {staffData.length === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
                </strong>{' '}
                to{' '}
                <strong>
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </strong>{' '}
                of <strong>{pagination.total}</strong> employees
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12 }}>
                <span>Per page:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="pagination-controls">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Previous
              </button>
              <span style={{ margin: '0 8px', fontWeight: 600 }}>
                Page {pagination.page} of {Math.max(1, pagination.totalPages)}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </DataState>
      </Card>

      {/* Confirmation Modal for Soft Deactivation / Activation */}
      <Modal
        open={deactivateModalOpen}
        onClose={() => !submittingAction && setDeactivateModalOpen(false)}
        title={targetStaff?.status === 'ACTIVE' ? 'Deactivate Staff Member' : 'Activate Staff Member'}
        footer={
          <div className="form-actions" style={{ justifyContent: 'flex-end', width: '100%' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDeactivateModalOpen(false)}
              disabled={submittingAction}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${targetStaff?.status === 'ACTIVE' ? 'btn-danger' : 'btn-success'}`}
              onClick={handleConfirmStatusChange}
              disabled={submittingAction}
            >
              {submittingAction
                ? 'Processing...'
                : targetStaff?.status === 'ACTIVE'
                ? 'Confirm Deactivation'
                : 'Confirm Activation'}
            </button>
          </div>
        }
      >
        {targetStaff && (
          <div>
            <p style={{ marginBottom: 12 }}>
              Are you sure you want to{' '}
              <strong>{targetStaff.status === 'ACTIVE' ? 'deactivate' : 'activate'}</strong>{' '}
              <strong>{targetStaff.first_name} {targetStaff.last_name || ''}</strong> (
              <code>{targetStaff.employee_id || `ID #${targetStaff.id}`}</code>)?
            </p>

            {targetStaff.status === 'ACTIVE' ? (
              <div className="alert alert-warning" style={{ fontSize: 13 }}>
                <strong>Important:</strong> Deactivating this employee will immediately disable their
                ERP login access. Historical transactions, branch transfer records, attendance, and
                audit logs will be safely preserved and NOT deleted.
              </div>
            ) : (
              <div className="alert alert-info" style={{ fontSize: 13 }}>
                Activating this employee will restore their active status in the directory and re-enable
                their ERP login account.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
