// frontend/src/pages/staff/StaffRolesPermissions.jsx
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Card, Stat, Loading } from '../../components/ui';

const ROLE_DEFINITIONS = [
  {
    role: 'ADMIN',
    title: 'Store Administrator',
    badgeClass: 'badge badge-primary',
    scope: 'All Branches (Tenant-wide)',
    description:
      'Complete operational control across all branches within the store organization. Can register staff, manage branches, configure metal rates and pricing rules, and supervise inventory and financials.',
    capabilities: [
      { module: 'Staff Management', access: 'Full', desc: 'Create, edit, deactivate staff; transfer staff across branches; view sensitive data' },
      { module: 'Role Assignment', access: 'Full', desc: 'Assign Manager, Salesman, or Karigar In-charge roles to staff' },
      { module: 'Inventory & Stock', access: 'Full', desc: 'Manage stock, designs, categories, transfers, and warehouse containers' },
      { module: 'POS & Billing', access: 'Full', desc: 'Issue bills, approve discounts, manage customers and invoices' },
      { module: 'Attendance & Leaves', access: 'Full', desc: 'Configure shifts, view reports, manage leave policies and approvals' },
      { module: 'Purchases & Suppliers', access: 'Full', desc: 'Manage suppliers, raw gold purchases, and ledgers' },
      { module: 'Reports & Auditing', access: 'Full', desc: 'Comprehensive financial, stock, and staff audit reports' },
    ],
  },
  {
    role: 'MANAGER',
    title: 'Branch Manager',
    badgeClass: 'badge badge-info',
    scope: 'Branch-Restricted',
    description:
      'Day-to-day managerial supervision restricted to the assigned branch. Can register branch staff, monitor attendance, process sales, and track branch stock.',
    capabilities: [
      { module: 'Staff Management', access: 'Branch Scoped', desc: 'Create and edit staff for own branch only; cannot view sensitive personal fields' },
      { module: 'Role Assignment', access: 'Restricted', desc: 'Can assign Salesman or Karigar In-charge roles; cannot assign Admin' },
      { module: 'Inventory & Stock', access: 'Branch Scoped', desc: 'View and update stock, initiate branch transfers' },
      { module: 'POS & Billing', access: 'Full', desc: 'Issue bills, view invoices, manage customer relationships' },
      { module: 'Attendance & Leaves', access: 'Branch Scoped', desc: 'Mark and edit attendance for branch staff, review leave requests' },
      { module: 'Purchases & Workshop', access: 'View / Edit', desc: 'Manage supplier purchases and manufacturing orders' },
      { module: 'Sensitive Data', access: 'No Access', desc: 'Emergency contacts, DOB, and cost margin profit data are masked' },
    ],
  },
  {
    role: 'SALESMAN',
    title: 'Sales Executive / Counter',
    badgeClass: 'badge badge-success',
    scope: 'Branch Counter',
    description:
      'Front-counter sales personnel dedicated to walk-in customer servicing, item inquiry, and billing operations.',
    capabilities: [
      { module: 'POS & Billing', access: 'Allowed', desc: 'Create sales bills, print invoices, register customer details' },
      { module: 'Inventory Stock', access: 'View Only', desc: 'Search and inspect stock items, piece weights, and display trays' },
      { module: 'Attendance', access: 'Self Only', desc: 'View own attendance history and punch records' },
      { module: 'Staff Directory', access: 'No Access', desc: 'Cannot view or modify staff directory records' },
      { module: 'Purchasing & Margins', access: 'No Access', desc: 'Cannot view purchase rates or profit margins' },
    ],
  },
  {
    role: 'KARIGAR_INCHARGE',
    title: 'Karigar In-charge / Workshop',
    badgeClass: 'badge badge-warning',
    scope: 'Workshop / Manufacturing',
    description:
      'Workshop supervisor managing jewellery crafting, repair orders, and raw material accountability.',
    capabilities: [
      { module: 'Manufacturing Orders', access: 'Allowed', desc: 'Create and update jewellery crafting work orders' },
      { module: 'Repair Orders', access: 'Allowed', desc: 'Log customer repair jobs and track workshop progress' },
      { module: 'Inventory Stock', access: 'View Only', desc: 'View materials, purities, and workshop stock' },
      { module: 'Attendance', access: 'Self Only', desc: 'View own attendance punch records' },
      { module: 'Sales & Billing', access: 'No Access', desc: 'No access to POS billing or customer sales invoices' },
    ],
  },
];

