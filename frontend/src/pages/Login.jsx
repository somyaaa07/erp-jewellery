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
    <div className="login-wrapper">
      <form className="login-box" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="login-mark">JE</div>
          <h2 style={{ fontSize: 19 }}>Jewellery ERP</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: 3 }}>Sign in to continue</p>
        </div>

        {error && <div className="alert alert-error"><div>{error}</div></div>}

        <div className="form-group">
          <label htmlFor="email">Email</label>
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

        <div className="form-group">
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
          {loading ? <><span className="spinner" /> Signing in…</> : 'Sign in'}
        </button>

        <div className="login-hint">
          Demo login after running <code>npm run db:seed:demo</code>:<br />
          <code>admin@demo.test</code> / <code>Admin@123</code>
        </div>
      </form>
    </div>
  );
}
