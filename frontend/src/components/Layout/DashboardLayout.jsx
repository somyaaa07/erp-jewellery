// src/components/Layout/DashboardLayout.jsx
// The app shell: a grouped sidebar, a topbar that always says where you are, and the
// page itself wrapped in an error boundary so one broken screen cannot blank the app.
import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ErrorBoundary from '../ErrorBoundary';
import { titleCase } from '../ui';

/* Simple inline icons - no icon package needed, and they inherit the text colour. */
const Icon = ({ d, viewBox = '0 0 24 24' }) => (
  <svg className="nav-icon" viewBox={viewBox} fill="none" stroke="currentColor"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const ICONS = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  branch: 'M3 21V7l9-4 9 4v14M9 21v-6h6v6',
  location: 'M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z M12 10h.01',
  design: 'M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 15.6 7.1 18.2l.9-5.5-4-3.9L9.5 8z',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8',
  rate: 'M3 17l6-6 4 4 8-8M21 7v5h-5',
  pricing: 'M20.6 13.4L12 22l-9-9V3h10l7.6 7.6a2 2 0 0 1 0 2.8z M7.5 7.5h.01',
  transfer: 'M4 8h12l-4-4M20 16H8l4 4',
  ops: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 13a8 8 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 2.5h4l.4-2.5a8 8 0 0 0 1.7-1l2.4 1 2-3.4z',
  supplier: 'M3 7h13v10H3zM16 10h3l2 3v4h-5M6.5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM18.5 20a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  pos: 'M6 2h12l1 6H5zM5 8v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M9 13h6',
  customers: 'M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9',
  invoice: 'M8 2h8a2 2 0 0 1 2 2v18l-3-2-3 2-3-2-3 2V4a2 2 0 0 1 2-2zM9 8h6M9 12h6',
  karigar: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.8z',
  reports: 'M3 3v18h18M7 15V9M12 17V5M17 15v-6',
  tenants: 'M3 21h18M5 21V7l7-4 7 4v14M10 21v-5h4v5',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
};

/**
 * Navigation is grouped by what the user is trying to do, not by build phase.
 * Each role only sees the groups it can actually open.
 */
const NAV_BY_ROLE = {
  SUPER_ADMIN: [
    { section: 'Platform', links: [{ to: '/super-admin/tenants', label: 'Stores', icon: 'tenants' }] },
  ],
  ADMIN: [
    {
      section: 'Overview',
      links: [
        { to: '/admin', label: 'Dashboard', icon: 'dashboard', end: true },
        { to: '/admin/reports', label: 'Reports', icon: 'reports' },
      ],
    },
    {
      section: 'Inventory',
      links: [
        { to: '/inventory/items', label: 'Stock', icon: 'box' },
        { to: '/inventory/designs', label: 'Designs & Categories', icon: 'design' },
        { to: '/inventory/locations', label: 'Storage Locations', icon: 'location' },
        { to: '/inventory/transfers', label: 'Branch Transfers', icon: 'transfer' },
        { to: '/inventory/stock-ops', label: 'Stock Operations', icon: 'ops' },
      ],
    },
    {
      section: 'Pricing',
      links: [
        { to: '/inventory/gold-rates', label: 'Metal Rates', icon: 'rate' },
        { to: '/inventory/pricing', label: 'Pricing Rules', icon: 'pricing' },
      ],
    },
    {
      section: 'Sales',
      links: [
        { to: '/pos/billing', label: 'Billing', icon: 'pos' },
        { to: '/pos/invoices', label: 'Invoices', icon: 'invoice' },
        { to: '/pos/customers', label: 'Customers', icon: 'customers' },
      ],
    },
    {
      section: 'Operations',
      links: [
        { to: '/purchasing/suppliers', label: 'Suppliers & Purchases', icon: 'supplier' },
        { to: '/karigar', label: 'Manufacturing', icon: 'karigar' },
        { to: '/admin/branches', label: 'Branches', icon: 'branch' },
      ],
    },
  ],
  MANAGER: [
    {
      section: 'Overview',
      links: [{ to: '/admin/reports', label: 'Reports', icon: 'reports' }],
    },
    {
      section: 'Inventory',
      links: [
        { to: '/inventory/items', label: 'Stock', icon: 'box' },
        { to: '/inventory/designs', label: 'Designs & Categories', icon: 'design' },
        { to: '/inventory/locations', label: 'Storage Locations', icon: 'location' },
        { to: '/inventory/transfers', label: 'Branch Transfers', icon: 'transfer' },
        { to: '/inventory/stock-ops', label: 'Stock Operations', icon: 'ops' },
      ],
    },
    {
      section: 'Pricing',
      links: [
        { to: '/inventory/gold-rates', label: 'Metal Rates', icon: 'rate' },
        { to: '/inventory/pricing', label: 'Pricing Rules', icon: 'pricing' },
      ],
    },
    {
      section: 'Sales',
      links: [
        { to: '/pos/billing', label: 'Billing', icon: 'pos' },
        { to: '/pos/invoices', label: 'Invoices', icon: 'invoice' },
        { to: '/pos/customers', label: 'Customers', icon: 'customers' },
      ],
    },
    {
      section: 'Operations',
      links: [
        { to: '/purchasing/suppliers', label: 'Suppliers & Purchases', icon: 'supplier' },
        { to: '/karigar', label: 'Manufacturing', icon: 'karigar' },
      ],
    },
  ],
  SALESMAN: [
    {
      section: 'Sales',
      links: [
        { to: '/pos/billing', label: 'Billing', icon: 'pos' },
        { to: '/pos/invoices', label: 'Invoices', icon: 'invoice' },
        { to: '/pos/customers', label: 'Customers', icon: 'customers' },
      ],
    },
    { section: 'Inventory', links: [{ to: '/inventory/items', label: 'Stock', icon: 'box' }] },
  ],
  KARIGAR_INCHARGE: [
    { section: 'Workshop', links: [{ to: '/karigar', label: 'Manufacturing', icon: 'karigar' }] },
    { section: 'Inventory', links: [{ to: '/inventory/items', label: 'Stock', icon: 'box' }] },
  ],
};

