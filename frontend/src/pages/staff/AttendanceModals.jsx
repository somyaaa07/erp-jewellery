// frontend/src/pages/staff/AttendanceModals.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import {
  Modal,
  StatusBadge,
  TableWrap,
  DataState,
  Alert,
  errorMessage,
} from '../../components/ui';

export function formatTimeAMPM(timeStr) {
  if (!timeStr) return '—';
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hrs = h % 12 || 12;
  return `${hrs}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function getCurrentTimeHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* -------------------------------------------------------------------------
   1. Mark Attendance Modal (Single Employee)
------------------------------------------------------------------------- */
export function MarkAttendanceModal({
  open,
  onClose,
  date,
  employee, // Pre-selected row or null
  staffList = [],
  shifts = [],
  onSuccess,
}) {
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [status, setStatus] = useState('PRESENT');
  const [shiftId, setShiftId] = useState('');
  const [checkIn, setCheckIn] = useState('10:00');
  const [checkOut, setCheckOut] = useState('');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (employee) {
        setSelectedStaffId(String(employee.staff_id));
        setShiftId(employee.shift_id ? String(employee.shift_id) : '');
      } else {
        setSelectedStaffId('');
        setShiftId('');
      }
      setStatus('PRESENT');
      setCheckIn('10:00');
      setCheckOut('');
      setRemarks('');
    }
  }, [open, employee]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStaffId) {
      toast.error('Please select an employee');
      return;
    }
    if (status === 'PRESENT' && !checkIn) {
      toast.error('Actual check-in time is required for PRESENT status');
      return;
    }

    setSubmitting(true);
    try {
      const isPunchStatus = ['PRESENT', 'HALF_DAY'].includes(status);
      const payload = {
        staff_id: parseInt(selectedStaffId, 10),
        attendance_date: date,
        status,
        shift_id: shiftId ? parseInt(shiftId, 10) : undefined,
        actual_check_in: isPunchStatus ? (checkIn || undefined) : undefined,
        actual_check_out: isPunchStatus ? (checkOut || undefined) : undefined,
        remarks: remarks.trim() || undefined,
      };

      await api.post('/attendance', payload);
      toast.success('Attendance marked successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to mark attendance.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={employee ? `Mark Attendance: ${employee.name}` : 'Mark Employee Attendance'}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving...' : 'Save Attendance'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Employee *</label>
          {employee ? (
            <input
              type="text"
              value={`${employee.name} (${employee.employee_id || 'ID#' + employee.staff_id})`}
              disabled
            />
          ) : (
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              required
            >
              <option value="">Select Employee...</option>
              {staffList.map((s) => (
                <option key={s.staff_id} value={s.staff_id}>
                  {s.name} — {s.employee_id} ({s.department || 'General'})
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label>Attendance Date</label>
            <input type="date" value={date} disabled />
          </div>

          <div className="form-group">
            <label>Attendance Status *</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PRESENT">Present (Full Day)</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="ABSENT">Absent</option>
              <option value="WEEKLY_OFF">Weekly Off</option>
              <option value="HOLIDAY">Holiday</option>
              <option value="ON_LEAVE">On Leave</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Assigned Shift Schedule</label>
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">Default / Automatic Shift</option>
            {shifts.map((sh) => (
              <option key={sh.id} value={sh.id}>
                {sh.name} ({formatTimeAMPM(sh.start_time)} - {formatTimeAMPM(sh.end_time)})
              </option>
            ))}
          </select>
          <span className="field-hint">Scheduled timings are snapshotted onto the attendance record.</span>
        </div>

        {['PRESENT', 'HALF_DAY'].includes(status) && (
          <div className="form-grid-2">
            <div className="form-group">
              <label>Actual Check-in Time {status === 'PRESENT' && '*'}</label>
              <input
                type="time"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                required={status === 'PRESENT'}
              />
            </div>

            <div className="form-group">
              <label>Actual Check-out Time (Optional)</label>
              <input
                type="time"
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                placeholder="Can record in evening"
              />
              <span className="field-hint">Leave blank if currently working.</span>
            </div>
          </div>
        )}

        <div className="form-group">
          <label>Remarks / Notes</label>
          <textarea
            rows={2}
            placeholder="Add any remarks, approval notes, or delay reason..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------
   2. Check-Out Modal (Quick Evening Checkout on Existing Record)
------------------------------------------------------------------------- */
export function CheckOutModal({
  open,
  onClose,
  record, // Active attendance row
  onSuccess,
}) {
  const [checkOutTime, setCheckOutTime] = useState(getCurrentTimeHHMM());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setCheckOutTime(getCurrentTimeHHMM());
    }
  }, [open]);

  if (!record) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!checkOutTime) {
      toast.error('Check-out time is required');
      return;
    }

    setSubmitting(true);
    try {
      await api.patch(`/attendance/${record.attendance_id}/checkout`, {
        actual_check_out: checkOutTime,
      });
      toast.success(`Check-out recorded for ${record.name}.`);
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to record checkout.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Evening Check-out: ${record.name}`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Recording...' : 'Confirm Check-out'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div
          style={{
            background: 'var(--surface-2)',
            padding: 12,
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 13 }}>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Employee ID: </span>
              <strong>{record.employee_id}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Assigned Shift: </span>
              <strong>{record.shift_name || 'General Shift'}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Morning Check-in: </span>
              <strong style={{ color: 'var(--success)' }}>{formatTimeAMPM(record.actual_check_in)}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-muted)' }}>Scheduled Out: </span>
              <strong>{formatTimeAMPM(record.scheduled_check_out)}</strong>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Actual Check-out Time *</label>
          <input
            type="time"
            value={checkOutTime}
            onChange={(e) => setCheckOutTime(e.target.value)}
            required
            autoFocus
          />
          <span className="field-hint">Updates the existing daily record. Calculates working hours and early departure automatically.</span>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------
   3. Attendance Correction Modal (Audited)
