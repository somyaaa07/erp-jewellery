import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { toast } from 'react-toastify';
import { QuantityBadge } from '../inventory/StorageMap';

export default function Manufacturing() {
  const [orders, setOrders] = useState([]);
  const [rawMaterials, setRawMaterials] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [pendingLots, setPendingLots] = useState([]);
  const [form, setForm] = useState({ karigar_name: '', product_master_id: '', raw_material_id: '', issued_weight: '', expected_pieces: '', expected_finish_date: '', source_item_id: '' });
  const [rawForm, setRawForm] = useState({ material_type: 'GOLD', purity: '', quantity: '', unit: 'GRAM' });

  const load = () => {
    api.get('/manufacturing').then((res) => setOrders(res.data));
    api.get('/raw-materials').then((res) => setRawMaterials(res.data));
    api.get('/products').then((res) => setProducts(res.data));
    api.get('/locations').then((res) => setLocations(res.data));
    // Wholesale stock whose quantity is not final yet: these can be issued to a karigar.
    api.get('/inventory-search', { params: { kind: 'WHOLESALE', quantity_status: 'UNKNOWN' } }).then((res) => setPendingLots(res.data.rows)).catch(() => setPendingLots([]));
  };
  useEffect(load, []);

  const addRaw = async (e) => {
    e.preventDefault();
    try { await api.post('/raw-materials', rawForm); toast.success('Raw material added'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const issueOrder = async (e) => {
    e.preventDefault();
    try { await api.post('/manufacturing', form); toast.success('Issued to karigar'); setForm({ karigar_name: '', product_master_id: '', raw_material_id: '', issued_weight: '', expected_pieces: '', expected_finish_date: '', source_item_id: '' }); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const cancelOrder = async (order) => {
    if (!window.confirm(`Cancel ${order.order_number}? The issued material goes back to stock.`)) return;
    try { await api.patch(`/manufacturing/${order.id}/cancel`); toast.success('Order cancelled'); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const pickLot = (lotId) => {
    const lot = pendingLots.find((l) => String(l.item_id) === String(lotId));
    setForm({ ...form, source_item_id: lotId, product_master_id: lot ? String(lot.product_master_id) : form.product_master_id });
  };

  const receiveOrder = async (order) => {
    const received_weight = prompt('Weight returned (g):', order.issued_weight);
    if (!received_weight) return;
    const received_pieces = prompt('How many finished pieces were received?', '1');
    if (order.source_item_id) {
      // Goes back into the wholesale stock it was issued from - no location needed.
      try {
        await api.patch(`/manufacturing/${order.id}/receive`, { received_weight, received_pieces });
        toast.success('Finished quantity recorded in the same wholesale stock');
        load();
      } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
      return;
    }
    const locationList = locations.map((l) => `${l.id}: ${l.name}`).join('\n');
    const location_id = prompt(`Which location should this be stored in?\n${locationList}`);
    if (!location_id) return;
    try {
      await api.patch(`/manufacturing/${order.id}/receive`, { received_weight, received_pieces, location_id });
      toast.success('Finished stock added to inventory');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  return (
    <div>
      <h1>Manufacturing & Raw Material</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <form className="card" onSubmit={addRaw}>
          <h3>Add Raw Material Stock</h3>
          <div className="form-group"><label>Material</label>
            <select value={rawForm.material_type} onChange={(e) => setRawForm({ ...rawForm, material_type: e.target.value })}>
              <option>GOLD</option><option>SILVER</option><option>DIAMOND</option><option>STONE</option><option>OTHER</option>
            </select>
          </div>
          <div className="form-group"><label>Purity</label><input value={rawForm.purity} onChange={(e) => setRawForm({ ...rawForm, purity: e.target.value })} /></div>
          <div className="form-group"><label>Quantity</label><input type="number" step="0.001" value={rawForm.quantity} onChange={(e) => setRawForm({ ...rawForm, quantity: e.target.value })} required /></div>
          <button className="btn" type="submit">Add</button>
        </form>

        <form className="card" onSubmit={issueOrder}>
          <h3>Issue to Karigar</h3>
          <div className="form-group"><label>Karigar Name</label><input value={form.karigar_name} onChange={(e) => setForm({ ...form, karigar_name: e.target.value })} required /></div>
          <div className="form-group"><label>From wholesale stock (optional)</label>
            <select value={form.source_item_id} onChange={(e) => pickLot(e.target.value)}>
              <option value="">Not from a stored design</option>
              {pendingLots.map((l) => <option key={l.item_id} value={l.item_id}>{l.design_name} ({l.design_code}) - {l.location_path}</option>)}
            </select>
            <p className="field-hint">Designs stored without a final quantity. The finished pieces come back into the same stock.</p>
          </div>
          <div className="form-group"><label>Design</label>
            <select value={form.product_master_id} onChange={(e) => setForm({ ...form, product_master_id: e.target.value })} required disabled={Boolean(form.source_item_id)}>
              <option value="">Select design</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.product_name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Raw Material (optional)</label>
            <select value={form.raw_material_id} onChange={(e) => setForm({ ...form, raw_material_id: e.target.value })}>
              <option value="">None / external</option>
              {rawMaterials.map((r) => <option key={r.id} value={r.id}>{r.material_type} {r.purity} - {r.quantity}{r.unit}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Issued Weight (g)</label><input type="number" step="0.001" value={form.issued_weight} onChange={(e) => setForm({ ...form, issued_weight: e.target.value })} required /></div>
          <div className="form-group"><label>Expected Pieces</label><input type="number" value={form.expected_pieces} onChange={(e) => setForm({ ...form, expected_pieces: e.target.value })} /></div>
          <button className="btn" type="submit">Issue</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Raw Material Stock</h3>
        <table>
          <thead><tr><th>Material</th><th>Purity</th><th>Quantity</th></tr></thead>
          <tbody>{rawMaterials.map((r) => <tr key={r.id}><td>{r.material_type}</td><td>{r.purity}</td><td>{r.quantity} {r.unit}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>Manufacturing Orders</h3>
        <table>
          <thead><tr><th>Order#</th><th>Karigar</th><th>Design</th><th>Stored in</th><th>Issued Wt</th><th>Received</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>{o.order_number}</td><td>{o.karigar_name}</td><td>{o.ProductMaster?.product_name}</td>
                <td>{o.source_location_path || '—'}</td>
                <td>{o.issued_weight}g</td>
                <td>{o.status === 'RECEIVED' ? `${o.received_pieces ?? '-'} pcs / ${o.received_weight}g` : 'Pending'}</td>
                <td><span className={`badge ${o.status === 'RECEIVED' ? 'green' : (o.status === 'CANCELLED' ? 'red' : 'yellow')}`}>{o.status === 'RECEIVED' ? 'RECEIVED' : (o.status === 'CANCELLED' ? 'CANCELLED' : 'WITH KARIGAR')}</span></td>
                <td>
                  {o.status !== 'RECEIVED' && o.status !== 'CANCELLED' && (
                    <>
                      <button className="btn" onClick={() => receiveOrder(o)}>Receive</button>{' '}
                      <button className="btn btn-secondary" onClick={() => cancelOrder(o)}>Cancel</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