// Used by the topbar to name the current screen.
const TITLES = [
  ['/super-admin/tenants', 'Stores'],
  ['/admin/branches', 'Branches'],
  ['/admin/reports', 'Reports'],
  ['/admin', 'Dashboard'],
  ['/inventory/items/new', 'Add Stock'],
  ['/inventory/items', 'Stock'],
  ['/inventory/designs', 'Designs & Categories'],
  ['/inventory/locations', 'Storage Locations'],
  ['/inventory/gold-rates', 'Metal Rates'],
  ['/inventory/pricing', 'Pricing Rules'],
  ['/inventory/transfers', 'Branch Transfers'],
  ['/inventory/stock-ops', 'Stock Operations'],
  ['/purchasing/suppliers', 'Suppliers & Purchases'],
  ['/pos/billing', 'Billing'],
  ['/pos/invoices', 'Invoices'],
  ['/pos/customers', 'Customers'],
  ['/karigar', 'Manufacturing'],
];

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || 'U';
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sections = NAV_BY_ROLE[user?.role] || [];

  // Close the drawer whenever the route changes, so mobile navigation feels normal.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const pageTitle = useMemo(() => {
    const match = TITLES.find(([path]) => location.pathname.startsWith(path));
    return match ? match[1] : 'Jewellery ERP';
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="app-shell">
      {mobileOpen && <div className="scrim" onClick={() => setMobileOpen(false)} />}

      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-mark">JE</div>
          <div className="sidebar-brand-text">
            Jewellery ERP
            <small>Inventory &amp; Billing</small>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="avatar">{initials(user?.name)}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user?.name || 'User'}
            </div>
            <div className="subtle" style={{ fontSize: 11 }}>{titleCase(user?.role)}</div>
          </div>
        </div>

        <nav>
          {sections.map((group) => (
            <div className="nav-section" key={group.section}>
              <div className="nav-section-label">{group.section}</div>
              {group.links.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => (isActive ? 'active' : '')}
                >
                  <Icon d={ICONS[link.icon] || ICONS.box} />
                  <span>{link.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="btn btn-ghost btn-block" onClick={handleLogout}>
            <Icon d={ICONS.logout} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              className="sidebar-toggle"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <span className="topbar-title">{pageTitle}</span>
          </div>
          <div className="topbar-meta">
            <span>{today}</span>
          </div>
        </header>

        <main className="main-content">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
