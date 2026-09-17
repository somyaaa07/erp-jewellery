import React, { useEffect, useState } from 'react';
import api from '../../api/axios';

export default function StockTransfer() {
  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [form, setForm] = useState({ item_id: '', to_branch_id: '', notes: '', quantity: '' });
  const [selectedItem, setSelectedItem] = useState(null);

  const [receivingTransfer, setReceivingTransfer] = useState(null);
  const [destLocations, setDestLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');

  const load = async () => {
    const [i, b, t] = await Promise.all([
      api.get('/items?status=IN_STOCK'), api.get('/branches'), api.get('/stock-transfers'),
    ]);
    setItems(i.data);
    setBranches(b.data);
    setTransfers(t.data);
  };
  useEffect(() => { load(); }, []);

  const handleItemSelect = (id) => {
    setForm({ ...form, item_id: id });
    setSelectedItem(items.find((i) => String(i.id) === String(id)) || null);
  };

  const handleInitiate = async (e) => {
    e.preventDefault();
    try {
      await api.post('/stock-transfers', form);
      setForm({ item_id: '', to_branch_id: '', notes: '', quantity: '' });
      setSelectedItem(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Transfer failed');
    }
  };

  const openReceiveForm = async (transfer) => {
    setReceivingTransfer(transfer);
    const res = await api.get(`/locations?branch_id=${transfer.to_branch_id}`);
    setDestLocations(res.data);
    setSelectedLocation('');
  };

  const confirmReceive = async () => {
    if (!selectedLocation) { alert('Select a destination location'); return; }
    try {
      await api.patch(`/stock-transfers/${receivingTransfer.id}/receive`, { to_location_id: selectedLocation });
      setReceivingTransfer(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Receive failed');
    }
  };

  const handleReject = async (id) => {
    try { await api.patch(`/stock-transfers/${id}/reject`); load(); }
    catch (err) { alert(err.response?.data?.error || 'Reject failed'); }
  };
  const handleCancel = async (id) => {
    try { await api.patch(`/stock-transfers/${id}/cancel`); load(); }
    catch (err) { alert(err.response?.data?.error || 'Cancel failed'); }
  };

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Branch-to-Branch Stock Transfer</h1>

      <form className="card" onSubmit={handleInitiate}>
        <h3 style={{ marginBottom: 12 }}>Send Item to Another Branch</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label>Item</label>
            <select value={form.item_id} onChange={(e) => handleItemSelect(e.target.value)} required>
              <option value="">Select item</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ProductMaster?.product_name} ({i.mode === 'BULK' ? `${i.BulkItem?.total_pieces} pcs` : i.PieceItem?.sku})
                  {branches.find((b) => b.id === i.branch_id) ? ` — ${branches.find((b) => b.id === i.branch_id).name}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedItem?.mode === 'BULK' && (
            <div className="form-group">
              <label>Quantity to Transfer (out of {selectedItem.BulkItem?.total_pieces})</label>
              <input type="number" min="1" max={selectedItem.BulkItem?.total_pieces}
                value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            </div>
          )}

          <div className="form-group">
            <label>Destination Branch</label>
            <select value={form.to_branch_id} onChange={(e) => setForm({ ...form, to_branch_id: e.target.value })} required>
              <option value="">Select branch</option>
              {branches.filter((b) => b.id !== selectedItem?.branch_id).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Notes</label><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <button className="btn" type="submit">Initiate Transfer</button>
      </form>

      {receivingTransfer && (
        <div className="card" style={{ background: '#f0fdf4' }}>
          <h3 style={{ marginBottom: 12 }}>Receive Transfer #{receivingTransfer.id}</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Destination Location</label>
              <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)}>
                <option value="">Select location</option>
                {destLocations.map((l) => <option key={l.id} value={l.id}>{l.name} (L{l.level})</option>)}
              </select>
            </div>
            <button className="btn" onClick={confirmReceive}>Confirm Receive</button>
            <button className="btn" style={{ background: '#9ca3af' }} onClick={() => setReceivingTransfer(null)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Transfer History</h3>
        <table>
          <thead><tr><th>Item</th><th>Qty</th><th>From → To Branch</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {transfers.map((t) => (
              <tr key={t.id}>
                <td>{t.Item?.ProductMaster?.product_name}</td>
                <td>{t.quantity_transferred ?? '—'}</td>
                <td>{t.from_branch_id} → {t.to_branch_id}</td>
                <td>
                  <span className={`badge ${t.status === 'RECEIVED' ? 'green' : ['REJECTED', 'CANCELLED'].includes(t.status) ? 'red' : 'yellow'}`}>
                    {t.status}
                  </span>
                </td>
                <td>
                  {t.status === 'IN_TRANSIT' && (
                    <>
                      <button className="btn" onClick={() => openReceiveForm(t)}>Receive</button>{' '}
                      <button className="btn" style={{ background: '#dc2626' }} onClick={() => handleReject(t.id)}>Reject</button>{' '}
                      <button className="btn" style={{ background: '#9ca3af' }} onClick={() => handleCancel(t.id)}>Cancel</button>
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