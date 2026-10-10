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

  const [supplierForm, setSupplierForm] = useState({ name: '', gstin: '', phone: '', address: '', contact_person: '', email: '', city: '', state: '', pincode: '', pan_number: '', bank_name: '', bank_account_number: '', bank_ifsc: '' });
  const [purchaseForm, setPurchaseForm] = useState({
    supplier_id: '', purchase_date: '', metal_type: 'GOLD', gross_weight: '',
    tunch_percentage: '', subtotal_amount: '', tax_amount: '', is_jangad: false, gst_type: 'WITH_GST',
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
      setSupplierForm({ name: '', gstin: '', phone: '', address: '', contact_person: '', email: '', city: '', state: '', pincode: '', pan_number: '', bank_name: '', bank_account_number: '', bank_ifsc: '' });
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
      setPurchaseForm({ supplier_id: '', purchase_date: '', metal_type: 'GOLD', gross_weight: '', tunch_percentage: '', subtotal_amount: '', tax_amount: '', is_jangad: false, gst_type: 'WITH_GST' });
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

  // Pick the design (which also fixes the category); the quantity and the purchase weight land in
  // the wholesale store. No HUID at this stage.
  const receiveIntoInventory = async (purchase) => {
    const purchaseLocations = locations.filter((l) => l.branch_id === purchase.branch_id);
    if (purchaseLocations.length === 0) { toast.error('Create a storage location for this branch first'); return; }
    if (products.length === 0) { toast.error('Create at least one design under Designs & Categories first'); return; }

    const productList = products.map((p) => `${p.id}: ${p.Category?.name || 'No category'} - ${p.product_name} (${p.design_code})`).join('\n');
    const productMasterId = prompt(`Which design is this stock? Enter the design ID:\n${productList}`);
    if (!productMasterId) return;

    const pieces = prompt('Quantity (number of pieces) received?', '0');
    if (pieces === null) return;

    const itemPayload = {
      product_master_id: productMasterId,   // stock lands in the branch's Wholesale Store automatically
      mode: 'BULK',
      total_pieces: Number(pieces || 0),
      total_gross_weight: purchase.gross_weight,
      total_net_weight: purchase.gross_weight,
    };

    try {
      const res = await api.post(`/purchases/${purchase.id}/receive-into-inventory`, { items: [itemPayload] });
      toast.success(`${res.data.items_created.length} item(s) added to wholesale stock`);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const printReceipt = async (id) => {
    try {
      const { data: r } = await api.get(`/purchases/${id}/receipt`);
      const sp = r.supplier || {};
      const w = window.open('', '_blank');
      w.document.write(`<html><head><title>Receipt ${r.receipt_number}</title></head><body style="font-family:sans-serif;padding:24px;max-width:640px">
        <h2>Purchase Receipt</h2>
        <p><b>Receipt:</b> ${r.receipt_number} &nbsp; <b>Date:</b> ${r.purchase_date}</p>
        <h4>Supplier</h4>
        <p>${sp.name || ''}<br/>${sp.contact_person || ''} ${sp.phone || ''} ${sp.email || ''}<br/>${sp.address || ''}<br/>GSTIN: ${sp.gstin || '-'} &nbsp; PAN: ${sp.pan_number || '-'}<br/>Bank: ${sp.bank_name || '-'} / ${sp.bank_account_number || '-'} / ${sp.bank_ifsc || '-'}</p>
        <h4>Material</h4>
        <p>${r.metal_type} &mdash; ${r.gross_weight} g &mdash; Tunch: ${r.tunch_percentage ?? 'pending'}% &mdash; Pure (24K eq.): ${r.pure_weight_24k_equivalent ?? '-'} g</p>
        <h4>Amount (${r.gst_note})</h4>
        <p>Subtotal: ₹${r.subtotal_amount}<br/>GST charged: ₹${r.tax_amount}<br/>Reverse-charge GST (payable by us): ₹${r.reverse_charge_gst_amount}<br/><b>Total payable to supplier: ₹${r.total_amount}</b></p>
        <script>window.print()<\/script></body></html>`);
      w.document.close();
    } catch (err) { toast.error(err.response?.data?.error || 'Could not load receipt'); }
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
          <div className="form-group"><label>Contact Person</label><input value={supplierForm.contact_person} onChange={(e) => setSupplierForm({ ...supplierForm, contact_person: e.target.value })} /></div>
          <div className="form-group"><label>Email</label><input value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></div>
          <div className="form-group"><label>City</label><input value={supplierForm.city} onChange={(e) => setSupplierForm({ ...supplierForm, city: e.target.value })} /></div>
          <div className="form-group"><label>State</label><input value={supplierForm.state} onChange={(e) => setSupplierForm({ ...supplierForm, state: e.target.value })} /></div>
          <div className="form-group"><label>Pincode</label><input value={supplierForm.pincode} onChange={(e) => setSupplierForm({ ...supplierForm, pincode: e.target.value })} /></div>
          <div className="form-group"><label>PAN</label><input value={supplierForm.pan_number} onChange={(e) => setSupplierForm({ ...supplierForm, pan_number: e.target.value })} /></div>
          <div className="form-group"><label>Bank Name</label><input value={supplierForm.bank_name} onChange={(e) => setSupplierForm({ ...supplierForm, bank_name: e.target.value })} /></div>
          <div className="form-group"><label>Bank Account No.</label><input value={supplierForm.bank_account_number} onChange={(e) => setSupplierForm({ ...supplierForm, bank_account_number: e.target.value })} /></div>
          <div className="form-group"><label>Bank IFSC</label><input value={supplierForm.bank_ifsc} onChange={(e) => setSupplierForm({ ...supplierForm, bank_ifsc: e.target.value })} /></div>
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
              <option>GOLD</option><option>SILVER</option>
            </select>
          </div>
          <div className="form-group">
            <label>GST Type</label>
            <select value={purchaseForm.gst_type} onChange={(e) => setPurchaseForm({ ...purchaseForm, gst_type: e.target.value })}>
              <option value="WITH_GST">With GST (supplier charges GST)</option>
              <option value="WITHOUT_GST">Without GST</option>
              <option value="REVERSE_GST">Reverse charge (we pay GST to govt)</option>
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
              <div className="form-group"><label>{purchaseForm.gst_type === 'REVERSE_GST' ? 'Reverse-charge GST (₹)' : 'Tax (₹)'}</label><input type="number" value={purchaseForm.tax_amount} onChange={(e) => setPurchaseForm({ ...purchaseForm, tax_amount: e.target.value })} /></div>
            </>
          )}
        </div>
        <button className="btn" type="submit">Save Purchase</button>
      </form>

      <div className="card">
        <h3 style={{ marginBottom: 12 }}>Purchase History</h3>
        <table>
          <thead><tr><th>Date</th><th>Supplier</th><th>Metal</th><th>GST</th><th>Total (₹)</th><th>Gross Wt</th><th>Tunch %</th><th>Status</th><th>Inventory</th><th></th></tr></thead>
          <tbody>
            {purchases.map((p) => (
              <tr key={p.id}>
                <td>{p.purchase_date}</td>
                <td>{p.Supplier?.name}</td>
                <td>{p.metal_type}</td>
                <td>{p.gst_type}</td>
                <td>{p.total_amount}</td>
                <td>{p.gross_weight}g</td>
                <td>{p.tunch_percentage ?? '—'}</td>
                <td><span className={`badge ${p.verification_status === 'VERIFIED' ? 'green' : 'yellow'}`}>{p.verification_status}</span></td>
                <td><span className={`badge ${p.received_into_inventory ? 'green' : 'yellow'}`}>{p.received_into_inventory ? 'Received' : 'Not Received'}</span></td>
                <td>
                  <button className="btn" style={{ marginRight: 6, background: '#6b7280' }} onClick={() => printReceipt(p.id)}>Receipt</button>
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