------------------------------------------------------------------------- */
export function AttendanceCorrectionModal({
  open,
  onClose,
  record, // Attendance record being corrected
  shifts = [],
  onSuccess,
}) {
  const [status, setStatus] = useState('PRESENT');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && record) {
      setStatus(record.status || 'PRESENT');
      setCheckIn(record.actual_check_in ? record.actual_check_in.slice(0, 5) : '');
      setCheckOut(record.actual_check_out ? record.actual_check_out.slice(0, 5) : '');
      setShiftId(record.shift_id ? String(record.shift_id) : '');
      setRemarks(record.remarks || '');
      setCorrectionReason('');
    }
  }, [open, record]);

  if (!record) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!correctionReason.trim()) {
      toast.error('A correction reason is required for audit compliance');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        correction_reason: correctionReason.trim(),
        status,
        actual_check_in: checkIn || null,
        actual_check_out: checkOut || null,
        shift_id: shiftId ? parseInt(shiftId, 10) : undefined,
        remarks: remarks.trim() || null,
      };

      await api.patch(`/attendance/${record.attendance_id}/correction`, payload);
      toast.success('Attendance record corrected and audit logged successfully.');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save correction.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Correct Attendance Record: ${record.name}`}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Saving Correction...' : 'Save Correction'}
          </button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <Alert tone="warning" title="Audit Trail Required">
          All modifications are permanently recorded in system audit logs with previous values, new values, your user ID, and timestamp.
        </Alert>

        <div
          style={{
            margin: '14px 0',
            padding: 10,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            fontSize: 12.5,
          }}
        >
          <strong>Previously Recorded:</strong> Status: {record.status} | In: {formatTimeAMPM(record.actual_check_in)} | Out: {formatTimeAMPM(record.actual_check_out)} | Hours: {record.working_hours ?? '—'}
        </div>

        <div className="form-group">
          <label>Mandatory Correction Reason *</label>
          <textarea
            rows={2}
            placeholder="State why this attendance record is being changed (e.g. biometric machine offline, CCTV verified entry)..."
            value={correctionReason}
            onChange={(e) => setCorrectionReason(e.target.value)}
            required
            autoFocus
          />
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label>Corrected Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PRESENT">Present</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="ABSENT">Absent</option>
              <option value="WEEKLY_OFF">Weekly Off</option>
              <option value="HOLIDAY">Holiday</option>
              <option value="ON_LEAVE">On Leave</option>
            </select>
          </div>

          <div className="form-group">
            <label>Shift Schedule</label>
            <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">Keep Existing Shift ({record.shift_name})</option>
              {shifts.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid-2">
          <div className="form-group">
            <label>Corrected Check-in Time</label>
            <input
              type="time"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label>Corrected Check-out Time</label>
            <input
              type="time"
              value={checkOut}
              onChange={(e) => setCheckOut(e.target.value)}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Additional Remarks</label>
          <input
            type="text"
            placeholder="Optional additional notes..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------
   4. Bulk Attendance Modal
------------------------------------------------------------------------- */
export function BulkAttendanceModal({
  open,
  onClose,
  date,
  branchId,
  staffList = [],
  shifts = [],
  onSuccess,
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [status, setStatus] = useState('PRESENT');
  const [commonCheckIn, setCommonCheckIn] = useState('10:00');
  const [shiftId, setShiftId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Unmarked staff by default
  const unmarkedStaff = useMemo(() => {
    return staffList.filter((s) => s.status === 'NOT_MARKED');
  }, [staffList]);

  useEffect(() => {
    if (open) {
      // Default selection to unmarked staff
      setSelectedIds(unmarkedStaff.map((s) => s.staff_id));
      setStatus('PRESENT');
      setCommonCheckIn('10:00');
      setShiftId('');
    }
  }, [open, unmarkedStaff]);

  const handleToggleSelectAll = () => {
    if (selectedIds.length === staffList.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(staffList.map((s) => s.staff_id));
    }
  };

  const handleToggleStaff = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedIds.length === 0) {
      toast.error('Select at least one employee for bulk attendance');
      return;
    }

    setSubmitting(true);
    try {
      const records = selectedIds.map((id) => ({
        staff_id: id,
        status,
        shift_id: shiftId ? parseInt(shiftId, 10) : undefined,
        actual_check_in: ['PRESENT', 'HALF_DAY'].includes(status) ? commonCheckIn : undefined,
      }));

      const res = await api.post('/attendance/bulk', {
        date,
        branch_id: branchId ? parseInt(branchId, 10) : undefined,
        records,
      });

      const outcome = res.data?.data;
      const successCount = outcome?.success?.length || 0;
      const skippedCount = outcome?.skipped?.length || 0;
      const errorCount = outcome?.errors?.length || 0;

      if (successCount > 0) {
        toast.success(`Marked attendance for ${successCount} employee(s).`);
      }
      if (skippedCount > 0) {
        toast.info(`Skipped ${skippedCount} employee(s) who already had attendance records.`);
      }
      if (errorCount > 0) {
        toast.error(`${errorCount} records failed due to validation.`);
      }

      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to execute bulk attendance.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Branch Bulk Attendance Marking"
      onClose={onClose}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ alignSelf: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
            Selected: <strong>{selectedIds.length}</strong> of {staffList.length} staff
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={submitting || selectedIds.length === 0}
            >
              {submitting ? 'Marking Attendance...' : `Mark ${selectedIds.length} Staff ${status}`}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
            padding: 12,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            marginBottom: 16,
          }}
        >
          <div>
            <label>Work Date</label>
            <input type="date" value={date} disabled />
          </div>

          <div>
            <label>Bulk Status *</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="PRESENT">Mark Present</option>
              <option value="ABSENT">Mark Absent</option>
              <option value="HALF_DAY">Mark Half Day</option>
              <option value="WEEKLY_OFF">Mark Weekly Off</option>
              <option value="HOLIDAY">Mark Holiday</option>
            </select>
          </div>

          {['PRESENT', 'HALF_DAY'].includes(status) && (
            <div>
              <label>Common Check-in Time</label>
              <input
                type="time"
                value={commonCheckIn}
                onChange={(e) => setCommonCheckIn(e.target.value)}
              />
            </div>
          )}

          <div>
            <label>Assigned Shift Schedule</label>
            <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
              <option value="">Employee Default Shift</option>
              {shifts.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Staff Selection List */}
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ fontSize: 13 }}>Select Employees to Mark:</strong>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleToggleSelectAll}
          >
            {selectedIds.length === staffList.length ? 'Deselect All' : 'Select All Staff'}
          </button>
        </div>

        <div
          style={{
            maxHeight: 280,
            overflowY: 'auto',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        >
          <TableWrap>
            <table style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 40, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedIds.length === staffList.length && staffList.length > 0}
                      onChange={handleToggleSelectAll}
                    />
                  </th>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Branch</th>
                  <th>Current Status</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((s) => {
                  const isChecked = selectedIds.includes(s.staff_id);
                  return (
                    <tr
                      key={s.staff_id}
                      style={{
                        background: isChecked ? 'var(--primary-soft)' : undefined,
                        cursor: 'pointer',
                      }}
                      onClick={() => handleToggleStaff(s.staff_id)}
                    >
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleStaff(s.staff_id)}
                        />
                      </td>
                      <td>
                        <div className="cell-title">{s.name}</div>
                        <div className="cell-sub">{s.employee_id}</div>
                      </td>
                      <td>{s.department || '—'}</td>
                      <td>{s.branch_name || '—'}</td>
                      <td>
                        <StatusBadge value={s.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------
   5. Employee Attendance History Modal
------------------------------------------------------------------------- */
export function AttendanceHistoryModal({
  open,
  onClose,
  employee, // Staff member
}) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(
    () => new Date().toISOString().slice(0, 7)
  );

  const fetchHistory = async () => {
    if (!employee?.staff_id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(
        `/attendance/employee/${employee.staff_id}/history?month=${selectedMonth}`
      );
      setHistory(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load attendance history.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && employee) {
      fetchHistory();
    }
  }, [open, employee, selectedMonth]);

  if (!employee) return null;

  return (
    <Modal
      open={open}
      title={`Attendance History: ${employee.name} (${employee.employee_id || 'ID#' + employee.staff_id})`}
      onClose={onClose}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      }
    >
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
            padding: '10px 14px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: 13 }}>
            <span>Department: <strong>{employee.department}</strong></span>
            <span style={{ margin: '0 8px', color: 'var(--border-strong)' }}>|</span>
            <span>Branch: <strong>{employee.branch_name}</strong></span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ margin: 0, fontSize: 12 }}>Filter Month:</label>
            <input
              type="month"
              style={{ width: 'auto', padding: '4px 8px', fontSize: 13 }}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
        </div>

        <DataState
          loading={loading}
          error={error}
          empty={history.length === 0}
          emptyProps={{
            title: 'No attendance records logged for this month',
            text: `No daily check-ins recorded for ${employee.name} in ${selectedMonth}.`,
          }}
          onRetry={fetchHistory}
        >
          <TableWrap>
            <table style={{ fontSize: 13 }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift Schedule</th>
                  <th>Status</th>
                  <th>Check-in</th>
                  <th>Check-out</th>
                  <th className="num">Late</th>
                  <th className="num">Early Exit</th>
                  <th className="num">Working Hours</th>
                  <th>Remarks / Correction</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>
                      <strong>{h.attendance_date}</strong>
                    </td>
                    <td>{h.Shift?.name || h.shift_name || 'General Shift'}</td>
                    <td>
                      <StatusBadge value={h.status} />
                    </td>
                    <td>{formatTimeAMPM(h.actual_check_in)}</td>
                    <td>{formatTimeAMPM(h.actual_check_out)}</td>
                    <td className="num">
                      {h.late_minutes > 0 ? (
                        <span style={{ color: 'var(--danger)', fontWeight: 600 }}>
                          +{h.late_minutes}m
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num">
                      {h.early_departure_minutes > 0 ? (
                        <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}>
                          {h.early_departure_minutes}m
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="num">
                      {h.working_hours !== null ? (
                        <strong>{Number(h.working_hours).toFixed(1)}h</strong>
                      ) : (
                        <span className="badge yellow">Incomplete</span>
                      )}
                    </td>
                    <td>
                      {h.correction_reason ? (
                        <span title={`Corrected by: ${h.CorrectedBy?.name || 'Staff'}`}>
                          🛠️ {h.correction_reason}
                        </span>
                      ) : (
                        h.remarks || '—'
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
