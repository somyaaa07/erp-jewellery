// frontend/src/pages/staff/StaffPlaceholder.jsx
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { PageHeader, Card, Alert } from '../../components/ui';

const MODULE_INFO = {
  '/admin/staff/attendance': {
    title: 'Attendance Tracking',
    subtitle: 'Shift logging, biometric integrations, and daily staff attendance.',
    phase: 'Phase 4',
    description:
      'The Attendance module is scheduled for implementation in Phase 4. It will support daily clock-in/out, biometric device sync, shift management, and monthly attendance reports.',
  },
  '/admin/staff/leaves': {
    title: 'Leave Management',
    subtitle: 'Staff leave applications, balance tracking, and approval workflows.',
    phase: 'Phase 4',
    description:
      'The Leave Management module is scheduled for Phase 4. It will provide employee leave requests, manager approvals, holiday calendars, and automated leave quota calculations.',
  },
  '/admin/staff/roles': {
    title: 'Roles & Permissions',
    subtitle: 'Granular system access control and static/dynamic role permissions.',
    phase: 'Phase 5',
    description:
      'Granular Role-Based Access Control (RBAC) configuration will be available in Phase 5. In the meantime, standard static roles (Admin, Manager, Salesman, Karigar In-charge) are active and enforced across the ERP.',
  },
  '/admin/staff/activity-logs': {
    title: 'Staff Activity Logs',
    subtitle: 'Audit trail of administrative staff operations, transfers, and status changes.',
    phase: 'Phase 5',
    description:
      'The dedicated Activity Logs interface is scheduled for Phase 5. All backend operations and changes on staff profiles are already being recorded in the system audit logs table.',
  },
};

export default function StaffPlaceholder() {
  const location = useLocation();
  const info = MODULE_INFO[location.pathname] || {
    title: 'Staff Management Module',
    subtitle: 'Module in development pipeline.',
    phase: 'Upcoming Phase',
    description: 'This operational feature is scheduled in upcoming project phases.',
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <PageHeader
        title={info.title}
        subtitle={info.subtitle}
        actions={
          <Link to="/admin/staff/directory" className="btn btn-secondary">
            ← Staff Directory
          </Link>
        }
      />

      <Card title={`${info.title} (${info.phase})`} note="Development Roadmap">
        <div style={{ padding: '16px 8px' }}>
          <Alert tone="info" title="Scheduled Roadmap Feature">
            {info.description}
          </Alert>

          <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
            <Link to="/admin/staff/directory" className="btn btn-primary">
              Go to Staff Directory
            </Link>
            <Link to="/admin/staff" className="btn btn-secondary">
              Staff Dashboard
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
