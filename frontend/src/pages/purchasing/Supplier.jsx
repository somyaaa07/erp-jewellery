// src/pages/purchasing/Supplier.jsx (redesigned from Vendor.jsx)
import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { toast } from 'react-toastify';

export default function Supplier() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [suppliers, setSuppliers] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');

  const [supplierForm, setSupplierForm] = useState({ name: '', gstin: '', phone: '', address: '' });
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '', purchase_date: '', metal_type: 'GOLD', gross_weight: '',
    tunch_percentage: '', subtotal_amount: '', tax_amount: '', is_jangad: false,
  });

  useEffect(() => {
    if (isAdmin) {
      api.get('/branches').then((res) => {
        setBranches(res.data);
        if (res.data.length > 0) setSelectedBranch(res.data[0].id);
      });
    }
  }, [isAdmin]);

  const load = async () => {
    const [s, p, l, pr] = await Promise.all([api.get('/suppliers'), api.get('/purchases'), api.get('/locations'), api.get('/products')]);
    setSuppliers(s.data); setPurchases(p.data); setLocations(l.data); setProducts(pr.data);
  };
  useEffect(() => { load(); }, []);

  const createSupplier = async (e) => {
    e.preventDefault();
    if (isAdmin && !selectedBranch) { toast.error('Select a branch first'); return; }
    try {
      const payload = { ...supplierForm };
      if (isAdmin) payload.branch_id = selectedBranch;
      await api.post('/suppliers', payload);
      setSupplierForm({ name: '', gstin: '', phone: '', address: '' });
      toast.success('Supplier added');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const createPurchase = async (e) => {
    e.preventDefault();
    if (isAdmin && !selectedBranch) { toast.error('Select a branch first'); return; }
    try {
      const payload = { ...purchaseForm };
      if (isAdmin) payload.branch_id = selectedBranch;
      await api.post('/purchases', payload);
      setPurchaseForm({ supplier_id: '', purchase_date: '', metal_type: 'GOLD', gross_weight: '', tunch_percentage: '', subtotal_amount: '', tax_amount: '', is_jangad: false });
      toast.success('Purchase entry saved');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const verifyTunch = async (id) => {
    const tunch_percentage = prompt('Enter the tunch (purity) %:');
    if (!tunch_percentage) return;
    const subtotal_amount = prompt('Subtotal amount (₹):');
    try {
      await api.patch(`/purchases/${id}/verify-tunch`, { tunch_percentage, subtotal_amount });
      toast.success('Verified');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const receiveIntoInventory = async (purchase) => {
    const purchaseLocations = locations.filter((l) => l.branch_id === purchase.branch_id);
    if (purchaseLocations.length === 0) { toast.error('Create a storage location for this branch first'); return; }
    if (products.length === 0) { toast.error('Create at least one design under Designs & Categories first'); return; }

    const productList = products.map((p) => `${p.id}: ${p.product_name} (${p.design_code})`).join('\n');
    const productMasterId = prompt(`Which design is this stock? Enter the product ID:\n${productList}`);
    if (!productMasterId) return;

    const locationList = purchaseLocations.map((l) => `${l.id}: ${l.name}`).join('\n');
    const locationId = prompt(`Enter the location ID:\n${locationList}`);
    if (!locationId) return;

    const isBulk = confirm('Is this a bulk lot of identical pieces? Press Cancel for a single unique piece.');
    let itemPayload = {
      location_id: locationId, product_master_id: productMasterId,
      mode: isBulk ? 'BULK' : 'PIECE', channel: 'RETAIL', is_tray_display: false,
    };

    if (isBulk) {
      const totalPieces = prompt('Total pieces:');
      itemPayload.total_pieces = totalPieces;
      itemPayload.total_gross_weight = purchase.gross_weight;
      itemPayload.total_net_weight = purchase.gross_weight;
    } else {
      itemPayload.gross_weight = purchase.gross_weight;
    }

    try {
      const res = await api.post(`/purchases/${purchase.id}/receive-into-inventory`, { items: [itemPayload] });
      toast.success(`${res.data.items_created.length} item(s) added to inventory`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Suppliers & Purchases</h1>

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

      <form className="card" onSubmit={createSupplier}>
        <h3 style={{ marginBottom: 12 }}>Add Supplier</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <div className="form-group"><label>Name</label><input value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} required /></div>
          <div className="form-group"><label>GSTIN</label><input value={supplierForm.gstin} onChange={(e) => setSupplierForm({ ...supplierForm, gstin: e.target.value })} /></div>
          <div className="form-group"><label>Phone</label><input value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></div>
          <div className="form-group"><label>Address</label><input value={supplierForm.address} onChange={(e) => setSupplierForm({ ...supplierForm, address: e.target.value })} /></div>
        </div>
        <button className="btn" type="submit">Add Supplier</button>
      </form>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Supplier Ledger Balances</h3>
        <table>
          <thead><tr><th>Name</th><th>GSTIN</th><th>Currency Balance</th><th>Pure Metal (24K g)</th></tr></thead>
          <tbody>
            {suppliers.map((v) => (
              <tr key={v.id}>
                <td>{v.name}</td><td>{v.gstin}</td>
                <td>₹{v.SupplierLedger?.currency_balance}</td>
                <td>{v.SupplierLedger?.pure_metal_balance_24k_grams} g</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card" onSubmit={createPurchase}>
        <h3 style={{ marginBottom: 12 }}>New Purchase Entry</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          <div className="form-group">
            <label>Supplier</label>
            <select value={purchaseForm.supplier_id} onChange={(e) => setPurchaseForm({ ...purchaseForm, supplier_id: e.target.value })} required>
              <option value="">Select supplier</option>
              {suppliers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Date</label><input type="date" value={purchaseForm.purchase_date} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchase_date: e.target.value })} required /></div>
          <div className="form-group">
            <label>Metal</label>
            <select value={purchaseForm.metal_type} onChange={(e) => setPurchaseForm({ ...purchaseForm, metal_type: e.target.value })}>
              <option>GOLD</option><option>SILVER</option><option>PLATINUM</option><option>BANDHEL</option>
            </select>
          </div>
          <div className="form-group"><label>Gross Weight (g)</label><input type="number" step="0.001" value={purchaseForm.gross_weight} onChange={(e) => setPurchaseForm({ ...purchaseForm, gross_weight: e.target.value })} required /></div>
          <div className="form-group">
            <label>
              <input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={purchaseForm.is_jangad} onChange={(e) => setPurchaseForm({ ...purchaseForm, is_jangad: e.target.checked })} />
              Jangad (tunch not verified yet)
            </label>
          </div>
          {!purchaseForm.is_jangad && (
            <>
              <div className="form-group"><label>Tunch %</label><input type="number" step="0.01" value={purchaseForm.tunch_percentage} onChange={(e) => setPurchaseForm({ ...purchaseForm, tunch_percentage: e.target.value })} /></div>
              <div className="form-group"><label>Subtotal (₹)</label><input type="number" value={purchaseForm.subtotal_amount} onChange={(e) => setPurchaseForm({ ...purchaseForm, subtotal_amount: e.target.value })} /></div>
              <div className="form-group"><label>Tax (₹)</label><input type="number" value={purchaseForm.tax_amount} onChange={(e) => setPurchaseForm({ ...purchaseForm, tax_amount: e.target.value })} /></div>
            </>
          )}
        </div>
        <button className="btn" type="submit">Save Purchase</button>
      </form>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Purchase History</h3>
        <table>
          <thead><tr><th>Date</th><th>Supplier</th><th>Metal</th><th>Gross Wt</th><th>Tunch %</th><th>Status</th><th>Inventory</th><th></th></tr></thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td>{p.purchase_date}</td>
                <td>{p.Supplier?.name}</td>
                <td>{p.metal_type}</td>
                <td>{p.gross_weight}g</td>
                <td>{p.tunch_percentage ?? '—'}</td>
                <td><span className={`badge ${p.verification_status === 'VERIFIED' ? 'green' : 'yellow'}`}>{p.verification_status}</span></td>
                <td><span className={`badge ${p.received_into_inventory ? 'green' : 'yellow'}`}>{p.received_into_inventory ? 'Received' : 'Not Received'}</span></td>
                <td>
                  {p.verification_status === 'PENDING_TUNCH' && <button className="btn" onClick={() => verifyTunch(p.id)}>Verify Tunch</button>}
                  {p.verification_status === 'VERIFIED' && !p.received_into_inventory && (
                    <button className="btn" style={{ background: '#059669' }} onClick={() => receiveIntoInventory(p)}>Receive into Inventory</button>
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
