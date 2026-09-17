import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export default function Location() {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [form, setForm] = useState({ name: '', parent_id: '' });

  const isAdmin = user?.role === 'ADMIN';

  const loadBranches = () => {
    if (isAdmin) {
      api.get('/branches').then((res) => {
        setBranches(res.data);
        if (res.data.length > 0) setSelectedBranch(res.data[0].id);
      });
    }
  };

  const loadLocations = () => {
    const query = isAdmin && selectedBranch ? `?branch_id=${selectedBranch}` : '';
    api.get(`/locations${query}`).then((res) => setLocations(res.data));
  };

  useEffect(() => { loadBranches(); }, []);
  useEffect(() => { if (!isAdmin || selectedBranch) loadLocations(); }, [selectedBranch]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = { name: form.name, parent_id: form.parent_id || null };
      if (isAdmin) payload.branch_id = selectedBranch;   // Admin ko branch_id explicitly bhejni hogi

      await api.post('/locations', payload);
      setForm({ name: '', parent_id: '' });
      loadLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create location');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this location?')) return;
    try {
      await api.delete(`/locations/${id}`);
      loadLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Storage Locations</h1>

      {isAdmin && (
        <div className="card">
          <div className="form-group">
            <label>Select Branch</label>
            <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)}>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      )}

      <form className="card" onSubmit={handleCreate}>
        <h3 style={{ marginBottom: 12 }}>Add Location</h3>
        <div className="form-group">
          <label>Name (e.g. Main Safe, Box A, Tray 5)</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>Parent Location (leave blank for top-level)</label>
          <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
            <option value="">— Top Level (L1) —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{'—'.repeat(l.level - 1)} {l.name} (L{l.level})</option>
            ))}
          </select>
        </div>
        <button className="btn" type="submit">Add Location</button>
      </form>

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Level</th><th>Parent</th><th></th></tr></thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id}>
                <td>{'—'.repeat(l.level - 1)} {l.name}</td>
                <td>L{l.level}</td>
                <td>{locations.find((p) => p.id === l.parent_id)?.name || '—'}</td>
                <td><button className="btn" style={{ background: '#dc2626' }} onClick={() => handleDelete(l.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}