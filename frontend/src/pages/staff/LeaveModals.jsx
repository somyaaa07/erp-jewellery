// frontend/src/pages/staff/LeaveModals.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import {
  Modal,
  StatusBadge,
  TableWrap,
  DataState,
  Alert,
  formatDate,
  formatDateTime,
  errorMessage,
} from '../../components/ui';

/* -------------------------------------------------------------------------
   Helper: Format initials for avatars
------------------------------------------------------------------------- */
function getInitials(firstName = '', lastName = '') {
  const f = firstName?.[0]?.toUpperCase() || '';
  const l = lastName?.[0]?.toUpperCase() || '';
  return f + l || 'E';
}

/* -------------------------------------------------------------------------
   1. Record Leave Modal (Admin & Branch Manager)
------------------------------------------------------------------------- */
export function RecordLeaveModal({
  open,
  onClose,
  branches = [],
  isManager = false,
  user = null,
  onSuccess,
}) {
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Form Fields
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayPeriod, setHalfDayPeriod] = useState('FIRST_HALF');
  const [reason, setReason] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');

  // Remote data
  const [staffList, setStaffList] = useState([]);
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      const initialBranch = isManager && user?.branch_id ? String(user.branch_id) : (branches[0]?.id ? String(branches[0].id) : '');
      setSelectedBranchId(initialBranch);
      setSelectedStaffId('');
      setSelectedTypeId('');
      setStartDate(todayStr);
      setEndDate(todayStr);
      setIsHalfDay(false);
      setHalfDayPeriod('FIRST_HALF');
      setReason('');
      setDocumentUrl('');
      setServerError('');
      setBalances([]);
    }
  }, [open, isManager, user, branches, todayStr]);

  // Load Leave Types for tenant
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingTypes(true);
    api.get('/leaves/types')
      .then((res) => {
        if (alive && Array.isArray(res.data?.data)) {
          setLeaveTypes(res.data.data);
          if (res.data.data.length > 0 && !selectedTypeId) {
            setSelectedTypeId(String(res.data.data[0].id));
          }
        }
      })
      .catch((err) => {
        if (alive) console.warn('Could not load leave types:', err.message);
      })
      .finally(() => {
        if (alive) setLoadingTypes(false);
      });
    return () => { alive = false; };
  }, [open, selectedTypeId]);

  // Load Staff for selected branch
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingStaff(true);
    const params = new URLSearchParams();
    params.append('status', 'ACTIVE');
    params.append('limit', '150');
    if (selectedBranchId) {
      params.append('branch_id', selectedBranchId);
    }

    api.get(`/staff?${params.toString()}`)
      .then((res) => {
        if (alive) {
          const list = res.data?.data || (Array.isArray(res.data) ? res.data : []);
          setStaffList(list);
          if (list.length > 0 && !selectedStaffId) {
            setSelectedStaffId(String(list[0].id));
          } else if (list.length === 0) {
            setSelectedStaffId('');
          }
        }
      })
      .catch((err) => {
        if (alive) console.warn('Could not load staff list:', err.message);
      })
      .finally(() => {
        if (alive) setLoadingStaff(false);
      });
    return () => { alive = false; };
  }, [open, selectedBranchId, selectedStaffId]);

  // Load Balances when staff is selected
  const selectedYear = useMemo(() => {
    return startDate ? parseInt(startDate.slice(0, 4), 10) : new Date().getFullYear();
  }, [startDate]);

  useEffect(() => {
    if (!open || !selectedStaffId) {
      setBalances([]);
      return;
    }
    let alive = true;
    setLoadingBalances(true);
    api.get(`/leaves/balances/${selectedStaffId}?year=${selectedYear}`)
      .then((res) => {
        if (alive && Array.isArray(res.data?.data)) {
          setBalances(res.data.data);
        }
      })
      .catch((err) => {
        if (alive) console.warn('Could not load employee balances:', err.message);
      })
      .finally(() => {
        if (alive) setLoadingBalances(false);
      });
    return () => { alive = false; };
  }, [open, selectedStaffId, selectedYear]);

  // Selected leave type object & balance info
  const currentLeaveType = useMemo(() => {
    return leaveTypes.find((lt) => String(lt.id) === String(selectedTypeId));
  }, [leaveTypes, selectedTypeId]);

  const currentBalance = useMemo(() => {
    if (!currentLeaveType) return null;
    return balances.find((b) => b.leave_type_id === currentLeaveType.id);
  }, [balances, currentLeaveType]);

  // Estimated days calculation (rough preview on UI)
  const estimatedDays = useMemo(() => {
    if (isHalfDay) return 0.5;
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return 0;
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  }, [startDate, endDate, isHalfDay]);

  const hasInsufficientBalance = useMemo(() => {
    if (!currentLeaveType || !currentLeaveType.is_paid || !currentBalance) return false;
    return estimatedDays > currentBalance.available_days;
  }, [currentLeaveType, currentBalance, estimatedDays]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!selectedStaffId) {
      toast.error('Please select an employee.');
      return;
    }
    if (!selectedTypeId) {
      toast.error('Please select a leave type.');
      return;
    }
    if (!startDate || !endDate) {
      toast.error('Start date and end date are required.');
      return;
    }
    if (startDate > endDate) {
      toast.error('Start date cannot be after end date.');
      return;
    }
    if (isHalfDay && startDate !== endDate) {
      toast.error('Half-day leave must start and end on the exact same date.');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason for the leave.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        staff_id: parseInt(selectedStaffId, 10),
        leave_type_id: parseInt(selectedTypeId, 10),
        start_date: startDate,
        end_date: isHalfDay ? startDate : endDate,
        is_half_day: Boolean(isHalfDay),
        half_day_period: isHalfDay ? halfDayPeriod : undefined,
        reason: reason.trim(),
        document_url: documentUrl.trim() || undefined,
      };

      const res = await api.post('/leaves', payload);
      toast.success(res.data?.message || 'Leave recorded directly as APPROVED!');
      if (onSuccess) onSuccess(res.data?.data);
      onClose();
    } catch (err) {
      const msg = errorMessage(err, 'Failed to record leave.');
      setServerError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Employee Leave (Direct Approval)"
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, width: '100%' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner spinner-sm" style={{ marginRight: 8 }} />
                Recording Leave…
              </>
            ) : (
              'Record Leave (Approved)'
            )}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Informative direct approval note */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius)',
            background: 'var(--primary-soft)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>⚡</span>
          <div style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--heading)' }}>
            <strong>Direct Leave Recording:</strong> As an authorized administrator or branch manager, recording an employee leave will mark it directly as <strong>APPROVED</strong> and deduct available balance if paid. There is no second approval step.
          </div>
        </div>

        {serverError && (
          <Alert tone="danger" title="Validation or Concurrency Error">
            {serverError}
          </Alert>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {/* Branch Selection */}
          <div className="form-group">
            <label className="form-label" htmlFor="record-leave-branch">Branch *</label>
            <select
              id="record-leave-branch"
              className="form-control"
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                setSelectedStaffId('');
              }}
              disabled={isManager || submitting}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {isManager && (
              <small style={{ color: 'var(--text-subtle)', marginTop: 4, display: 'block' }}>
                Branch managers can only manage employees within their assigned branch.
              </small>
            )}
          </div>

          {/* Employee Selection */}
          <div className="form-group">
            <label className="form-label" htmlFor="record-leave-staff">
              Employee * {loadingStaff && <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>(loading…)</span>}
            </label>
            <select
              id="record-leave-staff"
              className="form-control"
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              disabled={loadingStaff || submitting || staffList.length === 0}
            >
              {staffList.length === 0 ? (
                <option value="">No active staff found in branch</option>
              ) : (
                staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name || ''} ({s.employee_id}) — {s.department || 'Staff'}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Leave Type and Balance Information Banner */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="record-leave-type">
              Leave Type * {loadingTypes && <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>(loading…)</span>}
            </label>
            <select
              id="record-leave-type"
              className="form-control"
              value={selectedTypeId}
              onChange={(e) => setSelectedTypeId(e.target.value)}
              disabled={loadingTypes || submitting}
            >
              {leaveTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code}) — {t.is_paid ? `Paid (${t.days_allowed_per_year}d/yr)` : 'Unpaid (Loss of Pay)'}
                </option>
              ))}
            </select>
          </div>

          {/* Available Quota Display */}
          <div className="form-group">
            <label className="form-label">Available Balance for {selectedYear}</label>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius)',
                background: currentLeaveType?.is_paid ? 'var(--surface-2)' : 'var(--warning-soft)',
                border: '1px solid var(--border)',
                minHeight: 42,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {loadingBalances ? (
                <span style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Loading balance quota…</span>
              ) : currentLeaveType?.is_paid ? (
                currentBalance ? (
                  <>
                    <span style={{ fontSize: 13 }}>
                      Entitled: <strong>{currentBalance.entitled_days}d</strong> | Used: <strong>{currentBalance.used_days}d</strong>
                    </span>
                    <span
                      className={`badge ${currentBalance.available_days > 0 ? 'green' : 'red'}`}
                      style={{ fontSize: 12, padding: '3px 8px' }}
                    >
                      Remaining: {currentBalance.available_days} days
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Balance info will generate on recording</span>
                )
              ) : (
                <div style={{ fontSize: 13, color: 'var(--warning-text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>📋</span>
                  <span><strong>Unpaid Leave (Loss of Pay):</strong> Does not deduct from paid balances.</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Date Selection & Half-Day Configuration */}
        <div style={{ padding: '14px', background: 'var(--surface-2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, fontSize: 13.5 }}>Leave Dates & Period</span>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
              <input
                type="checkbox"
                checked={isHalfDay}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsHalfDay(checked);
                  if (checked) {
                    setEndDate(startDate);
                  }
                }}
                disabled={submitting}
              />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Half-day Leave</span>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="record-start-date">Start Date *</label>
              <input
                id="record-start-date"
                type="date"
                className="form-control"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (isHalfDay) setEndDate(e.target.value);
                }}
                disabled={submitting}
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="record-end-date">End Date *</label>
              <input
                id="record-end-date"
                type="date"
                className="form-control"
                value={isHalfDay ? startDate : endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isHalfDay || submitting}
                required
              />
            </div>

            {isHalfDay && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="record-half-period">Half-Day Period *</label>
                <select
                  id="record-half-period"
                  className="form-control"
                  value={halfDayPeriod}
                  onChange={(e) => setHalfDayPeriod(e.target.value)}
                  disabled={submitting}
                >
                  <option value="FIRST_HALF">First Half (Morning)</option>
                  <option value="SECOND_HALF">Second Half (Afternoon)</option>
                </select>
              </div>
            )}
          </div>

          {/* Insufficient balance live warning */}
          {hasInsufficientBalance && (
            <div style={{ marginTop: 12 }}>
              <Alert tone="warning" title="Potential Overdraft Warning">
                The requested leave duration (~{estimatedDays} days) exceeds the employee's current remaining quota of {currentBalance?.available_days || 0} days. If working calendar exclusions do not bring it under the available balance, the request will be strictly rejected.
              </Alert>
            </div>
          )}
        </div>

        {/* Reason and Optional Attachment URL */}
        <div className="form-group">
          <label className="form-label" htmlFor="record-leave-reason">Reason for Leave *</label>
          <textarea
            id="record-leave-reason"
            className="form-control"
            rows={3}
            placeholder="e.g. Personal family event, medical appointment, out-of-station visit..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="record-leave-doc">Document / Proof URL (Optional)</label>
          <input
            id="record-leave-doc"
            type="url"
            className="form-control"
            placeholder="https://... (e.g. medical certificate or approval scan)"
            value={documentUrl}
            onChange={(e) => setDocumentUrl(e.target.value)}
            disabled={submitting}
          />
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------
   2. Leave Details Modal
