// frontend/src/pages/staff/LeaveManagement.jsx
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/axios';
import {
  PageHeader,
  Card,
  Stat,
  TableWrap,
  StatusBadge,
  DataState,
  formatDate,
  formatDateTime,
  errorMessage,
} from '../../components/ui';
import {
  RecordLeaveModal,
  LeaveDetailsModal,
  CancelLeaveModal,
  LeaveBalancesModal,
  LeaveTypesModal,
} from './LeaveModals';

/* -------------------------------------------------------------------------
   Helper: Format Initials
------------------------------------------------------------------------- */
function getInitials(firstName = '', lastName = '') {
  const f = firstName?.[0]?.toUpperCase() || '';
  const l = lastName?.[0]?.toUpperCase() || '';
  return f + l || 'E';
}

function getLeaveStatusTone(status) {
  switch (status) {
    case 'APPROVED':
      return 'green';
    case 'CANCELLED':
      return 'red';
    case 'PENDING':
      return 'yellow';
    default:
      return 'neutral';
  }
}

export default function LeaveManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';
  const canManageLeaveTypes = isAdmin;
  const canRecordLeave = isAdmin || isManager;
  const canCancelLeave = isAdmin || isManager;

  // Filter States
  const [selectedBranch, setSelectedBranch] = useState(
    isManager && user?.branch_id ? String(user.branch_id) : ''
  );
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [search, setSearch] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // Server Data
  const [leaveData, setLeaveData] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [summary, setSummary] = useState({
    approved: 0,
    pending: 0,
    cancelled: 0,
    on_leave_today: 0,
  });
  const [branches, setBranches] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals Visibility & Selected Record
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedLeaveForDetails, setSelectedLeaveForDetails] = useState(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [selectedLeaveForCancel, setSelectedLeaveForCancel] = useState(null);
  const [balancesModalOpen, setBalancesModalOpen] = useState(false);
  const [typesModalOpen, setTypesModalOpen] = useState(false);

  // 1. Load branches for filter
  useEffect(() => {
    let alive = true;
    api.get('/branches')
      .then((res) => {
        if (alive && Array.isArray(res.data)) {
          setBranches(res.data);
        }
      })
      .catch((err) => {
        console.warn('Could not load branches for leave filter:', err.message);
      });
    return () => { alive = false; };
  }, []);

  // 2. Load leave types for filter
  const loadLeaveTypes = useCallback(async () => {
    try {
      const res = await api.get('/leaves/types');
      if (Array.isArray(res.data?.data)) {
        setLeaveTypes(res.data.data);
      }
    } catch (err) {
      console.warn('Could not load leave types for filter:', err.message);
    }
  }, []);

  useEffect(() => {
    loadLeaveTypes();
  }, [loadLeaveTypes]);

  // 3. Fetch summary metrics
  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/leaves/summary');
      if (res.data?.summary) {
        setSummary(res.data.summary);
      }
    } catch (err) {
      console.warn('Could not load leave summary:', err.message);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  // 4. Fetch Leave Requests with server-side filters & pagination
  const fetchLeaves = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));

      if (selectedBranch) params.append('branch_id', selectedBranch);
      if (selectedStatus) params.append('status', selectedStatus);
      if (selectedTypeId) params.append('leave_type_id', selectedTypeId);
      if (search.trim()) params.append('search', search.trim());
      if (startDateFilter) params.append('start_date', startDateFilter);
      if (endDateFilter) params.append('end_date', endDateFilter);

      const res = await api.get(`/leaves?${params.toString()}`);
      if (res.data?.data) {
        setLeaveData(res.data.data);
        setPagination(res.data.pagination || { total: res.data.data.length, page: 1, limit, totalPages: 1 });
      }
    } catch (err) {
      setError(errorMessage(err, 'Failed to load leave records.'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, selectedBranch, selectedStatus, selectedTypeId, search, startDateFilter, endDateFilter]);

  useEffect(() => {
    fetchLeaves();
  }, [fetchLeaves]);

  const handleResetFilters = () => {
    if (!isManager) setSelectedBranch('');
    setSelectedStatus('');
    setSelectedTypeId('');
    setSearch('');
    setStartDateFilter('');
    setEndDateFilter('');
    setPage(1);
  };

  const handleOpenDetails = (leave) => {
    setSelectedLeaveForDetails(leave);
    setDetailsModalOpen(true);
  };

  const handleOpenCancel = (leave) => {
    setSelectedLeaveForCancel(leave);
    setCancelModalOpen(true);
  };

  const handleOperationSuccess = () => {
    fetchLeaves();
    fetchSummary();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Page Header with Action Buttons */}
      <PageHeader
        title="Leave Management"
        subtitle="Record employee leaves, review approved requests, monitor leave quotas, and manage company leave policies."
        actions={
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {canManageLeaveTypes && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setTypesModalOpen(true)}
                title="Manage tenant leave policies and quotas"
              >
                ⚙️ Leave Types
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setBalancesModalOpen(true)}
              title="View employee leave quotas and used balances"
            >
              📊 Leave Balances
            </button>

            {canRecordLeave && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setRecordModalOpen(true)}
                title="Record an employee leave directly as approved"
              >
                + Record Leave
              </button>
            )}
          </div>
        }
      />

      {/* KPI Cards Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        <Card>
          <Stat
            label="Active On Leave Today"
            value={summary.on_leave_today}
            note="Employees currently on approved leave"
          />
        </Card>
        <Card>
          <Stat
            label="Approved Leaves"
            value={summary.approved}
            note="Total recorded approved leaves"
          />
        </Card>
        <Card>
          <Stat
            label="Cancelled Leaves"
            value={summary.cancelled}
            note="Reversed and restored requests"
          />
        </Card>
        <Card>
          <Stat
            label="Total Processed"
            value={(summary.approved || 0) + (summary.cancelled || 0) + (summary.pending || 0)}
            note="Overall recorded requests"
          />
        </Card>
      </div>

      {/* Attendance Dynamic Sync Banner */}
      <div
        style={{
          padding: '12px 16px',
          borderRadius: 'var(--radius)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 18 }}>ℹ️</span>
          <span style={{ fontSize: 13, color: 'var(--heading)' }}>
            <strong>Attendance Synchronization:</strong> Approved leaves automatically reflect as <strong>ON_LEAVE</strong> in daily attendance reports when employees have no check-in punch. Clock-in punches are preserved with a conflict flag.
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
          Direct Approval Engine Active
        </div>
      </div>

      {/* Main Leave Records Table & Server Filters Card */}
      <Card
        title="Leave Records"
        note={`Showing ${leaveData.length} of ${pagination.total} leave records`}
      >
        {/* Filters Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            marginBottom: 16,
            padding: 14,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}
        >
          {/* Branch filter (Admin can pick, Manager locked) */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="filter-branch">Branch</label>
            <select
              id="filter-branch"
              className="form-control"
              value={selectedBranch}
              onChange={(e) => {
                setSelectedBranch(e.target.value);
                setPage(1);
              }}
              disabled={isManager}
            >
              {!isManager && <option value="">All Branches</option>}
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="filter-status">Status</label>
            <select
              id="filter-status"
              className="form-control"
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Statuses</option>
              <option value="APPROVED">Approved</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="PENDING">Pending</option>
            </select>
          </div>

          {/* Leave Type filter */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="filter-leave-type">Leave Type</label>
            <select
              id="filter-leave-type"
              className="form-control"
              value={selectedTypeId}
              onChange={(e) => {
                setSelectedTypeId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Leave Types</option>
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>
                  {lt.name} ({lt.code})
                </option>
              ))}
            </select>
          </div>

          {/* Search by Employee Name or ID */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="filter-search">Search Staff</label>
            <input
              id="filter-search"
              type="text"
              className="form-control"
              placeholder="Name or Emp ID…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Date range filters */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="filter-start-date">From Date</label>
            <input
              id="filter-start-date"
              type="date"
              className="form-control"
              value={startDateFilter}
              onChange={(e) => {
                setStartDateFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="filter-end-date">To Date</label>
            <input
              id="filter-end-date"
              type="date"
              className="form-control"
              value={endDateFilter}
              onChange={(e) => {
                setEndDateFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Reset button */}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ width: '100%', height: 38 }}
              onClick={handleResetFilters}
            >
              Reset Filters
            </button>
          </div>
        </div>

        {/* Data State Wrap */}
        <DataState
          loading={loading}
          error={error}
          onRetry={fetchLeaves}
          empty={leaveData.length === 0}
          emptyProps={{
            title: 'No Leave Records Found',
            text: 'No leave requests match your selected filters. Click "+ Record Leave" to record an approved employee leave.',
            action: canRecordLeave ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setRecordModalOpen(true)}
              >
                + Record Leave
              </button>
            ) : null,
          }}
        >
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Branch</th>
                  <th>Leave Type</th>
                  <th>Date Range</th>
                  <th className="num">Duration</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th>Recorded By</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {leaveData.map((row) => {
                  const staff = row.StaffProfile;
                  const leaveType = row.LeaveType;
                  const isCancelled = row.status === 'CANCELLED';

                  return (
                    <tr key={row.id}>
                      {/* Employee Cell */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              background: 'var(--primary-soft)',
                              color: 'var(--primary)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: 12,
                              flexShrink: 0,
                            }}
                          >
                            {getInitials(staff?.first_name, staff?.last_name)}
                          </div>
                          <div>
                            <div className="cell-title">
                              {staff ? `${staff.first_name} ${staff.last_name || ''}`.trim() : `Staff #${row.staff_id}`}
                            </div>
                            <div className="cell-sub">
                              {staff?.employee_id || '—'} {staff?.department ? `• ${staff.department}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Branch Cell */}
                      <td>{row.Branch?.name || '—'}</td>

                      {/* Leave Type Cell */}
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>
                          {leaveType?.name || 'Leave'}
                        </div>
                        <span
                          className={`badge ${leaveType?.is_paid ? 'green' : 'neutral'}`}
                          style={{ fontSize: 10.5, padding: '1px 6px', marginTop: 2 }}
                        >
                          {leaveType?.is_paid ? 'Paid' : 'Unpaid (LOP)'}
                        </span>
                      </td>

                      {/* Date Range Cell */}
                      <td>
                        <div style={{ fontSize: 13 }}>
                          {formatDate(row.start_date)}
                          {row.start_date !== row.end_date && (
                            <>
                              <span style={{ margin: '0 4px', color: 'var(--text-subtle)' }}>→</span>
                              {formatDate(row.end_date)}
                            </>
                          )}
                        </div>
                      </td>

                      {/* Duration Cell */}
                      <td className="num">
                        <strong>{Number(row.total_days)} d</strong>
                        {row.is_half_day && (
                          <div style={{ fontSize: 10.5, color: 'var(--primary)' }}>
                            {row.half_day_period === 'FIRST_HALF' ? '1st Half (Morning)' : '2nd Half (Afternoon)'}
                          </div>
                        )}
                      </td>

                      {/* Status Cell */}
                      <td>
                        <StatusBadge
                          value={row.status}
                          tone={getLeaveStatusTone(row.status)}
                        />
                      </td>

                      {/* Reason Cell */}
                      <td>
                        <div
                          style={{
                            maxWidth: 220,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: 13,
                          }}
                          title={row.reason}
                        >
                          {row.reason || '—'}
                        </div>
                      </td>

                      {/* Recorded By Cell */}
                      <td>
                        <div style={{ fontSize: 12.5 }}>
                          {row.ApprovedBy?.name || row.CreatedBy?.name || 'Administrator'}
                        </div>
                        <div className="cell-sub" style={{ fontSize: 11 }}>
                          {formatDate(row.created_at)}
                        </div>
                      </td>

                      {/* Actions Cell */}
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleOpenDetails(row)}
                            title="View comprehensive leave request details"
                          >
                            Details
                          </button>

                          {canCancelLeave && (
                            <button
                              type="button"
                              className={`btn btn-sm ${isCancelled ? 'btn-ghost' : 'btn-danger'}`}
                              disabled={isCancelled}
                              onClick={() => handleOpenCancel(row)}
                              title={isCancelled ? 'This leave record has already been cancelled' : 'Cancel leave and restore deducted quota'}
                            >
                              {isCancelled ? 'Cancelled' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>

          {/* Pagination Controls */}
          <div className="pagination">
            <div className="pagination-info">
              Showing <strong>{leaveData.length}</strong> of{' '}
              <strong>{pagination.total}</strong> leave records
            </div>
            <div className="pagination-controls">
              <label style={{ margin: 0, fontSize: 12 }}>Rows per page:</label>
              <select
                className="form-control"
                style={{ width: 'auto', padding: '4px 8px', height: 32 }}
                value={limit}
                onChange={(e) => {
                  setLimit(parseInt(e.target.value, 10));
                  setPage(1);
                }}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span style={{ fontSize: 12.5, padding: '0 6px' }}>
                Page <strong>{page}</strong> of <strong>{pagination.totalPages || 1}</strong>
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </DataState>
      </Card>

      {/* Record Leave Modal */}
      <RecordLeaveModal
        open={recordModalOpen}
        onClose={() => setRecordModalOpen(false)}
        branches={branches}
        isManager={isManager}
        user={user}
        onSuccess={handleOperationSuccess}
      />

      {/* Leave Details Modal */}
      <LeaveDetailsModal
        open={detailsModalOpen}
        onClose={() => setDetailsModalOpen(false)}
        leave={selectedLeaveForDetails}
        canCancel={canCancelLeave}
        onCancelClick={(l) => {
          setSelectedLeaveForCancel(l);
          setCancelModalOpen(true);
        }}
      />

      {/* Cancel Leave Modal */}
      <CancelLeaveModal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        leave={selectedLeaveForCancel}
        onSuccess={handleOperationSuccess}
      />

      {/* Employee Leave Balances Modal */}
      <LeaveBalancesModal
        open={balancesModalOpen}
        onClose={() => setBalancesModalOpen(false)}
        branches={branches}
        isManager={isManager}
        user={user}
      />

      {/* Leave Types & Policies Modal (Admin Only) */}
      {canManageLeaveTypes && (
        <LeaveTypesModal
          open={typesModalOpen}
          onClose={() => setTypesModalOpen(false)}
          onTypesUpdated={() => {
            loadLeaveTypes();
            fetchLeaves();
          }}
        />
      )}
    </div>
  );
}
