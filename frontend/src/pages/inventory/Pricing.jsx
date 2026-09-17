import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { toast } from 'react-toastify';

const EMPTY = { profile_type: 'RETAIL', making_charge_type: 'PERCENT_OF_GOLD', making_charge_value: '', wastage_percent: '', gst_percent: 3, other_charges_flat: 0 };

export default function Pricing() {
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get('/pricing-profiles').then((res) => setProfiles(res.data));
  useEffect(load, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/pricing-profiles', form);
      toast.success('Pricing profile saved');
      setForm(EMPTY);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const update = async (id, field, value) => {
    await api.patch(`/pricing-profiles/${id}`, { [field]: value });
    load();
  };

  return (
    <div>
      <h1>Retail & Wholesale Pricing</h1>
      <p style={{ color: '#6b7280', marginTop: -10 }}>
        Set separate making charges and wastage percentages for retail and wholesale. Stock is priced by the rule matching the channel it came in on; the metal rate itself stays the same for both.
      </p>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>New pricing profile</h3>
        <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, alignItems: 'end' }}>
          <div className="form-group">
            <label>Type</label>
            <select value={form.profile_type} onChange={(e) => setForm({ ...form, profile_type: e.target.value })}>
              <option value="RETAIL">Retail</option>
              <option value="WHOLESALE">Wholesale</option>
            </select>
          </div>
          <div className="form-group">
            <label>Making Charge Type</label>
            <select value={form.making_charge_type} onChange={(e) => setForm({ ...form, making_charge_type: e.target.value })}>
              <option value="PERCENT_OF_GOLD">% of Gold Value</option>
              <option value="PER_GRAM">Per Gram (₹)</option>
              <option value="FLAT">Flat Amount (₹)</option>
            </select>
          </div>
          <div className="form-group">
            <label>Making Charge Value</label>
            <input type="number" step="0.01" value={form.making_charge_value} onChange={(e) => setForm({ ...form, making_charge_value: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Wastage %</label>
            <input type="number" step="0.01" value={form.wastage_percent} onChange={(e) => setForm({ ...form, wastage_percent: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>GST %</label>
            <input type="number" step="0.01" value={form.gst_percent} onChange={(e) => setForm({ ...form, gst_percent: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Other Flat Charges (₹)</label>
            <input type="number" step="0.01" value={form.other_charges_flat} onChange={(e) => setForm({ ...form, other_charges_flat: e.target.value })} />
          </div>
          <button className="btn" type="submit">Save Profile</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Existing Profiles</h3>
        <table>
          <thead><tr><th>Type</th><th>Category</th><th>Making</th><th>Wastage %</th><th>GST %</th><th>Active</th></tr></thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td><span className="badge">{p.profile_type}</span></td>
                <td>{p.Category?.name || 'All categories'}</td>
                <td>{p.making_charge_type === 'PERCENT_OF_GOLD' ? `${p.making_charge_value}% of gold` : p.making_charge_type === 'PER_GRAM' ? `₹${p.making_charge_value}/gm` : `₹${p.making_charge_value} flat`}</td>
                <td>{p.wastage_percent}%</td>
                <td>{p.gst_percent}%</td>
                <td>
                  <button className="btn" style={{ background: p.is_active ? '#059669' : '#9ca3af' }}
                    onClick={() => update(p.id, 'is_active', !p.is_active)}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
