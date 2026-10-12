import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

export default function Location() {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const emptyForm = { name: '', parent_id: '', storage_type: 'GENERAL', empty_weight: '', capacity_weight: '', capacity_pieces: '' };
  const [form, setForm] = useState(emptyForm);

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
      const payload = {
        name: form.name, parent_id: form.parent_id || null, storage_type: form.storage_type,
        empty_weight: form.empty_weight || 0,
        capacity_weight: form.capacity_weight || null,
        capacity_pieces: form.capacity_pieces || null,
      };
      if (isAdmin) payload.branch_id = selectedBranch;   // Admin ko branch_id explicitly bhejni hogi

      await api.post('/locations', payload);
      setForm(emptyForm);
      loadLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create location');
    }
  };

  const handleEditCapacity = async (l) => {
    const empty_weight = prompt('Empty weight of this box/tray (grams)', l.empty_weight ?? 0);
    if (empty_weight === null) return;
    const capacity_weight = prompt('Max capacity weight (grams) - blank = no limit', l.capacity_weight ?? '');
    if (capacity_weight === null) return;
    const capacity_pieces = prompt('Max capacity pieces - blank = no limit', l.capacity_pieces ?? '');
    if (capacity_pieces === null) return;
    try {
      await api.patch(`/locations/${l.id}`, { empty_weight, capacity_weight, capacity_pieces });
      loadLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed');
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
        <div className="form-group">
          <label>Type</label>
          <select value={form.storage_type} onChange={(e) => setForm({ ...form, storage_type: e.target.value })}>
            <option value="GENERAL">General (shelf / drawer)</option>
            <option value="WHOLESALE_STORE">Wholesale Store (main storage)</option>
            <option value="TRAY_DISPLAY">Display Tray</option>
          </select>
        </div>
        <div className="form-group">
          <label>Empty weight of box/tray (g)</label>
          <input type="number" step="0.001" value={form.empty_weight} onChange={(e) => setForm({ ...form, empty_weight: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Capacity - max weight (g), blank = no limit</label>
          <input type="number" step="0.001" value={form.capacity_weight} onChange={(e) => setForm({ ...form, capacity_weight: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Capacity - max pieces, blank = no limit</label>
          <input type="number" value={form.capacity_pieces} onChange={(e) => setForm({ ...form, capacity_pieces: e.target.value })} />
        </div>
        <button className="btn" type="submit">Add Location</button>
      </form>

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Level</th><th>Empty wt (g)</th><th>Capacity (g / pcs)</th><th>Parent</th><th></th></tr></thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id}>
                <td>{'—'.repeat(l.level - 1)} {l.name}</td>
                <td>{l.storage_type === 'WHOLESALE_STORE' ? 'Wholesale Store' : l.storage_type === 'TRAY_DISPLAY' ? 'Display Tray' : 'General'}</td>
                <td>L{l.level}</td>
                <td>{l.empty_weight ?? 0}</td>
                <td>{l.capacity_weight ?? '∞'} / {l.capacity_pieces ?? '∞'}</td>
                <td>{locations.find((p) => p.id === l.parent_id)?.name || '—'}</td>
                <td>
                  <button className="btn" style={{ marginRight: 6 }} onClick={() => handleEditCapacity(l)}>Edit capacity</button>
                  <button className="btn btn-danger" onClick={() => handleDelete(l.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}