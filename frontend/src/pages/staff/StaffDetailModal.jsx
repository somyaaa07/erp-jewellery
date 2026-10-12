// frontend/src/pages/staff/StaffDetailModal.jsx
import React from 'react';
import { Modal, StatusBadge, formatDate } from '../../components/ui';

export default function StaffDetailModal({ open, staff, onClose, onEdit, onTransfer, isAdmin }) {
  if (!staff) return null;

  const profile = staff.StaffProfile || {};
  const branchName = staff.Branch ? staff.Branch.name : 'All / Unassigned';
  const history = Array.isArray(profile.transfer_history) ? profile.transfer_history : [];

  return (
    <Modal
      open={open}
      size="lg"
      title={`Staff Profile — ${staff.name}`}
      onClose={onClose}
      footer={
        <>
          {isAdmin && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                onClose();
                onTransfer?.(staff);
              }}
            >
              Transfer Branch
            </button>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              onClose();
              onEdit?.(staff);
            }}
          >
            Edit Staff
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div className="avatar" style={{ width: 48, height: 48, fontSize: 18 }}>
          {staff.name
            .split(' ')
            .map((n) => n[0])
            .slice(0, 2)
            .join('')
            .toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{staff.name}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {profile.employee_id || `ID: #${staff.id}`} &bull; {profile.designation || staff.role}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <StatusBadge value={profile.status || (staff.is_active ? 'ACTIVE' : 'INACTIVE')} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Employment Information</h3>
        </div>
        <div className="card-body">
          <div className="detail-grid">
            <div className="detail-item">
              <div className="k">Employee ID</div>
              <div className="v mono">{profile.employee_id || '—'}</div>
            </div>
            <div className="detail-item">
              <div className="k">Role</div>
              <div className="v"><span className="badge blue">{staff.role}</span></div>
            </div>
            <div className="detail-item">
              <div className="k">Designation</div>
              <div className="v">{profile.designation || '—'}</div>
            </div>
            <div className="detail-item">
              <div className="k">Department</div>
              <div className="v">{profile.department || '—'}</div>
            </div>
            <div className="detail-item">
              <div className="k">Assigned Branch</div>
              <div className="v strong" style={{ color: 'var(--primary)' }}>{branchName}</div>
            </div>
            <div className="detail-item">
              <div className="k">Joining Date</div>
              <div className="v">{profile.joining_date ? formatDate(profile.joining_date) : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <h3>Contact &amp; Account Details</h3>
        </div>
        <div className="card-body">
          <div className="detail-grid">
            <div className="detail-item">
              <div className="k">Official Email / Username</div>
              <div className="v mono">{staff.email}</div>
            </div>
            <div className="detail-item">
              <div className="k">Phone / Mobile</div>
              <div className="v mono">{profile.phone || '—'}</div>
            </div>
            <div className="detail-item" style={{ gridColumn: 'span 2' }}>
              <div className="k">Residential / Mailing Address</div>
              <div className="v">{profile.address || '—'}</div>
            </div>
            <div className="detail-item">
              <div className="k">Account Created</div>
              <div className="v">{formatDate(staff.createdAt)}</div>
            </div>
            <div className="detail-item">
              <div className="k">Login Status</div>
              <div className="v">{staff.is_active ? 'Enabled' : 'Disabled'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Branch Transfer History</h3>
        </div>
        <div className="card-body tight">
          {history.length === 0 ? (
            <div style={{ padding: '16px', fontSize: 13, color: 'var(--text-muted)' }}>
              No branch transfer history recorded for this staff member.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Effective</th>
                  <th>From Branch</th>
                  <th>To Branch</th>
                  <th>Reason</th>
                  <th>Transferred By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, idx) => (
                  <tr key={idx}>
                    <td>{formatDate(h.date)}</td>
                    <td>{formatDate(h.effective_date)}</td>
                    <td>{h.from_branch_name || 'Unassigned'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{h.to_branch_name}</td>
                    <td>{h.reason || '—'}</td>
                    <td>{h.transferred_by_name || 'Admin'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Modal>
  );
}
