// src/pages/Admin/AdminDashboard.jsx
// Tenant-level ADMIN home screen - quick cross-module snapshot using the new Dashboard API.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';

function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState(null);
  const [lowStock, setLowStock] = useState([]);

  useEffect(() => {
    api.get('/dashboard/summary').then((res) => setSummary(res.data)).catch(() => {});
    api.get('/items/low-stock').then((res) => setLowStock(res.data)).catch(() => {});
  }, []);

  const cards = summary ? [
    { label: 'Pieces in Stock', value: summary.total_pieces_in_stock },
    { label: 'Gold Weight', value: `${summary.total_gold_weight_grams}g` },
    { label: 'Inventory Value (Retail)', value: money(summary.total_inventory_retail_value) },
    { label: "Today's Sales", value: money(summary.todays_sales_amount) },
    { label: 'Active Reservations', value: summary.active_reservations },
  ] : [];

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Admin Dashboard</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 20 }}>
        {cards.map((c) => (
          <div className="card" key={c.label}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{c.value}</div>
          </div>
        ))}
      </div>

      {summary?.latest_gold_rates?.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <h3 style={{ marginBottom: 12 }}>Latest Gold/Silver Rates</h3>
          <div style={{ display: 'flex', gap: 20 }}>
            {summary.latest_gold_rates.map((r) => (
              <div key={r.id}>{r.metal_type} {r.purity}: <strong>₹{r.rate_per_gram}/g</strong></div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Low Stock Alerts</h3>
        {lowStock.length === 0 ? <p style={{ color: '#6b7280', fontSize: 14 }}>No low-stock items right now.</p> : (
          <table>
            <thead><tr><th>Item</th><th>Pieces Left</th><th>Threshold</th></tr></thead>
            <tbody>
              {lowStock.map((i) => (
                <tr key={i.id}>
                  <td>{i.ProductMaster?.product_name}</td>
                  <td>{i.BulkItem?.total_pieces}</td>
                  <td>{i.low_stock_threshold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Quick Links</h3>
        <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/inventory/designs">Design Master</Link>
          <Link className="btn" to="/inventory/gold-rates">Gold Rate</Link>
          <Link className="btn" to="/inventory/pricing">Pricing</Link>
          <Link className="btn" to="/inventory/items">Inventory</Link>
          <Link className="btn" to="/pos/billing">Billing</Link>
          <Link className="btn" to="/admin/reports">Reports</Link>
        </div>
      </div>
    </div>
  );
}
