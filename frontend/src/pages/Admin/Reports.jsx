import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

function money(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export default function Reports() {
  const [valuation, setValuation] = useState(null);
  const [slowMoving, setSlowMoving] = useState(null);
  const [sales, setSales] = useState(null);

  useEffect(() => {
    api.get('/reports/inventory-valuation').then((res) => setValuation(res.data));
    api.get('/reports/slow-moving-stock').then((res) => setSlowMoving(res.data));
    api.get('/reports/sales').then((res) => setSales(res.data));
  }, []);

  return (
    <div>
      <h1>Reports</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div className="card">
          <h3>Inventory Valuation</h3>
          {valuation ? (
            <>
              <p>Total Pieces: <strong>{valuation.total_pieces}</strong></p>
              <p>Total Gold Weight: <strong>{valuation.total_weight_grams}g</strong></p>
              <p>Retail Value: <strong>{money(valuation.total_retail_value)}</strong></p>
              <p>Wholesale Value: <strong>{money(valuation.total_wholesale_value)}</strong></p>
            </>
          ) : <p>Loading…</p>}
        </div>

        <div className="card">
          <h3>Sales Summary</h3>
          {sales ? (
            <>
              <p>Total Invoices: <strong>{sales.total_invoices}</strong></p>
              <p>Retail Invoices: <strong>{sales.retail_invoices}</strong></p>
              <p>Wholesale Invoices: <strong>{sales.wholesale_invoices}</strong></p>
              <p>Total Sales: <strong>{money(sales.total_sales_amount)}</strong></p>
            </>
          ) : <p>Loading…</p>}
        </div>

        <div className="card">
          <h3>Slow / Dead Stock (days idle)</h3>
          {slowMoving ? (
            <>
              <p>0-30 days: <strong>{slowMoving['0-30'].length}</strong></p>
              <p>31-90 days: <strong>{slowMoving['31-90'].length}</strong></p>
              <p>91-180 days: <strong>{slowMoving['91-180'].length}</strong></p>
              <p style={{ color: '#991b1b' }}>180+ days (dead stock): <strong>{slowMoving['180+'].length}</strong></p>
            </>
          ) : <p>Loading…</p>}
        </div>
      </div>

      {valuation && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3>Item-wise Valuation</h3>
          <table>
            <thead><tr><th>Item</th><th>Qty</th><th>Weight</th><th>Retail Value</th><th>Wholesale Value</th></tr></thead>
            <tbody>
              {valuation.items.map((r) => (
                <tr key={r.item_id}>
                  <td>{r.product_name}</td><td>{r.quantity}</td><td>{r.weight}g</td>
                  <td>{money(r.retail_value)}</td><td>{money(r.wholesale_value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
