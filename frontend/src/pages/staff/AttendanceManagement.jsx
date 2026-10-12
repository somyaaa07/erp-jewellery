// frontend/src/pages/staff/AttendanceManagement.jsx
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
  errorMessage,
} from '../../components/ui';
import ShiftManagementModal from './ShiftManagementModal';
import MonthlyReportModal from './MonthlyReportModal';
import {
  MarkAttendanceModal,
  CheckOutModal,
  AttendanceCorrectionModal,
  BulkAttendanceModal,
  AttendanceHistoryModal,
  formatTimeAMPM,
} from './AttendanceModals';

const DEPARTMENTS = [
  'Sales',
  'Cashier / Billing',
  'Inventory & Vault',
  'Manufacturing / Karigar',
  'Accounts & Finance',
  'Administration',
  'Security & Maintenance',
];

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'NOT_MARKED', label: 'Not Marked' },
  { value: 'PRESENT', label: 'Present' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'HALF_DAY', label: 'Half Day' },
  { value: 'ON_LEAVE', label: 'On Leave' },
  { value: 'WEEKLY_OFF', label: 'Weekly Off' },
  { value: 'HOLIDAY', label: 'Holiday' },
];

function getAttendanceStatusTone(status) {
  switch (status) {
    case 'PRESENT':
      return 'green';
    case 'ABSENT':
      return 'red';
    case 'HALF_DAY':
      return 'yellow';
    case 'ON_LEAVE':
      return 'blue';
    case 'WEEKLY_OFF':
      return 'neutral';
    case 'HOLIDAY':
      return 'teal';
    case 'NOT_MARKED':
    default:
      return 'neutral';
  }
}

