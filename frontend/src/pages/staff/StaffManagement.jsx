// frontend/src/pages/staff/StaffManagement.jsx
import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import useFetch from '../../hooks/useFetch';
import {
  PageHeader,
  Card,
  Stat,
  TableWrap,
  StatusBadge,
  DataState,
  formatDate,
  titleCase,
} from '../../components/ui';

import StaffModal from './StaffModal';
import StaffDetailModal from './StaffDetailModal';
import StaffTransferModal from './StaffTransferModal';

export default function StaffManagement() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';

  // Filters state
  const [search, setSearch] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(isManager ? String(user?.branch_id || '') : '');
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [viewingStaff, setViewingStaff] = useState(null);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferringStaff, setTransferringStaff] = useState(null);

  // Load branches
  const { data: branchesData } = useFetch('/branches', { initialData: [] });
  const branches = Array.isArray(branchesData) ? branchesData : [];

  // Build query string for staff
  const staffQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (isAdmin && selectedBranch) params.append('branch_id', selectedBranch);
    if (selectedRole) params.append('role', selectedRole);
    if (selectedStatus) params.append('status', selectedStatus);
    if (search.trim()) params.append('search', search.trim());
    const qs = params.toString();
    return qs ? `/staff?${qs}` : '/staff';
  }, [isAdmin, selectedBranch, selectedRole, selectedStatus, search]);

  // Load staff list & stats
  const { data: staffList, loading, error, reload: reloadStaff } = useFetch(staffQuery, {
    initialData: [],
    deps: [staffQuery],
  });

  const staff = Array.isArray(staffList) ? staffList : [];

  // Metrics calculation
  const stats = useMemo(() => {
    let total = staff.length;
    let active = 0;
    let inactive = 0;
    let onLeave = 0;

    staff.forEach((s) => {
      const st = s.StaffProfile?.status || (s.is_active ? 'ACTIVE' : 'INACTIVE');
      if (st === 'ACTIVE') active++;
      else if (st === 'INACTIVE' || st === 'SUSPENDED') inactive++;
      else if (st === 'ON_LEAVE') onLeave++;
    });

    return { total, active, inactive, onLeave };
  }, [staff]);

  // Handle Quick Status Toggle
  const handleToggleStatus = async (item) => {
    const currentStatus = item.StaffProfile?.status || (item.is_active ? 'ACTIVE' : 'INACTIVE');
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const actionLabel = newStatus === 'ACTIVE' ? 'activate' : 'deactivate';

    if (!window.confirm(`Are you sure you want to ${actionLabel} ${item.name}?`)) {
      return;
    }

    try {
      await api.patch(`/staff/${item.id}/status`, { status: newStatus });
      toast.success(`${item.name} is now ${titleCase(newStatus)}`);
      reloadStaff();
    } catch (err) {
      toast.error('Failed to change status');
    }
  };

  const handleOpenAdd = () => {
    setEditingStaff(null);
    setFormModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingStaff(item);
    setFormModalOpen(true);
  };

  const handleOpenView = (item) => {
    setViewingStaff(item);
    setDetailModalOpen(true);
  };

  const handleOpenTransfer = (item) => {
    setTransferringStaff(item);
    setTransferModalOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle={
          isManager
            ? `Manage staff members assigned to your branch (${branches.find((b) => b.id === user?.branch_id)?.name || 'Local Branch'})`
            : "Manage your organization's staff profiles, roles, employment details and branch assignments"
        }
        actions={
          <button type="button" className="btn" onClick={handleOpenAdd}>
            + Add Staff
          </button>
        }
      />

      {/* Metric Cards */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <Stat label="Total Staff" value={stats.total} />
        <Stat label="Active Staff" value={stats.active} note="Currently working" />
        <Stat label="Inactive Staff" value={stats.inactive} note="Disabled or suspended" />
        <Stat label="On Leave" value={stats.onLeave} note="Temporary absence" />
      </div>

      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          marginBottom: 18,
          padding: '14px 16px',
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ flex: '1 1 240px', minWidth: 200 }}>
          <input
            type="text"
            placeholder="Search Staff by name, email, employee ID, designation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {isAdmin && (
          <div style={{ minWidth: 170 }}>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ minWidth: 150 }}>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
          >
            <option value="">All Roles</option>
            <option value="SALESMAN">Salesman</option>
            <option value="MANAGER">Manager</option>
            <option value="KARIGAR_INCHARGE">Karigar In-charge</option>
            {isAdmin && <option value="ADMIN">Administrator</option>}
          </select>
        </div>

        <div style={{ minWidth: 140 }}>
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_LEAVE">On Leave</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </div>

        {(search || selectedBranch || selectedRole || selectedStatus) && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSearch('');
              if (isAdmin) setSelectedBranch('');
              setSelectedRole('');
              setSelectedStatus('');
            }}
          >
            Reset Filters
          </button>
        )}
      </div>

      {/* Staff Table */}
      <Card bodyClass="tight">
        <DataState
          loading={loading}
          error={error}
          empty={staff.length === 0}
          emptyProps={{
            title: 'No staff members found',
            text:
              search || selectedRole || selectedStatus || selectedBranch
                ? 'Try adjusting your filters or search terms.'
                : 'Get started by adding your first staff member.',
            action: (
              <button type="button" className="btn" onClick={handleOpenAdd}>
                + Add Staff
              </button>
            ),
          }}
          onRetry={reloadStaff}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Mobile</th>
                  <th>Branch</th>
                  <th>Role</th>
                  <th>Designation</th>
                  <th>Joining Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((item) => {
                  const p = item.StaffProfile || {};
                  const statusVal = p.status || (item.is_active ? 'ACTIVE' : 'INACTIVE');
                  const branchName = item.Branch ? item.Branch.name : 'Unassigned';

                  return (
                    <tr key={item.id}>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {p.employee_id || `ID #${item.id}`}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--heading)' }}>{item.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{item.email}</div>
                      </td>
                      <td className="mono">{p.phone || '—'}</td>
                      <td>
                        <span style={{ fontWeight: 500, color: 'var(--primary)' }}>{branchName}</span>
                      </td>
                      <td>
                        <span className="badge blue">{item.role}</span>
                      </td>
                      <td>{p.designation || '—'}</td>
                      <td>{p.joining_date ? formatDate(p.joining_date) : '—'}</td>
                      <td>
                        <StatusBadge value={statusVal} />
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            title="View Full Profile"
                            onClick={() => handleOpenView(item)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            title="Edit Details"
                            onClick={() => handleOpenEdit(item)}
                          >
                            Edit
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              title="Transfer Branch"
                              onClick={() => handleOpenTransfer(item)}
                            >
                              Transfer
                            </button>
                          )}
                          <button
                            type="button"
                            className={`btn btn-sm ${statusVal === 'ACTIVE' ? 'btn-secondary' : 'btn-success'}`}
                            onClick={() => handleToggleStatus(item)}
                          >
                            {statusVal === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </DataState>
      </Card>

      {/* Add / Edit Modal */}
      <StaffModal
        open={formModalOpen}
        staff={editingStaff}
        branches={branches}
        isManager={isManager}
        managerBranchId={user?.branch_id}
        onClose={() => {
          setFormModalOpen(false);
          setEditingStaff(null);
        }}
        onSaved={reloadStaff}
      />

      {/* View Detail Modal */}
      <StaffDetailModal
        open={detailModalOpen}
        staff={viewingStaff}
        isAdmin={isAdmin}
        onClose={() => {
          setDetailModalOpen(false);
          setViewingStaff(null);
        }}
        onEdit={handleOpenEdit}
        onTransfer={handleOpenTransfer}
      />

      {/* Transfer Branch Modal */}
      <StaffTransferModal
        open={transferModalOpen}
        staff={transferringStaff}
        branches={branches}
        onClose={() => {
          setTransferModalOpen(false);
          setTransferringStaff(null);
        }}
        onTransferred={reloadStaff}
      />
    </div>
  );
}
