// src/pages/SuperAdmin/TenantsDashboard.jsx
// This is the SUPER ADMIN screen - the SaaS-provider-level view across ALL jewellery shops (tenants).
// From here you onboard new shops, suspend non-paying ones, and upgrade/downgrade subscription plans.

import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function CreateAdminModal({ tenant, onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: generatePassword() });
  const [showPassword, setShowPassword] = useState(true);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');
  const [created, setCreated] = useState(null); // holds credentials after success
  const [copied, setCopied] = useState('');

  const validate = () => {
    const next = {};
    if (!form.name.trim()) next.name = 'Enter the admin\u2019s name.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address.';
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');
    if (!validate()) return;

    setSubmitting(true);
    try {
      await api.post(`/super-admin/tenants/${tenant.id}/admin`, form);
      setCreated({ name: form.name, email: form.email, password: form.password });
      onCreated();
    } catch (err) {
      setServerError(
        err.response?.data?.details?.join(', ') ||
        err.response?.data?.error ||
        'Could not create the admin account. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const copy = async (label, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      setCopied('');
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
      <div className="modal-panel">
        {!created ? (
          <>
            <div className="modal-header">
              <div>
                <h2 id="admin-modal-title">Create admin login</h2>
                <p className="modal-subtitle">For {tenant.name}</p>
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="Close">&times;</button>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="admin-name">Admin name</label>
                <input
                  id="admin-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className={errors.name ? 'input-error' : ''}
                  autoFocus
                />
                {errors.name && <span className="field-error">{errors.name}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="admin-email">Admin email</label>
                <input
                  id="admin-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={errors.email ? 'input-error' : ''}
                />
                {errors.email && <span className="field-error">{errors.email}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="admin-password">Temporary password</label>
                <div className="password-row">
                  <input
                    id="admin-password"
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className={errors.password ? 'input-error' : ''}
                  />
                  <button type="button" className="btn-ghost" onClick={() => setShowPassword((s) => !s)}>
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => setForm({ ...form, password: generatePassword() })}>
                    Regenerate
                  </button>
                </div>
                {errors.password && <span className="field-error">{errors.password}</span>}
                <span className="field-hint">The owner will be asked to change this on first login.</span>
              </div>

              {serverError && <div className="server-error">{serverError}</div>}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn" disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create admin login'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="modal-header">
              <div>
                <h2>Admin login created</h2>
                <p className="modal-subtitle">Share these details with the shop owner. They won&rsquo;t be shown again.</p>
              </div>
              <button className="icon-btn" onClick={onClose} aria-label="Close">&times;</button>
            </div>

            <div className="credential-list">
              <div className="credential-row">
                <div>
                  <span className="credential-label">Email</span>
                  <span className="credential-value">{created.email}</span>
                </div>
                <button className="btn-ghost" onClick={() => copy('email', created.email)}>
                  {copied === 'email' ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="credential-row">
                <div>
                  <span className="credential-label">Temporary password</span>
                  <span className="credential-value credential-mono">{created.password}</span>
                </div>
                <button className="btn-ghost" onClick={() => copy('password', created.password)}>
                  {copied === 'password' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function TenantsDashboard() {
  const [tenants, setTenants] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', owner_email: '', owner_phone: '', subscription_plan: 'TRIAL', max_branches: 1 });
  const [adminModalTenant, setAdminModalTenant] = useState(null);

  const load = async () => {
    const res = await api.get('/super-admin/tenants');
    setTenants(res.data);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    await api.post('/super-admin/tenants', form);
    setShowForm(false);
    setForm({ name: '', owner_email: '', owner_phone: '', subscription_plan: 'TRIAL', max_branches: 1 });
    load();
  };

  const updateStatus = async (id, status) => {
    await api.patch(`/super-admin/tenants/${id}/status`, { status });
    load();
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1>Tenants (Jewellery Shops)</h1>
        <button className="btn" onClick={() => setShowForm(!showForm)}>+ New Tenant</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={handleCreate}>
          <div className="form-group">
            <label>Shop / Business Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Owner Email</label>
            <input type="email" value={form.owner_email} onChange={(e) => setForm({ ...form, owner_email: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Owner Phone</label>
            <input value={form.owner_phone} onChange={(e) => setForm({ ...form, owner_phone: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Subscription Plan</label>
            <select value={form.subscription_plan} onChange={(e) => setForm({ ...form, subscription_plan: e.target.value })}>
              <option value="TRIAL">TRIAL</option>
              <option value="BASIC">BASIC</option>
              <option value="PRO">PRO</option>
              <option value="ENTERPRISE">ENTERPRISE</option>
            </select>
          </div>
          <div className="form-group">
            <label>Max Branches Allowed</label>
            <input type="number" min="1" value={form.max_branches} onChange={(e) => setForm({ ...form, max_branches: e.target.value })} />
          </div>
          <button className="btn" type="submit">Create Tenant</button>
        </form>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Shop Name</th><th>Owner Email</th><th>Plan</th><th>Branches</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td>{t.owner_email}</td>
                <td><span className="badge">{t.subscription_plan}</span></td>
                <td>{t.Branches?.length || 0} / {t.max_branches}</td>
                <td>
                  <span className={`badge ${t.status === 'ACTIVE' ? 'green' : t.status === 'SUSPENDED' ? 'yellow' : 'red'}`}>
                    {t.status}
                  </span>
                </td>
                <td>
                  {t.status === 'ACTIVE'
                    ? <button className="btn" style={{ background: '#f59e0b' }} onClick={() => updateStatus(t.id, 'SUSPENDED')}>Suspend</button>
                    : <button className="btn" onClick={() => updateStatus(t.id, 'ACTIVE')}>Activate</button>}
                  {' '}
                  <button className="btn" onClick={() => setAdminModalTenant(t)}>+ Admin Login</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adminModalTenant && (
        <CreateAdminModal
          tenant={adminModalTenant}
          onClose={() => setAdminModalTenant(null)}
          onCreated={load}
        />
      )}

      <style>{`
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 23, 42, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }
        .modal-panel {
          background: #fff;
          border-radius: 12px;
          width: 100%;
          max-width: 440px;
          padding: 24px;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }
        .modal-header h2 {
          margin: 0;
          font-size: 18px;
        }
        .modal-subtitle {
          margin: 4px 0 0;
          font-size: 13px;
          color: #64748b;
        }
        .icon-btn {
          background: none;
          border: none;
          font-size: 22px;
          line-height: 1;
          cursor: pointer;
          color: #94a3b8;
          padding: 0 4px;
        }
        .icon-btn:hover { color: #334155; }
        .password-row {
          display: flex;
          gap: 6px;
        }
        .password-row input { flex: 1; }
        .btn-ghost {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
        }
        .btn-ghost:hover { background: #e2e8f0; }
        .btn-secondary {
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 14px;
          cursor: pointer;
        }
        .field-hint {
          display: block;
          font-size: 12px;
          color: #94a3b8;
          margin-top: 4px;
        }
        .field-error {
          display: block;
          font-size: 12px;
          color: #dc2626;
          margin-top: 4px;
        }
        .input-error { border-color: #dc2626 !important; }
        .server-error {
          background: #fef2f2;
          color: #b91c1c;
          border: 1px solid #fecaca;
          border-radius: 6px;
          padding: 10px 12px;
          font-size: 13px;
          margin-bottom: 12px;
        }
        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 20px;
        }
        .credential-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 8px;
        }
        .credential-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 10px 12px;
        }
        .credential-label {
          display: block;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #94a3b8;
        }
        .credential-value {
          display: block;
          font-size: 14px;
          color: #0f172a;
          margin-top: 2px;
        }
        .credential-mono { font-family: 'SFMono-Regular', Consolas, monospace; }
      `}</style>
    </div>
  );
}