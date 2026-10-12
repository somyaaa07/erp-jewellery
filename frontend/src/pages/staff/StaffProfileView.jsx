// frontend/src/pages/staff/StaffProfileView.jsx
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
  PageHeader,
  Card,
  Stat,
  StatusBadge,
  Modal,
  Loading,
  Alert,
  formatDate,
  formatDateTime,
  titleCase,
  errorMessage,
} from '../../components/ui';

function getInitials(firstName = '', lastName = '') {
  const f = firstName?.[0]?.toUpperCase() || '';
  const l = lastName?.[0]?.toUpperCase() || '';
  return f + l || 'E';
}

export default function StaffProfileView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [staff, setStaff] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Status modal
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  const fetchStaffDetails = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/staff/${id}`);
      setStaff(res.data);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load employee details.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchStaffDetails();
  }, [fetchStaffDetails]);

  // Handle status toggle
  const handleToggleStatus = async () => {
    if (!staff) return;
    const isCurrentlyActive = staff.status === 'ACTIVE';
    const newStatus = isCurrentlyActive ? 'INACTIVE' : 'ACTIVE';
    const actionVerb = isCurrentlyActive ? 'deactivated' : 'activated';

    setSubmittingStatus(true);
    try {
      await api.patch(`/staff/${staff.id}/status`, { status: newStatus });
      toast.success(`${staff.first_name} ${staff.last_name || ''} has been ${actionVerb}.`);
      setStatusModalOpen(false);
      fetchStaffDetails();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update employee status.'));
    } finally {
      setSubmittingStatus(false);
    }
  };

  if (loading) {
    return <Loading label="Loading employee profile..." />;
  }

  if (error || !staff) {
    return (
      <div style={{ maxWidth: 720, margin: '20px auto' }}>
        <Alert tone="danger" title="Could not load employee profile">
          {error || 'Profile not found or access restricted.'}
        </Alert>
        <div style={{ marginTop: 16 }}>
          <Link to="/admin/staff/directory" className="btn btn-secondary">
            ← Back to Staff Directory
          </Link>
        </div>
      </div>
    );
  }

  const fullName = `${staff.first_name || ''} ${staff.last_name || ''}`.trim() || staff.User?.name || 'Staff Member';
  const hasLogin = Boolean(staff.user_id || staff.User);
  const isActive = staff.status === 'ACTIVE';
  const transfers = Array.isArray(staff.transfer_history) ? staff.transfer_history : [];

  return (
    <div>
      {/* Top Breadcrumb / Nav */}
      <div style={{ marginBottom: 12 }}>
        <Link to="/admin/staff/directory" className="subtle" style={{ fontSize: 13, textDecoration: 'none' }}>
          ← Back to Staff Directory
        </Link>
      </div>

      {/* Profile Hero Header Card */}
      <Card bodyClass="tight" style={{ marginBottom: 20 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '24px 28px',
            flexWrap: 'wrap',
            gap: 20,
            background: 'linear-gradient(135deg, rgba(109, 74, 141, 0.05) 0%, rgba(212, 175, 55, 0.08) 100%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            {staff.profile_photo ? (
              <img
                src={staff.profile_photo}
                alt={fullName}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2.5px solid var(--gold)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                }}
              />
            ) : (
              <div
                className="avatar"
                style={{
                  width: 72,
                  height: 72,
                  fontSize: 24,
                  fontWeight: 700,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                }}
              >
                {getInitials(staff.first_name, staff.last_name)}
              </div>
            )}

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--heading)' }}>
                  {fullName}
                </h1>
                <StatusBadge value={staff.status} />
                {hasLogin ? (
                  <span className="badge blue">
                    ERP {titleCase(staff.User?.role || 'User')}
                  </span>
                ) : (
                  <span className="badge neutral">No Login Account</span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, color: 'var(--text-muted)', fontSize: 13 }}>
                <span>
                  <strong>ID:</strong> <code style={{ fontSize: 13 }}>{staff.employee_id || `EMP-${staff.id}`}</code>
                </span>
                <span>•</span>
                <span>{staff.designation || 'Staff'} ({staff.department || 'General'})</span>
                <span>•</span>
                <span>{staff.Branch?.name || 'Unassigned Branch'}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <Link to={`/admin/staff/${staff.id}/edit`} className="btn btn-secondary">
              Edit Details
            </Link>
            <button
              type="button"
              className={`btn ${isActive ? 'btn-danger' : 'btn-success'}`}
              onClick={() => setStatusModalOpen(true)}
            >
              {isActive ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        </div>
      </Card>

      {/* Quick Summary KPI stats */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <Stat
          label="Department & Designation"
          value={staff.department || '—'}
          note={staff.designation || 'Staff'}
        />
        <Stat
          label="Employment Type"
          value={titleCase(staff.employment_type || 'FULL_TIME')}
          note={`Status: ${titleCase(staff.status)}`}
        />
        <Stat
          label="Assigned Branch"
          value={staff.Branch?.name || 'Unassigned'}
          note={staff.Branch?.address || 'No address set'}
        />
        <Stat
          label="Date of Joining"
          value={formatDate(staff.joining_date)}
          note={staff.joining_date ? `Registered employee` : 'Not specified'}
        />
      </div>

      {/* Main Details: 2 Column Layout */}
      <div className="grid-2" style={{ alignItems: 'start', marginBottom: 24 }}>
        {/* Left Column: Personal & Contact Information */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Personal Information */}
          <Card title="Personal Information" note="Identity and demographic details">
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 14px', fontSize: 13.5 }}>
              <span className="subtle">Full Name:</span>
              <span style={{ fontWeight: 600 }}>{fullName}</span>

              <span className="subtle">Gender:</span>
              <span>{titleCase(staff.gender) || '—'}</span>

              <span className="subtle">Date of Birth:</span>
              <span>
                {staff.dob ? formatDate(staff.dob) : isAdmin ? '—' : <span className="subtle">Confidential</span>}
              </span>
            </div>
          </Card>

          {/* Contact Information */}
          <Card title="Contact Information" note="Communication and emergency reachability">
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 14px', fontSize: 13.5 }}>
              <span className="subtle">Email Address:</span>
              <span>{staff.email || staff.User?.email || '—'}</span>

              <span className="subtle">Phone Number:</span>
              <span>{staff.phone || '—'}</span>

              <span className="subtle">Residential Address:</span>
              <span>
                {staff.address !== undefined
                  ? staff.address || '—'
                  : <span className="subtle">Confidential / Restricted</span>}
              </span>

              <span className="subtle">Emergency Contact:</span>
              <span>
                {staff.emergency_contact_name !== undefined ? (
                  <div>
                    <div style={{ fontWeight: 500 }}>{staff.emergency_contact_name || '—'}</div>
                    {staff.emergency_contact_phone && (
                      <div className="subtle" style={{ fontSize: 12 }}>
                        Phone: {staff.emergency_contact_phone}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="subtle">Restricted to HR / Admin</span>
                )}
              </span>
            </div>
          </Card>

          {/* ERP Login Account Card */}
          <Card title="ERP Login & System Access" note="Linked authentication credentials">
            {hasLogin ? (
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 14px', fontSize: 13.5 }}>
                <span className="subtle">Account Status:</span>
                <span>
                  <span className={`badge ${staff.User?.is_active ? 'green' : 'red'}`}>
                    {staff.User?.is_active ? 'Active Account' : 'Disabled Account'}
                  </span>
                </span>

                <span className="subtle">Login Email:</span>
                <span style={{ fontWeight: 600 }}>{staff.User?.email || staff.email}</span>

                <span className="subtle">System Role:</span>
                <span>
                  <span className="badge blue">{titleCase(staff.User?.role || 'SALESMAN')}</span>
                </span>

                <span className="subtle">User ID:</span>
                <code>#{staff.User?.id || staff.user_id}</code>

                <span className="subtle">Account Created:</span>
                <span>{formatDate(staff.User?.created_at)}</span>
              </div>
            ) : (
              <div className="alert alert-info" style={{ fontSize: 13, marginBottom: 0 }}>
                <strong>No ERP Login Account:</strong> This staff member does not have credentials to
                sign in to the software. Their profile and branch assignments are managed exclusively by
                store administrators.
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Employment & Organization */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Employment Details */}
          <Card title="Employment Details" note="Contract, position, and managerial hierarchy">
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 14px', fontSize: 13.5 }}>
              <span className="subtle">Employee ID:</span>
              <code style={{ fontWeight: 700 }}>{staff.employee_id || `EMP-${staff.id}`}</code>

              <span className="subtle">Department:</span>
              <span style={{ fontWeight: 600 }}>{staff.department || '—'}</span>

              <span className="subtle">Designation:</span>
              <span>{staff.designation || '—'}</span>

              <span className="subtle">Employment Type:</span>
              <span>
                <span className="badge neutral">{titleCase(staff.employment_type || 'FULL_TIME')}</span>
              </span>

              <span className="subtle">Joining Date:</span>
              <span>{formatDate(staff.joining_date)}</span>

              <span className="subtle">Reporting Manager:</span>
              <span>
                {staff.ReportingManager ? (
                  <div>
                    <span style={{ fontWeight: 600 }}>{staff.ReportingManager.name}</span>{' '}
                    <span className="badge neutral" style={{ fontSize: 11 }}>
                      {titleCase(staff.ReportingManager.role)}
                    </span>
                    <div className="subtle" style={{ fontSize: 12 }}>
                      {staff.ReportingManager.email}
                    </div>
                  </div>
                ) : (
                  <span className="subtle">Independent / Top Level</span>
                )}
              </span>

              {staff.notes && (
                <>
                  <span className="subtle">Internal Notes:</span>
                  <div style={{ background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 4 }}>
                    {staff.notes}
                  </div>
                </>
              )}
            </div>
          </Card>

          {/* Branch Assignment & History */}
          <Card title="Branch & Location" note="Current and historical branch assignments">
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px 14px', fontSize: 13.5, marginBottom: 16 }}>
              <span className="subtle">Current Branch:</span>
              <span style={{ fontWeight: 600 }}>{staff.Branch?.name || 'Unassigned'}</span>

              <span className="subtle">Address:</span>
              <span>{staff.Branch?.address || '—'}</span>

              {staff.Branch?.gstin && (
                <>
                  <span className="subtle">Branch GSTIN:</span>
                  <code>{staff.Branch.gstin}</code>
                </>
              )}
            </div>

            {/* Branch Transfer History */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--heading)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Transfer History
              </div>
              {transfers.length === 0 ? (
                <p className="subtle" style={{ fontSize: 12.5, fontStyle: 'italic', margin: 0 }}>
                  No historical branch transfers recorded.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {transfers.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 12px',
                        background: 'var(--surface-2)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 12.5,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        Branch #{item.from_branch_id || 'Initial'} → <strong>Branch #{item.to_branch_id}</strong>
                      </div>
                      <div className="subtle" style={{ fontSize: 11 }}>
                        {formatDateTime(item.timestamp)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Placeholders for Future Modules: Attendance, Leave, Payroll, Performance */}
      <div style={{ marginTop: 28 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--heading)' }}>
          Operational Modules Overview
        </h3>
        <div className="grid-4">
          <Card title="Attendance" note="Scheduled for Phase 4">
            <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>⏱</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Attendance Log</div>
              <p className="subtle" style={{ fontSize: 12, margin: 0 }}>
                Shift tracking, biometric clock-in, and daily attendance logs will appear here.
              </p>
            </div>
          </Card>

          <Card title="Leave Management" note="Scheduled for Phase 4">
            <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>🏖</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Leave Balances</div>
              <p className="subtle" style={{ fontSize: 12, margin: 0 }}>
                Paid leave, sick leave balances, and pending leave applications will appear here.
              </p>
            </div>
          </Card>

          <Card title="Payroll" note="Scheduled for Phase 5">
            <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>💰</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Salary & Payslips</div>
              <p className="subtle" style={{ fontSize: 12, margin: 0 }}>
                Salary structure, deductions, allowances, and monthly payslips will appear here.
              </p>
            </div>
          </Card>

          <Card title="Performance" note="Scheduled for Phase 5">
            <div style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>📊</div>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Sales & Reviews</div>
              <p className="subtle" style={{ fontSize: 12, margin: 0 }}>
                Sales targets, commissions, and periodic manager evaluations will appear here.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* Confirmation Modal for Soft Deactivation / Activation */}
      <Modal
        open={statusModalOpen}
        onClose={() => !submittingStatus && setStatusModalOpen(false)}
        title={isActive ? 'Deactivate Staff Member' : 'Activate Staff Member'}
        footer={
          <div className="form-actions" style={{ justifyContent: 'flex-end', width: '100%' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStatusModalOpen(false)}
              disabled={submittingStatus}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn ${isActive ? 'btn-danger' : 'btn-success'}`}
              onClick={handleToggleStatus}
              disabled={submittingStatus}
            >
              {submittingStatus
                ? 'Processing...'
                : isActive
                ? 'Confirm Deactivation'
                : 'Confirm Activation'}
            </button>
          </div>
        }
      >
        <div>
          <p style={{ marginBottom: 12 }}>
            Are you sure you want to{' '}
            <strong>{isActive ? 'deactivate' : 'activate'}</strong>{' '}
            <strong>{fullName}</strong> (<code>{staff.employee_id || `#${staff.id}`}</code>)?
          </p>

          {isActive ? (
            <div className="alert alert-warning" style={{ fontSize: 13 }}>
              <strong>Soft Deactivation:</strong> Deactivating this employee will immediately revoke
              their ERP login access. Historical data, sales records, and transfer history are preserved
              and will NOT be deleted.
            </div>
          ) : (
            <div className="alert alert-info" style={{ fontSize: 13 }}>
              Activating will restore this employee's active status and re-enable their ERP system credentials.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
