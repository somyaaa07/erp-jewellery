// frontend/src/pages/staff/ShiftManagementModal.jsx
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import {
  Modal,
  TableWrap,
  StatusBadge,
  DataState,
  errorMessage,
} from '../../components/ui';

function formatTime(timeStr) {
  if (!timeStr) return '—';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hrs = h % 12 || 12;
  return `${hrs}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function ShiftManagementModal({
  open,
  onClose,
  branches = [],
  isManager = false,
  managerBranchId = null,
  onShiftsUpdated,
}) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingShift, setEditingShift] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const onShiftsUpdatedRef = useRef(onShiftsUpdated);
  useEffect(() => {
    onShiftsUpdatedRef.current = onShiftsUpdated;
  }, [onShiftsUpdated]);

  const getInitialFormState = useCallback(() => ({
    name: '',
    start_time: '10:00',
    end_time: '19:00',
    grace_period_minutes: 15,
    half_day_threshold_hours: 4.0,
    is_overnight: false,
    branch_id: isManager && managerBranchId ? String(managerBranchId) : '',
    is_active: true,
  }), [isManager, managerBranchId]);

  const [form, setForm] = useState(getInitialFormState);

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/shifts');
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setShifts(list);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load shifts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchShifts();
      setShowForm(false);
      setEditingShift(null);
      setForm(getInitialFormState());
    }
  }, [open, fetchShifts, getInitialFormState]);

  const handleEditClick = (shift) => {
    setEditingShift(shift);
    setForm({
      name: shift.name || '',
      start_time: shift.start_time ? shift.start_time.slice(0, 5) : '10:00',
      end_time: shift.end_time ? shift.end_time.slice(0, 5) : '19:00',
      grace_period_minutes: shift.grace_period_minutes ?? 15,
      half_day_threshold_hours: shift.half_day_threshold_hours ?? 4.0,
      is_overnight: Boolean(shift.is_overnight),
      branch_id: shift.branch_id ? String(shift.branch_id) : '',
      is_active: Boolean(shift.is_active),
    });
    setShowForm(true);
  };

  const handleNewClick = () => {
    setEditingShift(null);
    setForm(getInitialFormState());
    setShowForm(true);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setEditingShift(null);
    setForm(getInitialFormState());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Shift name is required');
      return;
    }
    if (!form.start_time || !form.end_time) {
      toast.error('Start time and end time are required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        start_time: form.start_time.length === 5 ? `${form.start_time}:00` : form.start_time,
        end_time: form.end_time.length === 5 ? `${form.end_time}:00` : form.end_time,
        grace_period_minutes: parseInt(form.grace_period_minutes, 10) || 0,
        half_day_threshold_hours: parseFloat(form.half_day_threshold_hours) || 4.0,
        is_overnight: Boolean(form.is_overnight),
        branch_id: form.branch_id ? parseInt(form.branch_id, 10) : null,
        is_active: Boolean(form.is_active),
      };

      if (editingShift) {
        await api.put(`/shifts/${editingShift.id}`, payload);
        toast.success(`Shift '${payload.name}' updated successfully.`);
      } else {
        await api.post('/shifts', payload);
        toast.success(`Shift '${payload.name}' created successfully.`);
      }

      handleCancelForm();
      await fetchShifts();
      onShiftsUpdatedRef.current?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save shift.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (shift) => {
    try {
      const nextStatus = !shift.is_active;
      await api.patch(`/shifts/${shift.id}/status`, { is_active: nextStatus });
      toast.success(`Shift '${shift.name}' is now ${nextStatus ? 'Active' : 'Inactive'}.`);
      await fetchShifts();
      onShiftsUpdatedRef.current?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to update shift status.'));
    }
  };

  return (
    <Modal
      open={open}
      title="Configurable Shift Management"
      onClose={onClose}
      size="lg"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
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
            paddingBottom: 12,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <h4 style={{ margin: 0, color: 'var(--heading)' }}>Working Schedules & Shifts</h4>
            <p style={{ margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-muted)' }}>
              Configure scheduled timings, grace periods for late arrivals, half-day thresholds, and overnight shifts.
            </p>
          </div>
          {!showForm && !isManager && (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleNewClick}>
              + Add New Shift
            </button>
          )}
        </div>

        {/* Shift Edit / Create Form */}
        {showForm && (
          <form
            onSubmit={handleSubmit}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              padding: 16,
              marginBottom: 20,
            }}
          >
            <h4 style={{ marginBottom: 12, color: 'var(--primary)' }}>
              {editingShift ? `Edit Shift: ${editingShift.name}` : 'Create New Working Shift'}
            </h4>

            <div className="form-grid">
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Shift Name *</label>
                <input
                  type="text"
                  placeholder="e.g. General Store Shift, Morning Counter Shift"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Start Time (Scheduled In) *</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>End Time (Scheduled Out) *</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label>Grace Period (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  max="120"
                  value={form.grace_period_minutes}
                  onChange={(e) => setForm({ ...form, grace_period_minutes: e.target.value })}
                  title="Employees checking in within this period will not be marked as late"
                />
                <span className="field-hint">e.g. 15 mins allowed before late arrival</span>
              </div>

              <div className="form-group">
                <label>Half-Day Threshold (Hours)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="12"
                  value={form.half_day_threshold_hours}
                  onChange={(e) => setForm({ ...form, half_day_threshold_hours: e.target.value })}
                />
                <span className="field-hint">Minimum hours required for full day</span>
              </div>

              <div className="form-group">
                <label>Branch Applicability</label>
                <select
                  value={form.branch_id}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                  disabled={isManager}
                >
                  <option value="">All Branches (Tenant-wide)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={form.is_overnight}
                    onChange={(e) => setForm({ ...form, is_overnight: e.target.checked })}
                  />
                  <span>Overnight Shift (Crosses Midnight)</span>
                </label>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  />
                  <span>Active Schedule</span>
                </label>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: 14 }}>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : editingShift ? 'Update Shift' : 'Create Shift'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelForm}
                disabled={submitting}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Existing Shifts Table */}
        <DataState
          loading={loading}
          error={error}
          empty={shifts.length === 0}
          emptyProps={{
            title: 'No shift schedules configured yet',
            text: 'Create a shift schedule with start and end times to enable attendance tracking.',
            action: !isManager && (
              <button type="button" className="btn btn-primary btn-sm" onClick={handleNewClick}>
                + Create First Shift
              </button>
            ),
          }}
          onRetry={fetchShifts}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Shift Name</th>
                  <th>Timings</th>
                  <th>Grace</th>
                  <th>Threshold</th>
                  <th>Overnight</th>
                  <th>Applicability</th>
                  <th>Status</th>
                  {!isManager && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-title">{s.name}</div>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{formatTime(s.start_time)}</span>
                      <span style={{ color: 'var(--text-muted)', margin: '0 4px' }}>→</span>
                      <span style={{ fontWeight: 600 }}>{formatTime(s.end_time)}</span>
                    </td>
                    <td>{s.grace_period_minutes}m</td>
                    <td>{s.half_day_threshold_hours}h</td>
                    <td>
                      {s.is_overnight ? (
                        <span className="badge blue">Yes (Overnight)</span>
                      ) : (
                        <span className="badge neutral">Same Day</span>
                      )}
                    </td>
                    <td>{s.Branch ? s.Branch.name : 'All Branches'}</td>
                    <td>
                      <StatusBadge
                        value={s.is_active ? 'ACTIVE' : 'INACTIVE'}
                        tone={s.is_active ? 'green' : 'neutral'}
                      />
                    </td>
                    {!isManager && (
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleEditClick(s)}
                            title="Edit shift properties"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={`btn btn-sm ${s.is_active ? 'btn-ghost' : 'btn-secondary'}`}
                            onClick={() => handleToggleStatus(s)}
                            title={s.is_active ? 'Deactivate shift' : 'Activate shift'}
                          >
                            {s.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    )}
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
