import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { toast } from 'react-toastify';

const TABS = ['Tray Transfer', 'Reservations', 'Repairs & Damage', 'Stock Adjustment'];

export default function StockOps() {
  const [tab, setTab] = useState('Tray Transfer');
  const [items, setItems] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [repairs, setRepairs] = useState([]);
  const [adjustments, setAdjustments] = useState([]);

  const [resForm, setResForm] = useState({ item_id: '', notes: '' });
  const [repairForm, setRepairForm] = useState({ item_id: '', order_type: 'INTERNAL_REPAIR', sent_to_karigar: '', issue_description: '' });
  const [adjForm, setAdjForm] = useState({ item_id: '', physical_quantity: '', reason: '' });

  const load = () => {
    api.get('/items?status=IN_STOCK').then((res) => setItems(res.data));
    api.get('/reservations').then((res) => setReservations(res.data));
    api.get('/repairs').then((res) => setRepairs(res.data));
    api.get('/stock-adjustments').then((res) => setAdjustments(res.data));
  };
  useEffect(load, []);

  // Tray Transfer: move stock between the wholesale store and the display tray.
  const [trayForm, setTrayForm] = useState({ item_id: '', direction: 'to-tray', quantity_pieces: '', weight_grams: '' });
  const selectedTrayItem = items.find((i) => String(i.id) === String(trayForm.item_id));

  const submitTrayMove = async (e) => {
    e.preventDefault();
    try {
      const body = {};
      if (selectedTrayItem?.mode === 'BULK') {
        if (trayForm.quantity_pieces) body.quantity_pieces = Number(trayForm.quantity_pieces);
        else if (trayForm.weight_grams) body.weight_grams = Number(trayForm.weight_grams);
      }
      const path = trayForm.direction === 'to-tray' ? 'move-to-tray' : 'move-to-wholesale';
      await api.post(`/items/${trayForm.item_id}/${path}`, body);
      toast.success(trayForm.direction === 'to-tray' ? 'Moved to tray' : 'Moved back to wholesale');
      setTrayForm({ ...trayForm, quantity_pieces: '', weight_grams: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Move failed'); }
  };

  const createReservation = async (e) => {
    e.preventDefault();
    try { await api.post('/reservations', resForm); toast.success('Item reserved'); setResForm({ item_id: '', notes: '' }); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };
  const releaseReservation = async (id) => {
    await api.patch(`/reservations/${id}/release`); toast.success('Reservation released'); load();
  };

  const createRepair = async (e) => {
    e.preventDefault();
    try { await api.post('/repairs', repairForm); toast.success('Repair or damage entry saved'); setRepairForm({ item_id: '', order_type: 'INTERNAL_REPAIR', sent_to_karigar: '', issue_description: '' }); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };
  const completeRepair = async (id) => {
    await api.patch(`/repairs/${id}/complete`); toast.success('Marked as complete'); load();
  };

  const createAdjustment = async (e) => {
    e.preventDefault();
    try { await api.post('/stock-adjustments', adjForm); toast.success('Adjustment recorded'); setAdjForm({ item_id: '', physical_quantity: '', reason: '' }); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  return (
    <div>
      <h1>Stock Operations</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t}
            className="btn"
            style={{
              background: tab === t ? 'var(--primary)' : 'var(--border-strong)',
              color: tab === t ? '#FFFFFF' : 'var(--text-muted)',
            }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Tray Transfer' && (
        <>
          <form className="card" onSubmit={submitTrayMove}>
            <h3>Move stock between Wholesale Store and Display Tray</h3>
            <div className="form-group"><label>Item</label>
              <select value={trayForm.item_id} onChange={(e) => setTrayForm({ ...trayForm, item_id: e.target.value })} required>
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.ProductMaster?.product_name} ({i.ProductMaster?.design_code})</option>)}
              </select>
            </div>
            <div className="form-group"><label>Direction</label>
              <select value={trayForm.direction} onChange={(e) => setTrayForm({ ...trayForm, direction: e.target.value })}>
                <option value="to-tray">Wholesale → Tray</option>
                <option value="to-wholesale">Tray → Wholesale</option>
              </select>
            </div>
            {selectedTrayItem?.mode === 'BULK' && (
              <>
                <div className="form-group"><label>Pieces to move</label>
                  <input type="number" min="1" value={trayForm.quantity_pieces} onChange={(e) => setTrayForm({ ...trayForm, quantity_pieces: e.target.value, weight_grams: '' })} />
                </div>
                <div className="form-group"><label>...or weight to move (g)</label>
                  <input type="number" step="0.001" value={trayForm.weight_grams} onChange={(e) => setTrayForm({ ...trayForm, weight_grams: e.target.value, quantity_pieces: '' })} />
                </div>
              </>
            )}
            {selectedTrayItem?.mode === 'PIECE' && <p style={{ color: 'var(--text-muted)' }}>Single piece - the whole piece moves.</p>}
            <button className="btn" type="submit">Move</button>
          </form>
          <div className="card">
            <table>
              <thead><tr><th>Item</th><th>Wholesale (pcs / g)</th><th>Tray (pcs / g)</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.ProductMaster?.product_name} ({i.ProductMaster?.design_code})</td>
                    {i.mode === 'BULK' ? (
                      <>
                        <td>{i.BulkItem?.total_pieces} / {Number(i.BulkItem?.total_gross_weight).toFixed(3)}</td>
                        <td>{i.BulkItem?.tray_pieces} / {Number(i.BulkItem?.tray_gross_weight).toFixed(3)}</td>
                      </>
                    ) : (
                      <>
                        <td>{i.is_tray_display ? '—' : '1 piece'}</td>
                        <td>{i.is_tray_display ? '1 piece' : '—'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'Reservations' && (
        <>
          <form className="card" onSubmit={createReservation}>
            <h3>Reserve an Item</h3>
            <div className="form-group"><label>Item</label>
              <select value={resForm.item_id} onChange={(e) => setResForm({ ...resForm, item_id: e.target.value })} required>
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.ProductMaster?.product_name} ({i.ProductMaster?.design_code})</option>)}
              </select>
            </div>
            <div className="form-group"><label>Notes</label><input value={resForm.notes} onChange={(e) => setResForm({ ...resForm, notes: e.target.value })} /></div>
            <button className="btn" type="submit">Reserve</button>
          </form>
          <div className="card">
            <table>
              <thead><tr><th>Item</th><th>Status</th><th>Reserved At</th><th></th></tr></thead>
              <tbody>
                {reservations.map((r) => (
                  <tr key={r.id}>
                    <td>{r.Item?.ProductMaster?.product_name || r.item_id}</td>
                    <td><span className={`badge ${r.status === 'ACTIVE' ? 'yellow' : 'green'}`}>{r.status}</span></td>
                    <td>{new Date(r.reserved_at).toLocaleString()}</td>
                    <td>{r.status === 'ACTIVE' && <button className="btn" onClick={() => releaseReservation(r.id)}>Release</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'Repairs & Damage' && (
        <>
          <form className="card" onSubmit={createRepair}>
            <h3>New Repair / Damage Entry</h3>
            <div className="form-group"><label>Item</label>
              <select value={repairForm.item_id} onChange={(e) => setRepairForm({ ...repairForm, item_id: e.target.value })}>
                <option value="">Select item (optional for customer repair)</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.ProductMaster?.product_name}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Type</label>
              <select value={repairForm.order_type} onChange={(e) => setRepairForm({ ...repairForm, order_type: e.target.value })}>
                <option value="INTERNAL_REPAIR">Internal Repair</option>
                <option value="CUSTOMER_REPAIR">Customer Repair</option>
                <option value="DAMAGE">Damage</option>
              </select>
            </div>
            <div className="form-group"><label>Sent to Karigar</label><input value={repairForm.sent_to_karigar} onChange={(e) => setRepairForm({ ...repairForm, sent_to_karigar: e.target.value })} /></div>
            <div className="form-group"><label>Issue Description</label><input value={repairForm.issue_description} onChange={(e) => setRepairForm({ ...repairForm, issue_description: e.target.value })} /></div>
            <button className="btn" type="submit">Save</button>
          </form>
          <div className="card">
            <table>
              <thead><tr><th>Item</th><th>Type</th><th>Karigar</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {repairs.map((r) => (
                  <tr key={r.id}>
                    <td>{r.Item?.ProductMaster?.product_name || '—'}</td>
                    <td><span className="badge">{r.order_type}</span></td>
                    <td>{r.sent_to_karigar || '—'}</td>
                    <td><span className={`badge ${r.status === 'COMPLETED' ? 'green' : 'yellow'}`}>{r.status}</span></td>
                    <td>{r.status !== 'COMPLETED' && <button className="btn" onClick={() => completeRepair(r.id)}>Mark Complete</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'Stock Adjustment' && (
        <>
          <form className="card" onSubmit={createAdjustment}>
            <h3>Physical Count Adjustment</h3>
            <div className="form-group"><label>Item</label>
              <select value={adjForm.item_id} onChange={(e) => setAdjForm({ ...adjForm, item_id: e.target.value })} required>
                <option value="">Select item</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.ProductMaster?.product_name} — system: {i.BulkItem?.total_pieces ?? 1} pcs</option>)}
              </select>
            </div>
            <div className="form-group"><label>Actual Physical Quantity</label><input type="number" value={adjForm.physical_quantity} onChange={(e) => setAdjForm({ ...adjForm, physical_quantity: e.target.value })} required /></div>
            <div className="form-group"><label>Reason</label><input value={adjForm.reason} onChange={(e) => setAdjForm({ ...adjForm, reason: e.target.value })} /></div>
            <button className="btn" type="submit">Save Adjustment</button>
          </form>
          <div className="card">
            <table>
              <thead><tr><th>Item</th><th>System Qty</th><th>Physical Qty</th><th>Reason</th></tr></thead>
              <tbody>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.Item?.ProductMaster?.product_name}</td>
                    <td>{a.system_quantity}</td><td>{a.physical_quantity}</td><td>{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
