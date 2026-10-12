// frontend/src/pages/staff/StaffDashboard.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
  PageHeader,
  Card,
  Stat,
  TableWrap,
  StatusBadge,
  DataState,
  formatDate,
  titleCase,
  errorMessage,
} from '../../components/ui';

export default function StaffDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';

  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboardData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/staff?limit=10&sortBy=created_at&sortOrder=DESC');
      const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
      setStaffList(list);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load staff overview.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Compute metrics
  const stats = React.useMemo(() => {
    let total = staffList.length;
    let active = 0;
    let onLeave = 0;
    let inactive = 0;
    let loginAccounts = 0;

    staffList.forEach((s) => {
      if (s.status === 'ACTIVE') active++;
      else if (s.status === 'ON_LEAVE') onLeave++;
      else if (s.status === 'INACTIVE' || s.status === 'SUSPENDED') inactive++;
      if (s.user_id || s.User) loginAccounts++;
    });

    return { total, active, onLeave, inactive, loginAccounts };
  }, [staffList]);

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle="Manage human resources, staff directory, branch deployments, and system login credentials."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/admin/staff/directory" className="btn btn-secondary">
              Staff Directory
            </Link>
            <Link to="/admin/staff/add" className="btn btn-primary">
              + Add Staff
            </Link>
          </div>
        }
      />

      {/* KPI Overview */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <Stat label="Total Registered Staff" value={stats.total} note="Active organization directory" />
        <Stat label="Active on Duty" value={stats.active} note="Currently active status" />
        <Stat label="On Leave" value={stats.onLeave} note="Temporary leave" />
        <Stat label="ERP Logins" value={stats.loginAccounts} note="Staff with software access" />
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid-3" style={{ marginBottom: 24 }}>
        <Card title="Staff Directory" note="Directory & profiles">
          <p className="subtle" style={{ fontSize: 13, marginBottom: 14 }}>
            Browse, search, and filter all company employees across branches and departments.
          </p>
          <Link to="/admin/staff/directory" className="btn btn-secondary btn-sm">
            Open Directory →
          </Link>
        </Card>

        <Card title="Add Employee" note="Registration workflow">
          <p className="subtle" style={{ fontSize: 13, marginBottom: 14 }}>
            Onboard new employees with personal details, branch assignments, and optional ERP credentials.
          </p>
          <Link to="/admin/staff/add" className="btn btn-secondary btn-sm">
            Register Staff →
          </Link>
        </Card>

        <Card title="Branch Deployment" note="Store allocations">
          <p className="subtle" style={{ fontSize: 13, marginBottom: 14 }}>
            {isManager
              ? `You are managing staffing for your branch.`
              : 'Allocate staff to specific retail showrooms, wholesale storage, and workshop locations.'}
          </p>
          <Link to="/admin/staff/directory" className="btn btn-secondary btn-sm">
            View Branch Staff →
          </Link>
        </Card>
      </div>

      {/* Recent Staff Members Table */}
      <Card
        title="Recently Added Staff"
        note="Latest additions to your organization"
        actions={
          <Link to="/admin/staff/directory" style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>
            View All Staff →
          </Link>
        }
        bodyClass="tight"
      >
        <DataState
          loading={loading}
          error={error}
          onRetry={loadDashboardData}
          empty={staffList.length === 0}
          emptyProps={{
            title: 'No staff registered yet',
            text: 'Register your first employee to start building your organizational directory.',
            action: (
              <Link to="/admin/staff/add" className="btn btn-primary">
                + Add First Staff Member
              </Link>
            ),
          }}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Employee ID</th>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Branch</th>
                  <th>Joining Date</th>
                  <th>Login Access</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffList.map((item) => {
                  const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || item.User?.name || 'Staff Member';
                  const hasLogin = Boolean(item.user_id || item.User);

                  return (
                    <tr key={item.id}>
                      <td>
                        <Link
                          to={`/admin/staff/${item.id}`}
                          style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}
                        >
                          {item.employee_id || `EMP-${item.id}`}
                        </Link>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--heading)' }}>
                          <Link to={`/admin/staff/${item.id}`} style={{ color: 'inherit' }}>
                            {fullName}
                          </Link>
                        </div>
                        <div className="subtle" style={{ fontSize: 11.5 }}>
                          {item.email || item.User?.email || 'No email'}
                        </div>
                      </td>
                      <td>{item.department || '—'}</td>
                      <td>{item.designation || '—'}</td>
                      <td>{item.Branch?.name || 'Unassigned'}</td>
                      <td>{formatDate(item.joining_date)}</td>
                      <td>
                        {hasLogin ? (
                          <span className="badge blue">
                            {titleCase(item.User?.role || 'User')}
                          </span>
                        ) : (
                          <span className="badge neutral">No Login</span>
                        )}
                      </td>
                      <td>
                        <StatusBadge value={item.status} />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Link to={`/admin/staff/${item.id}`} className="btn btn-secondary btn-sm">
                          Profile
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </DataState>
      </Card>
    </div>
  );
}
