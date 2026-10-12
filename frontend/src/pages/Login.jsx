// src/pages/Login.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../components/ui';

const HOME_BY_ROLE = {
  SUPER_ADMIN: '/super-admin/tenants',
  ADMIN: '/admin',
  MANAGER: '/inventory/items',
  SALESMAN: '/pos/billing',
  KARIGAR_INCHARGE: '/karigar',
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(HOME_BY_ROLE[user.role] || '/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Login failed. Please check your email and password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        {/* Left Side: Elegant Jewellery ERP Branding */}
        <div className="login-brand-panel">
          <div className="login-brand-header">
            <div className="login-brand-logo">JE</div>
            <div className="login-brand-title">Jewellery ERP</div>
          </div>

          <div className="login-brand-body">
            <div className="login-brand-tagline">
              Smart Jewellery Management <span>Platform</span>
            </div>
            <p className="login-brand-desc">
              Unified enterprise system for gold inventory, bullion pricing, branch transfers, manufacturing, and billing.
            </p>

            <div className="login-brand-features">
              <div className="login-feature-item">
                <span className="login-feature-dot" />
                <span>Live metal rate repricing &amp; Karigar workflows</span>
              </div>
              <div className="login-feature-item">
                <span className="login-feature-dot" />
                <span>Multi-branch storage &amp; tray-level tracking</span>
              </div>
              <div className="login-feature-item">
                <span className="login-feature-dot" />
                <span>Compliant GST invoicing &amp; valuation reports</span>
              </div>
            </div>
          </div>

          <div className="login-brand-footer">
            Jewellery ERP &bull; Secure Enterprise Portal
          </div>
        </div>

        {/* Right Side: Clean White Login Card */}
        <div className="login-form-panel">
          <div className="login-form-header">
            <h2>Sign In</h2>
            <p>Enter your credentials to access your store operations</p>
          </div>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="alert alert-error" role="alert">
                <div>{error}</div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            <button type="submit" className="btn btn-lg btn-block" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" /> Signing in…
                </>
              ) : (
                'Sign In to Dashboard'
              )}
            </button>

            <div className="login-hint-box">
              <strong>Demo Login</strong> (after <code>npm run db:seed:demo</code>):<br />
              <code>admin@demo.test</code> / <code>Admin@123</code>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
