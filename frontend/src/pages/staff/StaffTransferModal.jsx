// frontend/src/pages/staff/StaffTransferModal.jsx
import React, { useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { Modal, errorMessage } from '../../components/ui';

export default function StaffTransferModal({ open, staff, branches, onClose, onTransferred }) {
  const [toBranchId, setToBranchId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('Routine branch rotation');
  const [submitting, setSubmitting] = useState(false);

  if (!staff) return null;

  const currentBranchName = staff.Branch ? staff.Branch.name : 'Unassigned';
  const availableBranches = (branches || []).filter((b) => b.id !== staff.branch_id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!toBranchId) {
      toast.error('Please select a destination branch');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.patch(`/staff/${staff.id}/branch`, {
        to_branch_id: parseInt(toBranchId, 10),
        effective_date: effectiveDate,
        reason: reason.trim(),
      });
      toast.success(res.data.message || 'Staff transferred successfully');
      onTransferred?.();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to transfer staff'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Transfer Branch — ${staff.name}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Transferring…' : 'Confirm Transfer'}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label>Staff Member</label>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{staff.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {staff.StaffProfile?.employee_id || `ID: #${staff.id}`} &bull; {staff.role}
            </div>
          </div>
          <div>
            <label>Current Branch</label>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary)' }}>
              {currentBranchName}
            </div>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="to_branch_id">Destination Branch *</label>
          <select
            id="to_branch_id"
            value={toBranchId}
            onChange={(e) => setToBranchId(e.target.value)}
            required
          >
            <option value="">Select branch…</option>
            {availableBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} {b.address ? `(${b.address})` : ''}
              </option>
            ))}
          </select>
          {availableBranches.length === 0 && (
            <p className="field-hint" style={{ color: 'var(--danger)' }}>
              No other branches found for this tenant to transfer into.
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="effective_date">Effective Transfer Date</label>
          <input
            id="effective_date"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="transfer_reason">Reason for Transfer</label>
          <textarea
            id="transfer_reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Branch workload balancing, Karigar deployment, Staff relocation"
          />
        </div>
      </form>
    </Modal>
  );
}
