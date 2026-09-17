import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { toast } from 'react-toastify';

export default function GoldRate() {
  const [rates, setRates] = useState([]);
  const [today, setToday] = useState([]);
  const [form, setForm] = useState({ metal_type: 'GOLD', purity: '22K', rate_per_gram: '' });

  const load = () => {
    api.get('/gold-rates').then((res) => setRates(res.data));
    api.get('/gold-rates/today').then((res) => setToday(res.data));
  };
  useEffect(load, []);

  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/gold-rates', form);
      toast.success('Rate updated. Every item is now priced from this rate.');
      setForm({ ...form, rate_per_gram: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  return (
    <div>
      <h1>Metal Rates</h1>
      <p style={{ color: '#6b7280', marginTop: -10 }}>
        Update the rate here each morning. Every item in inventory is repriced from it automatically, so there is no need to edit prices item by item.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20, marginTop: 20 }}>
        <div className="card">
          <h3>Today's rate</h3>
          <form onSubmit={submit}>
            <div className="form-group">
              <label>Metal</label>
              <select value={form.metal_type} onChange={(e) => setForm({ ...form, metal_type: e.target.value })}>
                <option value="GOLD">Gold</option>
                <option value="SILVER">Silver</option>
                <option value="PLATINUM">Platinum</option>
              </select>
            </div>
            <div className="form-group">
              <label>Purity (e.g. 22K, 18K, 92.5)</label>
              <input value={form.purity} onChange={(e) => setForm({ ...form, purity: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Rate per gram (₹)</label>
              <input type="number" step="0.01" value={form.rate_per_gram} onChange={(e) => setForm({ ...form, rate_per_gram: e.target.value })} required />
            </div>
            <button className="btn" type="submit">Update Rate</button>
          </form>
        </div>

        <div className="card">
          <h3>Live rates today</h3>
          <table>
            <thead><tr><th>Metal</th><th>Purity</th><th>Rate/gram</th><th>Date</th></tr></thead>
            <tbody>
              {today.map((r) => (
                <tr key={r.id}><td>{r.metal_type}</td><td>{r.purity}</td><td>₹{r.rate_per_gram}</td><td>{r.rate_date}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Rate History</h3>
        <table>
          <thead><tr><th>Date</th><th>Metal</th><th>Purity</th><th>Rate/gram</th></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}><td>{r.rate_date}</td><td>{r.metal_type}</td><td>{r.purity}</td><td>₹{r.rate_per_gram}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