export default function AttendanceManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';

  // Active Date State (defaults to today)
  const getTodayStr = () => new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState(getTodayStr);

  // Filters State
  const [selectedBranch, setSelectedBranch] = useState(
    isManager && user?.branch_id ? String(user.branch_id) : ''
  );
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Data & Server State
  const [attendanceData, setAttendanceData] = useState([]);
  const [summary, setSummary] = useState({
    total_staff: 0,
    present: 0,
    absent: 0,
    half_day: 0,
    on_leave: 0,
    weekly_off: 0,
    holiday: 0,
    not_marked: 0,
  });
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [branches, setBranches] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modals Visibility & Selected Record States
  const [markModalOpen, setMarkModalOpen] = useState(false);
  const [selectedEmployeeForMark, setSelectedEmployeeForMark] = useState(null);

  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [selectedRecordForCheckout, setSelectedRecordForCheckout] = useState(null);

  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [selectedRecordForCorrection, setSelectedRecordForCorrection] = useState(null);

  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedEmployeeForHistory, setSelectedEmployeeForHistory] = useState(null);

  // Load branches
  useEffect(() => {
    let alive = true;
    api.get('/branches')
      .then((res) => {
        if (alive && Array.isArray(res.data)) {
          setBranches(res.data);
        }
      })
      .catch((err) => {
        console.warn('Could not load branches for attendance:', err.message);
      });
    return () => { alive = false; };
  }, []);

  // Load shifts
  const loadShifts = useCallback(async () => {
    try {
      const res = await api.get('/shifts');
      if (Array.isArray(res.data?.data)) {
        setShifts(res.data.data);
      }
    } catch (err) {
      console.warn('Could not load shifts:', err.message);
    }
  }, []);

  useEffect(() => {
    loadShifts();
  }, [loadShifts]);

  // Fetch Daily Attendance with server filters and summary
  const fetchAttendance = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.append('date', selectedDate);
      params.append('page', String(page));
      params.append('limit', String(limit));

      if (selectedBranch) params.append('branch_id', selectedBranch);
      if (selectedDepartment) params.append('department', selectedDepartment);
      if (selectedStatus) params.append('status', selectedStatus);
      if (search.trim()) params.append('search', search.trim());

      const res = await api.get(`/attendance?${params.toString()}`);
      if (res.data) {
        setAttendanceData(res.data.data || []);
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
        if (res.data.pagination) {
          setPagination(res.data.pagination);
        }
      }
    } catch (err) {
      setError(errorMessage(err, 'Failed to load attendance records.'));
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedBranch, selectedDepartment, selectedStatus, search, page, limit]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Date Navigation Helpers
  const handleShiftDate = (days) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(d.toISOString().slice(0, 10));
    setPage(1);
  };

  const handleSetToday = () => {
    setSelectedDate(getTodayStr());
    setPage(1);
  };

  // Actions Handlers
  const handleOpenMarkModal = (employeeRow = null) => {
    setSelectedEmployeeForMark(employeeRow);
    setMarkModalOpen(true);
  };

  const handleOpenCheckoutModal = (record) => {
    setSelectedRecordForCheckout(record);
    setCheckoutModalOpen(true);
  };

  const handleOpenCorrectionModal = (record) => {
    setSelectedRecordForCorrection(record);
    setCorrectionModalOpen(true);
  };

  const handleOpenHistoryModal = (record) => {
    setSelectedEmployeeForHistory(record);
    setHistoryModalOpen(true);
  };

  const handleClearFilters = () => {
    if (!isManager) setSelectedBranch('');
    setSelectedDepartment('');
    setSelectedStatus('');
    setSearch('');
    setPage(1);
  };

  const hasActiveFilters = Boolean(
    (!isManager && selectedBranch) ||
    selectedDepartment ||
    selectedStatus ||
    search.trim()
  );

  return (
    <div>
      {/* Page Header */}
      <PageHeader
        title="Staff Attendance Tracking"
        subtitle={`Daily workforce attendance, scheduled shift check-ins, early/late calculations, and audit history for ${selectedDate}.`}
        actions={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setReportModalOpen(true)}
              title="View and export monthly staff attendance reports"
            >
              📊 Monthly Report
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShiftModalOpen(true)}
              title="Configure working hours, shift names, and grace periods"
            >
              ⏰ Shift Schedules
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setBulkModalOpen(true)}
              title="Mark multiple employees for this branch in one operation"
            >
              👥 Bulk Attendance
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => handleOpenMarkModal(null)}
            >
              + Mark Attendance
            </button>
          </div>
        }
      />

      {/* Date Navigation & Selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '10px 16px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleShiftDate(-1)}
            title="Previous Day"
          >
            ← Previous Day
          </button>
          <input
            type="date"
            style={{ width: 'auto', fontWeight: 600, padding: '5px 10px' }}
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setPage(1);
            }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleShiftDate(1)}
            title="Next Day"
          >
            Next Day →
          </button>
          {selectedDate !== getTodayStr() && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleSetToday}
            >
              Today
            </button>
          )}
        </div>

        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Work Date: <strong>{new Date(selectedDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</strong>
        </div>
      </div>

      {/* Real Summary KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Stat label="Total Staff" value={summary.total_staff} note="Staff in scope" />
        <Stat label="Present" value={summary.present} note="Full day on duty" />
        <Stat label="Absent" value={summary.absent} note="Reported absent" />
        <Stat label="Half Day" value={summary.half_day} note="Short hours" />
        <Stat label="On Leave" value={summary.on_leave} note="Approved leave" />
        <Stat label="Weekly Off" value={summary.weekly_off} note="Scheduled off" />
        <Stat label="Holiday" value={summary.holiday} note="Store holiday" />
        <Stat
          label="Not Marked"
          value={summary.not_marked}
          note="Pending daily entry"
        />
      </div>

      {/* Main Attendance Card */}
      <Card bodyClass="tight" style={{ overflow: 'hidden' }}>
        {/* Filter Bar */}
        <div className="filter-bar">
          <div className="filter-search">
            <input
              type="search"
              placeholder="Search employee by name, ID, or phone..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Branch Filter */}
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

          {/* Status Filter */}
          <div className="filter-item">
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            {hasActiveFilters && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleClearFilters}
              >
                Clear
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={fetchAttendance}
              disabled={loading}
              title="Refresh attendance data"
            >
              {loading ? '...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Attendance Table */}
        <DataState
          loading={loading}
          error={error}
          empty={attendanceData.length === 0}
          emptyProps={{
            title: 'No employees or attendance records match this filter',
            text: `No active staff found for date ${selectedDate} with current criteria.`,
            action: (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => handleOpenMarkModal(null)}>
                + Mark Attendance
              </button>
            ),
          }}
          onRetry={fetchAttendance}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Employee Name</th>
                  <th>Department / Designation</th>
                  <th>Branch</th>
                  <th>Shift Schedule</th>
                  <th>Scheduled Timings</th>
                  <th>Actual Punch In/Out</th>
                  <th>Status</th>
                  <th className="num">Late</th>
                  <th className="num">Early Exit</th>
                  <th className="num">Working Time</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {attendanceData.map((row) => {
                  const hasAttendanceRecord = Boolean(row.attendance_id);
                  const hasRealPunch = Boolean(
                    hasAttendanceRecord &&
                    ['PRESENT', 'HALF_DAY'].includes(row.status) &&
                    row.actual_check_in
                  );
                  const needsCheckout = hasRealPunch && row.status === 'PRESENT' && !row.actual_check_out;
                  const isUnmarked = row.status === 'NOT_MARKED';

                  return (
                    <tr
                      key={row.staff_id}
                      style={{
                        background: isUnmarked ? 'rgba(240, 234, 243, 0.25)' : undefined,
                      }}
                    >
                      <td>
                        <strong style={{ color: 'var(--primary)' }}>
                          {row.employee_id || `ID#${row.staff_id}`}
                        </strong>
                      </td>
                      <td>
                        <div className="cell-title">{row.name}</div>
                      </td>
                      <td>
                        <div>{row.department || '—'}</div>
                        <div className="cell-sub">{row.designation || '—'}</div>
                      </td>
                      <td>{row.branch_name || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 500 }}>
                          {row.shift_name || 'General Shift'}
                        </span>
                        {row.is_overnight && (
                          <span
                            className="badge blue"
                            style={{ marginLeft: 6, fontSize: 10, padding: '1px 5px' }}
                            title="Overnight shift crosses midnight"
                          >
                            Overnight
                          </span>
                        )}
                      </td>
                      <td>
                        {row.scheduled_check_in ? (
                          <span style={{ fontSize: 12.5 }}>
                            {formatTimeAMPM(row.scheduled_check_in)} – {formatTimeAMPM(row.scheduled_check_out)}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {hasRealPunch ? (
                          <div style={{ fontSize: 12.5 }}>
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>
                              {formatTimeAMPM(row.actual_check_in)}
                            </span>
                            <span style={{ margin: '0 4px', color: 'var(--text-subtle)' }}>→</span>
                            {row.actual_check_out ? (
                              <span style={{ fontWeight: 600 }}>
                                {formatTimeAMPM(row.actual_check_out)}
                              </span>
                            ) : (
                              <span className="badge yellow" style={{ fontSize: 10.5 }}>
                                Working
                              </span>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge
                          value={row.status === 'NOT_MARKED' ? 'NOT MARKED' : (row.status === 'ON_LEAVE' ? 'ON LEAVE' : row.status)}
                          tone={getAttendanceStatusTone(row.status)}
                        />
                        {row.leave_conflict && (
                          <span
                            className="badge red"
                            style={{ display: 'inline-block', marginTop: 3, fontSize: 10, padding: '1px 5px', fontWeight: 600 }}
                            title={row.conflict_details?.message || 'Employee punched attendance while having an approved leave on this date'}
                          >
                            ⚠️ Leave Conflict
                          </span>
                        )}
                      </td>
                      <td className="num">
                        {row.late_minutes > 0 ? (
                          <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                            +{row.late_minutes}m
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>—</span>
                        )}
                      </td>
                      <td className="num">
                        {row.early_departure_minutes > 0 ? (
                          <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}>
                            {row.early_departure_minutes}m
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>—</span>
                        )}
                      </td>
                      <td className="num">
                        {row.working_hours !== null ? (
                          <strong>{Number(row.working_hours).toFixed(1)} hrs</strong>
                        ) : (
                          <span style={{ color: 'var(--text-subtle)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {/* If no attendance row exists (unmarked or virtual on-leave), allow marking */}
                          {!hasAttendanceRecord && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleOpenMarkModal(row)}
                              title="Mark attendance for today"
                            >
                              Mark
                            </button>
                          )}

                          {/* If present without checkout, show quick evening checkout */}
                          {needsCheckout && (
                            <button
                              type="button"
                              className="btn btn-gold btn-sm"
                              onClick={() => handleOpenCheckoutModal(row)}
                              title="Record evening check-out"
                            >
                              Check-out
                            </button>
                          )}

                          {/* Edit / Correction action (only when attendance record exists in database) */}
                          {hasAttendanceRecord && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenCorrectionModal(row)}
                              title="Edit or correct recorded attendance with audit reason"
                            >
                              Correction
                            </button>
                          )}

                          {/* Historical records */}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleOpenHistoryModal(row)}
                            title="View chronological attendance history"
                          >
                            History
                          </button>
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
              Showing <strong>{attendanceData.length}</strong> of{' '}
              <strong>{pagination.total}</strong> employees
            </div>
            <div className="pagination-controls">
              <label style={{ margin: 0, fontSize: 12 }}>Rows per page:</label>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(parseInt(e.target.value, 10));
                  setPage(1);
                }}
              >
                <option value="15">15</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Previous
              </button>
              <span style={{ margin: '0 6px' }}>
                Page <strong>{page}</strong> of <strong>{pagination.totalPages || 1}</strong>
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPage((p) => Math.min(pagination.totalPages || 1, p + 1))}
                disabled={page >= pagination.totalPages}
              >
                Next
              </button>
            </div>
          </div>
        </DataState>
      </Card>

      {/* Modals */}
      <MarkAttendanceModal
        open={markModalOpen}
        onClose={() => setMarkModalOpen(false)}
        date={selectedDate}
        employee={selectedEmployeeForMark}
        staffList={attendanceData}
        shifts={shifts}
        onSuccess={fetchAttendance}
      />

      <CheckOutModal
        open={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        record={selectedRecordForCheckout}
        onSuccess={fetchAttendance}
      />

      <AttendanceCorrectionModal
        open={correctionModalOpen}
        onClose={() => setCorrectionModalOpen(false)}
        record={selectedRecordForCorrection}
        shifts={shifts}
        onSuccess={fetchAttendance}
      />

      <BulkAttendanceModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        date={selectedDate}
        branchId={selectedBranch}
        staffList={attendanceData}
        shifts={shifts}
        onSuccess={fetchAttendance}
      />

      <AttendanceHistoryModal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        employee={selectedEmployeeForHistory}
      />

      <ShiftManagementModal
        open={shiftModalOpen}
        onClose={() => setShiftModalOpen(false)}
        branches={branches}
        isManager={isManager}
        managerBranchId={user?.branch_id}
        onShiftsUpdated={loadShifts}
      />

      <MonthlyReportModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        branches={branches}
        departments={DEPARTMENTS}
        isManager={isManager}
        managerBranchId={user?.branch_id}
      />
    </div>
  );
}