export default function StaffRolesPermissions() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const [roleCounts, setRoleCounts] = useState({
    ADMIN: 0,
    MANAGER: 0,
    SALESMAN: 0,
    KARIGAR_INCHARGE: 0,
    NO_LOGIN: 0,
    total: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/staff')
      .then((res) => {
        if (!alive) return;
        const list = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        const counts = { ADMIN: 0, MANAGER: 0, SALESMAN: 0, KARIGAR_INCHARGE: 0, NO_LOGIN: 0, total: list.length };
        list.forEach((s) => {
          if (!s.user_id && !s.User) {
            counts.NO_LOGIN += 1;
          } else {
            const r = s.User?.role || 'SALESMAN';
            if (counts[r] !== undefined) counts[r] += 1;
          }
        });
        setRoleCounts(counts);
      })
      .catch((err) => console.warn('Could not load staff counts:', err.message))
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, []);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto' }}>
      <PageHeader
        title="Roles & Access Control"
        subtitle="Active Role-Based Access Control (RBAC) architecture, permissions matrix, and organizational scopes."
        actions={
          <div style={{ display: 'flex', gap: 10 }}>
            <Link to="/admin/staff/directory" className="btn btn-secondary">
              Staff Directory
            </Link>
            {isAdmin && (
              <Link to="/admin/staff/add" className="btn btn-primary">
                + Add Staff Member
              </Link>
            )}
          </div>
        }
      />

      {/* Summary KPI row */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <Stat label="Total Staff" value={roleCounts.total} note="Registered in organization" />
        <Stat label="Administrators" value={roleCounts.ADMIN} note="Full tenant management" />
        <Stat label="Branch Managers" value={roleCounts.MANAGER} note="Branch operational control" />
        <Stat label="Sales & Workshop" value={roleCounts.SALESMAN + roleCounts.KARIGAR_INCHARGE} note="POS counter & workshop" />
      </div>

      {/* Security Architecture Notice */}
      <Card
        title="Security & Authorization Enforcement"
        note="Server-Side Cryptographic RBAC"
        style={{ marginBottom: 24 }}
      >
        <p style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--text-muted)' }}>
          All user privileges in the Jewellery ERP are governed by the principle of least privilege.
          Permissions are cryptographically encoded into authentication JWT tokens and verified at the API boundary
          by <code>auth</code>, <code>tenantScope</code>, and <code>rbac</code> middleware.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, marginTop: 12 }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-subtle, #f8f9fa)', borderRadius: 6, flex: '1 1 220px' }}>
            <strong>Tenant Isolation:</strong> Users are strictly partitioned by tenant ID across all SQL queries.
          </div>
          <div style={{ padding: '8px 12px', background: 'var(--bg-subtle, #f8f9fa)', borderRadius: 6, flex: '1 1 220px' }}>
            <strong>Branch Isolation:</strong> Managers and floor staff can only view and mutate data in their branch.
          </div>
          <div style={{ padding: '8px 12px', background: 'var(--bg-subtle, #f8f9fa)', borderRadius: 6, flex: '1 1 220px' }}>
            <strong>Data Masking:</strong> Sensitive fields like profit margins and emergency contacts are stripped server-side.
          </div>
        </div>
      </Card>

      {/* Role Cards & Capabilities */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {ROLE_DEFINITIONS.map((def) => (
          <Card
            key={def.role}
            title={
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>{def.title}</span>
                <span className={def.badgeClass} style={{ fontSize: 11, padding: '2px 8px' }}>
                  {def.role}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 'normal' }}>
                  • {def.scope}
                </span>
              </div>
            }
            note={`${roleCounts[def.role] || 0} active user accounts in this role`}
          >
            <p style={{ margin: '0 0 16px 0', fontSize: 14 }}>{def.description}</p>

            <table className="table" style={{ fontSize: 13, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>System Module</th>
                  <th style={{ width: '18%' }}>Access Level</th>
                  <th>Permission Scope & Details</th>
                </tr>
              </thead>
              <tbody>
                {def.capabilities.map((c) => (
                  <tr key={c.module}>
                    <td><strong>{c.module}</strong></td>
                    <td>
                      <span
                        className={
                          c.access === 'Full' || c.access === 'Allowed'
                            ? 'badge badge-success'
                            : c.access === 'No Access'
                            ? 'badge badge-danger'
                            : 'badge badge-info'
                        }
                        style={{ fontSize: 11 }}
                      >
                        {c.access}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}

        {/* Staff without ERP Login */}
        <Card
          title="Staff Without ERP Login"
          note={`${roleCounts.NO_LOGIN} registered profiles`}
        >
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-muted)' }}>
            Staff members added without checking "Create ERP Login" have <code>user_id = null</code>.
            They have no system credentials and cannot log in to the ERP. Their employment records, branch attendance,
            and assignments are preserved and can be linked to an ERP login account at any time by editing their profile.
          </p>
        </Card>
      </div>
    </div>
  );
}