------------------------------------------------------------------------- */
export function LeaveDetailsModal({
  open,
  onClose,
  leave = null,
  onCancelClick,
  canCancel = false,
}) {
  if (!leave) return null;

  const staff = leave.StaffProfile;
  const leaveType = leave.LeaveType;
  const branch = leave.Branch;
  const isCancelled = leave.status === 'CANCELLED';

  // Parse yearly deductions if cross-year
  const yearlyDeductions = useMemo(() => {
    if (!leave.yearly_deductions) return null;
    if (typeof leave.yearly_deductions === 'object') return leave.yearly_deductions;
    try {
      return JSON.parse(leave.yearly_deductions);
    } catch {
      return null;
    }
  }, [leave.yearly_deductions]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Leave Request Details (#${leave.id})`}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            {canCancel && !isCancelled && (
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  onClose();
                  if (onCancelClick) onCancelClick(leave);
                }}
              >
                Cancel This Leave…
              </button>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Status header banner */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            background: isCancelled ? 'var(--danger-soft)' : 'var(--success-soft)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Request Status</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: isCancelled ? 'var(--danger)' : 'var(--success)' }}>
              {leave.status}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Chargeable Leave Days</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {Number(leave.total_days)} day(s)
              {leave.is_half_day && (
                <span className="badge blue" style={{ marginLeft: 8, fontSize: 11 }}>
                  {leave.half_day_period === 'FIRST_HALF' ? 'First Half (Morning)' : 'Second Half (Afternoon)'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Employee & Branch Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            background: 'var(--surface-2)',
            padding: '14px',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}
        >
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>Employee</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              {staff ? `${staff.first_name} ${staff.last_name || ''}` : `Staff ID#${leave.staff_id}`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{staff?.employee_id || '—'}</div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>Department & Designation</div>
            <div style={{ fontWeight: 500, fontSize: 13 }}>{staff?.department || '—'}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{staff?.designation || '—'}</div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>Branch</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{branch?.name || '—'}</div>
          </div>

          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>Leave Policy</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{leaveType?.name || 'Leave'}</div>
            <span className={`badge ${leaveType?.is_paid ? 'green' : 'teal'}`} style={{ fontSize: 11 }}>
              {leaveType?.is_paid ? 'Paid Leave' : 'Unpaid (Loss of Pay)'}
            </span>
          </div>
        </div>

        {/* Dates & Reason */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 4 }}>Date Range</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {formatDate(leave.start_date)} {leave.start_date !== leave.end_date ? ` → ${formatDate(leave.end_date)}` : ''}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 4 }}>Balance Deducted</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>
              {leave.is_balance_deducted ? (
                <span className="badge green">Deducted from Quota</span>
              ) : (
                <span className="badge neutral">No Deduction (Unpaid / Restored)</span>
              )}
            </div>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 4 }}>Reason for Leave</div>
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface-2)',
              fontSize: 13.5,
              lineHeight: 1.5,
              border: '1px solid var(--border)',
            }}
          >
            {leave.reason || 'No reason specified'}
          </div>
        </div>

        {/* Cross-Year Allocations if present */}
        {yearlyDeductions && Object.keys(yearlyDeductions).length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 6 }}>Cross-Year Deduction Breakdown</div>
            <TableWrap>
              <table className="table" style={{ margin: 0 }}>
                <thead>
                  <tr>
                    <th>Calendar Year</th>
                    <th className="num">Chargeable Days Deducted</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(yearlyDeductions).map(([yr, days]) => (
                    <tr key={yr}>
                      <td><strong>Year {yr}</strong></td>
                      <td className="num">{Number(days)} day(s)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </div>
        )}

        {/* Document Attachment */}
        {leave.document_url && (
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 4 }}>Supporting Document</div>
            <a
              href={leave.document_url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              📄 View Document
            </a>
          </div>
        )}

        {/* Audit Log Details */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          <div>
            Recorded & Approved by: <strong>{leave.ApprovedBy?.name || leave.CreatedBy?.name || 'Administrator'}</strong> ({leave.ApprovedBy?.email || leave.CreatedBy?.email || '—'}) on {formatDateTime(leave.approved_at || leave.created_at)}
          </div>
          {isCancelled && (
            <div style={{ color: 'var(--danger)' }}>
              Cancelled by: <strong>{leave.CancelledBy?.name || 'Administrator'}</strong> on {formatDateTime(leave.cancelled_at)}. Reason: <em>"{leave.cancellation_reason || '—'}"</em>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------
   3. Cancel Leave Modal (with mandatory reason)
------------------------------------------------------------------------- */
export function CancelLeaveModal({
  open,
  onClose,
  leave = null,
  onSuccess,
}) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
    }
  }, [open]);

  if (!leave) return null;

  const staff = leave.StaffProfile;
  const staffName = staff ? `${staff.first_name} ${staff.last_name || ''}`.trim() : `Staff #${leave.staff_id}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Please provide a reason for cancelling this leave.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.patch(`/leaves/${leave.id}/cancel`, {
        reason: reason.trim(),
      });
      toast.success(res.data?.message || 'Leave cancelled and balance restored successfully!');
      if (onSuccess) onSuccess(res.data?.data);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to cancel leave request.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel Approved Leave"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, width: '100%' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Keep Leave
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? 'Cancelling…' : 'Confirm Cancellation'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Alert tone="warning" title="Balance Restoration Confirmation">
          Are you sure you want to cancel the approved leave for <strong>{staffName}</strong> ({Number(leave.total_days)} day(s) from {formatDate(leave.start_date)} to {formatDate(leave.end_date)})?
          <div style={{ marginTop: 8 }}>
            Cancelling will mark this leave request as <strong>CANCELLED</strong> and reverse the previously deducted <strong>{Number(leave.total_days)} day(s)</strong> back to the employee's leave balance.
          </div>
        </Alert>

        <div className="form-group">
          <label className="form-label" htmlFor="cancel-leave-reason">Cancellation Reason *</label>
          <textarea
            id="cancel-leave-reason"
            className="form-control"
            rows={3}
            placeholder="e.g. Employee returned to duty early, vacation plans postponed, recorded in error..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={submitting}
            required
          />
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------
   4. Leave Balances Modal (Staff Quota Overview)
------------------------------------------------------------------------- */
export function LeaveBalancesModal({
  open,
  onClose,
  branches = [],
  isManager = false,
  user = null,
}) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [selectedYear, setSelectedYear] = useState(currentYear);

  const [staffList, setStaffList] = useState([]);
  const [balanceData, setBalanceData] = useState([]);
  const [staffHeader, setStaffHeader] = useState(null);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [error, setError] = useState('');

  // Initial branch setup
  useEffect(() => {
    if (open) {
      const initBranch = isManager && user?.branch_id ? String(user.branch_id) : (branches[0]?.id ? String(branches[0].id) : '');
      setSelectedBranchId(initBranch);
      setSelectedYear(currentYear);
      setError('');
    }
  }, [open, isManager, user, branches, currentYear]);

  // Load staff for branch
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoadingStaff(true);
    const params = new URLSearchParams();
    params.append('status', 'ACTIVE');
    params.append('limit', '150');
    if (selectedBranchId) params.append('branch_id', selectedBranchId);

    api.get(`/staff?${params.toString()}`)
      .then((res) => {
        if (alive) {
          const list = res.data?.data || (Array.isArray(res.data) ? res.data : []);
          setStaffList(list);
          if (list.length > 0 && !selectedStaffId) {
            setSelectedStaffId(String(list[0].id));
          } else if (list.length === 0) {
            setSelectedStaffId('');
            setBalanceData([]);
            setStaffHeader(null);
          }
        }
      })
      .catch((err) => {
        if (alive) console.warn('Could not load staff for balances:', err.message);
      })
      .finally(() => {
        if (alive) setLoadingStaff(false);
      });
    return () => { alive = false; };
  }, [open, selectedBranchId, selectedStaffId]);

  // Fetch balances for staffId and year
  const fetchBalances = useCallback(async () => {
    if (!selectedStaffId) {
      setBalanceData([]);
      setStaffHeader(null);
      return;
    }
    setLoadingBalances(true);
    setError('');
    try {
      const res = await api.get(`/leaves/balances/${selectedStaffId}?year=${selectedYear}`);
      setBalanceData(res.data?.data || []);
      setStaffHeader(res.data?.staff || null);
    } catch (err) {
      setError(errorMessage(err, 'Could not fetch leave balances.'));
    } finally {
      setLoadingBalances(false);
    }
  }, [selectedStaffId, selectedYear]);

  useEffect(() => {
    if (open && selectedStaffId) {
      fetchBalances();
    }
  }, [open, selectedStaffId, selectedYear, fetchBalances]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Employee Leave Balances & Quotas"
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Filter Bar */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            padding: 12,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bal-branch-select">Branch</label>
            <select
              id="bal-branch-select"
              className="form-control"
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value);
                setSelectedStaffId('');
              }}
              disabled={isManager}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bal-staff-select">Employee</label>
            <select
              id="bal-staff-select"
              className="form-control"
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              disabled={loadingStaff || staffList.length === 0}
            >
              {staffList.length === 0 ? (
                <option value="">No employees found</option>
              ) : (
                staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name || ''} ({s.employee_id})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bal-year-select">Calendar Year</label>
            <select
              id="bal-year-select"
              className="form-control"
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            >
              <option value={currentYear - 1}>{currentYear - 1}</option>
              <option value={currentYear}>{currentYear}</option>
              <option value={currentYear + 1}>{currentYear + 1}</option>
            </select>
          </div>
        </div>

        {/* Staff Header banner */}
        {staffHeader && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontWeight: 600, fontSize: 14 }}>{staffHeader.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>({staffHeader.employee_id})</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Branch: <strong>{staffHeader.branch_name}</strong> | Year: <strong>{selectedYear}</strong>
            </div>
          </div>
        )}

        {/* Table of balances */}
        <DataState
          loading={loadingBalances}
          error={error}
          onRetry={fetchBalances}
          empty={balanceData.length === 0}
          emptyProps={{
            title: 'No Balance Records Found',
            text: 'Select an employee above to view their allocated leave quotas and used balances.',
          }}
        >
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Leave Type</th>
                  <th>Category</th>
                  <th className="num">Annual Entitled</th>
                  <th className="num">Used Days</th>
                  <th className="num">Pending</th>
                  <th className="num">Remaining Available</th>
                </tr>
              </thead>
              <tbody>
                {balanceData.map((bal) => (
                  <tr key={bal.leave_type_id}>
                    <td>
                      <div className="cell-title">{bal.leave_type_name}</div>
                      <div className="cell-sub">{bal.leave_type_code}</div>
                    </td>
                    <td>
                      <span className={`badge ${bal.is_paid ? 'green' : 'neutral'}`}>
                        {bal.is_paid ? 'Paid' : 'Unpaid (LOP)'}
                      </span>
                    </td>
                    <td className="num">
                      <strong>{bal.entitled_days} d</strong>
                    </td>
                    <td className="num">
                      <span style={{ color: bal.used_days > 0 ? 'var(--warning-text)' : 'inherit' }}>
                        {bal.used_days} d
                      </span>
                    </td>
                    <td className="num">{bal.pending_days} d</td>
                    <td className="num">
                      {bal.is_paid ? (
                        <span
                          className={`badge ${bal.available_days > 0 ? 'green' : 'red'}`}
                          style={{ fontSize: 12, padding: '3px 8px', fontWeight: 600 }}
                        >
                          {bal.available_days} days
                        </span>
                      ) : (
                        <span className="badge neutral" style={{ fontSize: 11 }}>
                          Unlimited (Unpaid)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DataState>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------
   5. Leave Types Modal (Admin Only - LEAVE_TYPE_MANAGE)
------------------------------------------------------------------------- */
export function LeaveTypesModal({
  open,
  onClose,
  onTypesUpdated,
}) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editing / Creating sub-state
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formQuota, setFormQuota] = useState(12);
  const [formIsPaid, setFormIsPaid] = useState(true);
  const [formExcludeWeeklyOffs, setFormExcludeWeeklyOffs] = useState(true);
  const [formExcludeHolidays, setFormExcludeHolidays] = useState(true);
  const [formRequiresAttachment, setFormRequiresAttachment] = useState(false);
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadTypes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/leaves/types');
      setTypes(res.data?.data || []);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load leave types.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadTypes();
      setIsEditing(false);
    }
  }, [open, loadTypes]);

  const handleStartCreate = () => {
    setEditingId(null);
    setFormName('');
    setFormCode('');
    setFormQuota(10);
    setFormIsPaid(true);
    setFormExcludeWeeklyOffs(true);
    setFormExcludeHolidays(true);
    setFormRequiresAttachment(false);
    setFormIsActive(true);
    setIsEditing(true);
  };

  const handleStartEdit = (t) => {
    setEditingId(t.id);
    setFormName(t.name);
    setFormCode(t.code);
    setFormQuota(Number(t.days_allowed_per_year) || 0);
    setFormIsPaid(Boolean(t.is_paid));
    setFormExcludeWeeklyOffs(Boolean(t.exclude_weekly_offs));
    setFormExcludeHolidays(Boolean(t.exclude_holidays));
    setFormRequiresAttachment(Boolean(t.requires_attachment));
    setFormIsActive(Boolean(t.is_active));
    setIsEditing(true);
  };

  const handleSaveType = async (e) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('Leave type name is required.');
      return;
    }
    if (!editingId && !formCode.trim()) {
      toast.error('Leave type code is required.');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // Update existing
        await api.put(`/leaves/types/${editingId}`, {
          name: formName.trim(),
          days_allowed_per_year: parseFloat(formQuota) || 0,
          is_paid: Boolean(formIsPaid),
          exclude_weekly_offs: Boolean(formExcludeWeeklyOffs),
          exclude_holidays: Boolean(formExcludeHolidays),
          requires_attachment: Boolean(formRequiresAttachment),
          is_active: Boolean(formIsActive),
        });
        toast.success('Leave type updated successfully!');
      } else {
        // Create new
        await api.post('/leaves/types', {
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          days_allowed_per_year: parseFloat(formQuota) || 0,
          is_paid: Boolean(formIsPaid),
          exclude_weekly_offs: Boolean(formExcludeWeeklyOffs),
          exclude_holidays: Boolean(formExcludeHolidays),
          requires_attachment: Boolean(formRequiresAttachment),
        });
        toast.success('New leave type created successfully!');
      }
      setIsEditing(false);
      loadTypes();
      if (onTypesUpdated) onTypesUpdated();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save leave type.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tenant Leave Types & Policies"
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            {!isEditing && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleStartCreate}>
                + Add Custom Leave Type
              </button>
            )}
          </div>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Inline Edit Form */}
        {isEditing ? (
          <form
            onSubmit={handleSaveType}
            style={{
              padding: 16,
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h4 style={{ margin: 0 }}>
                {editingId ? 'Edit Leave Type' : 'Create Custom Leave Type'}
              </h4>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="lt-name">Leave Name *</label>
                <input
                  id="lt-name"
                  type="text"
                  className="form-control"
                  placeholder="e.g. Compensatory Off"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="lt-code">Unique Code *</label>
                <input
                  id="lt-code"
                  type="text"
                  className="form-control"
                  placeholder="e.g. COMP_OFF"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  disabled={Boolean(editingId) || saving}
                  required
                />
                {editingId && (
                  <small style={{ color: 'var(--text-subtle)', fontSize: 11 }}>Code cannot be modified after creation</small>
                )}
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="lt-quota">Annual Quota (Days) *</label>
                <input
                  id="lt-quota"
                  type="number"
                  step="0.5"
                  min="0"
                  className="form-control"
                  value={formQuota}
                  onChange={(e) => setFormQuota(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, marginTop: 4 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={formIsPaid}
                  onChange={(e) => setFormIsPaid(e.target.checked)}
                  disabled={saving}
                />
                <span style={{ fontSize: 13 }}>Paid Leave</span>
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={formExcludeWeeklyOffs}
                  onChange={(e) => setFormExcludeWeeklyOffs(e.target.checked)}
                  disabled={saving}
                />
                <span style={{ fontSize: 13 }}>Exclude Weekly Offs (Sundays)</span>
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={formExcludeHolidays}
                  onChange={(e) => setFormExcludeHolidays(e.target.checked)}
                  disabled={saving}
                />
                <span style={{ fontSize: 13 }}>Exclude Public Holidays</span>
              </label>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                <input
                  type="checkbox"
                  checked={formRequiresAttachment}
                  onChange={(e) => setFormRequiresAttachment(e.target.checked)}
                  disabled={saving}
                />
                <span style={{ fontSize: 13 }}>Requires Medical / Proof Document</span>
              </label>

              {editingId && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={formIsActive}
                    onChange={(e) => setFormIsActive(e.target.checked)}
                    disabled={saving}
                  />
                  <span style={{ fontSize: 13 }}>Active Status</span>
                </label>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={saving}
              >
                {saving ? 'Saving…' : editingId ? 'Update Leave Type' : 'Create Leave Type'}
              </button>
            </div>
          </form>
        ) : null}

        {/* Types Table */}
        <DataState
          loading={loading}
          error={error}
          onRetry={loadTypes}
          empty={types.length === 0}
          emptyProps={{
            title: 'No Leave Types Found',
            text: 'Click "+ Add Custom Leave Type" to set up leave policies for your company.',
          }}
        >
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>Type Name</th>
                  <th>Code</th>
                  <th className="num">Annual Quota</th>
                  <th>Paid Status</th>
                  <th>Calendar Rules</th>
                  <th>Active</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {types.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.name}</strong>
                    </td>
                    <td>
                      <code>{t.code}</code>
                    </td>
                    <td className="num">
                      <strong>{t.days_allowed_per_year} d</strong>
                    </td>
                    <td>
                      <span className={`badge ${t.is_paid ? 'green' : 'neutral'}`}>
                        {t.is_paid ? 'Paid' : 'Unpaid (LOP)'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        {t.exclude_weekly_offs ? '✓ Excl. Sundays' : '• Continuous'} | {t.exclude_holidays ? '✓ Excl. Holidays' : '• Inc. Holidays'}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${t.is_active ? 'green' : 'red'}`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleStartEdit(t)}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DataState>
      </div>
    </Modal>
  );
}
