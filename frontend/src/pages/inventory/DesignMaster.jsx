import React, { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios';
import { toast } from 'react-toastify';
import useBranchScope, { BranchPicker } from '../../hooks/useBranchScope';
import useLocationOptions from '../../hooks/useLocationOptions';
import { Link } from 'react-router-dom';
import ImageUpload from '../../components/ImageUpload';
import DesignImage from '../../components/DesignImage';
import { Modal, errorMessage, formatDate, grams } from '../../components/ui';

const GENDERS = ['MALE', 'FEMALE', 'UNISEX', 'KIDS'];
const METALS = ['GOLD', 'SILVER', 'PLATINUM', 'BANDHEL'];
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function DesignMaster() {
  const scope = useBranchScope();
  const { wholesaleBoxes } = useLocationOptions(scope);
  const [categories, setCategories] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [purities, setPurities] = useState([]);
  const [openings, setOpenings] = useState({ rows: [], category_totals: [], total_opening_weight: 0 });
  const [newCategory, setNewCategory] = useState({ name: '', code: '' });
  const [form, setForm] = useState({
    category_id: '', design_code: '', product_name: '', gender_category: 'UNISEX',
    metal_type: 'GOLD', default_purity: '22K', item_subtype: '', box_location_id: '', default_image_url: '',
  });
  const [openingForm, setOpeningForm] = useState({ product_master_id: '', opening_pieces: '', opening_weight: '', as_on_date: todayIso(), notes: '' });
  const [correcting, setCorrecting] = useState(null); // opening entry being corrected (admin)
  const [correctWeight, setCorrectWeight] = useState('');
  const [correctPieces, setCorrectPieces] = useState('');

  const load = useCallback(() => {
    api.get('/categories').then((res) => setCategories(res.data));
    api.get('/products').then((res) => setDesigns(res.data));
    api.get('/purities').then((res) => setPurities(res.data));
  }, []);

  const loadOpenings = useCallback(() => {
    if (!scope.ready) return;
    api.get('/opening-stock', { params: scope.params })
      .then((res) => setOpenings(res.data))
      .catch((err) => toast.error(errorMessage(err, 'Could not load opening stock.')));
  }, [scope.ready, scope.branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(load, [load]);
  useEffect(loadOpenings, [loadOpenings]);

  const addCategory = async (e) => {
    e.preventDefault();
    try {
      await api.post('/categories', newCategory);
      toast.success('Category added');
      setNewCategory({ name: '', code: '' });
      load();
    } catch (err) { toast.error(errorMessage(err, 'Could not add the category.')); }
  };

  const addDesign = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/products', { ...form, ...(scope.isAdmin ? { place_branch_id: scope.branchId } : {}) });
      toast.success(data.placement
        ? 'Design saved and placed in its box. Its quantity stays "not final" until stock is added.'
        : 'Design saved.');
      setForm({ category_id: '', design_code: '', product_name: '', gender_category: 'UNISEX', metal_type: 'GOLD', default_purity: '22K', item_subtype: '', box_location_id: '', default_image_url: '' });
      load(); loadOpenings();
    } catch (err) { toast.error(errorMessage(err, 'Could not save the design.')); }
  };

  const addOpening = async (e) => {
    e.preventDefault();
    try {
      await api.post('/opening-stock', { ...openingForm, ...scope.params });
      toast.success('Opening stock saved');
      setOpeningForm({ product_master_id: '', opening_pieces: '', opening_weight: '', as_on_date: todayIso(), notes: '' });
      loadOpenings();
    } catch (err) { toast.error(errorMessage(err, 'Could not save the opening stock.')); }
  };

  const saveCorrection = async () => {
    try {
      await api.patch(`/opening-stock/${correcting.id}`, { opening_weight: correctWeight, opening_pieces: correctPieces });
      toast.success('Opening stock corrected');
      setCorrecting(null);
      loadOpenings();
    } catch (err) { toast.error(errorMessage(err, 'Could not correct the opening stock.')); }
  };

  const openingByDesign = {};
  openings.rows.forEach((o) => { openingByDesign[o.product_master_id] = o; });
  const openingByCategory = {};
  openings.category_totals.forEach((c) => { openingByCategory[c.category_id] = c.opening_weight; });
  const designsWithoutOpening = designs.filter((d) => !openingByDesign[d.id]);

  return (
    <div>
      <h1>Designs & Categories</h1>
      <p style={{ color: '#6b7280', marginTop: -10 }}>
        Create designs such as "Male Ring" or "Female Necklace" once. When adding stock you pick the design, which is why the same design never creates a duplicate row - only its weight is merged.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
        <div className="card">
          <h3>New category</h3>
          <form onSubmit={addCategory}>
            <div className="form-group">
              <label>Name (e.g. Ring, Necklace)</label>
              <input value={newCategory.name} onChange={(e) => setNewCategory({ ...newCategory, name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Code (e.g. RING)</label>
              <input value={newCategory.code} onChange={(e) => setNewCategory({ ...newCategory, code: e.target.value })} required />
            </div>
            <button className="btn" type="submit">Add Category</button>
          </form>

          <h4 style={{ marginTop: 20 }}>Existing Categories</h4>
          <table>
            <thead><tr><th>Category</th><th>Code</th><th style={{ textAlign: 'right' }}>Opening stock</th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.code}</td>
                  <td style={{ textAlign: 'right' }}>{openingByCategory[c.id] ? grams(openingByCategory[c.id]) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>New design</h3>
          <form onSubmit={addDesign}>
            <div className="form-group">
              <label>Category</label>
              <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Design Code (unique, e.g. MR-001)</label>
              <input value={form.design_code} onChange={(e) => setForm({ ...form, design_code: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Product Name (e.g. Male Gold Ring)</label>
              <input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Item Subtype (optional, e.g. Solitaire)</label>
              <input value={form.item_subtype} onChange={(e) => setForm({ ...form, item_subtype: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={form.gender_category} onChange={(e) => setForm({ ...form, gender_category: e.target.value })}>
                {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Metal</label>
              <select value={form.metal_type} onChange={(e) => setForm({ ...form, metal_type: e.target.value })}>
                {METALS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Default Purity</label>
              <select value={form.default_purity} onChange={(e) => setForm({ ...form, default_purity: e.target.value })}>
                {purities.filter((p) => p.metal_type === form.metal_type).map((p) => <option key={p.id} value={p.purity_code}>{p.purity_code}</option>)}
                {purities.length === 0 && <option value="22K">22K</option>}
              </select>
            </div>
            <div className="form-group">
              <label>Store in box (optional)</label>
              <select value={form.box_location_id} onChange={(e) => setForm({ ...form, box_location_id: e.target.value })}>
                <option value="">Decide later (goes to the "Unallocated" box)</option>
                {wholesaleBoxes.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
              <p className="field-hint">You can move it to another box later from Storage Map. A design can also be in several boxes.</p>
            </div>
            <ImageUpload label="Design photo (optional)" value={form.default_image_url} onChange={(url) => setForm({ ...form, default_image_url: url })} />
            <button className="btn" type="submit">Save Design</button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3>Opening stock</h3>
            <p style={{ color: '#6b7280', margin: '4px 0 0' }}>
              The wholesale stock you already have when you start using the system, by design: quantity (pieces) and weight (grams).
              Enter it once per design. From then on: Closing = Opening + Purchase - Sale.
            </p>
          </div>
          <BranchPicker scope={scope} />
        </div>

        <form onSubmit={addOpening} style={{ marginTop: 16 }}>
          <div className="form-grid">
            <div className="form-group">
              <label>Design</label>
              <select value={openingForm.product_master_id} onChange={(e) => setOpeningForm({ ...openingForm, product_master_id: e.target.value })} required>
                <option value="">Select design</option>
                {designsWithoutOpening.map((d) => (
                  <option key={d.id} value={d.id}>{d.Category?.name} - {d.product_name} ({d.design_code})</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Box (optional)</label>
              <select value={openingForm.box_location_id || ''} onChange={(e) => setOpeningForm({ ...openingForm, box_location_id: e.target.value })}>
                <option value="">Where the design already is</option>
                {wholesaleBoxes.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Opening quantity (pieces)</label>
              <input type="number" step="1" min="0" value={openingForm.opening_pieces}
                onChange={(e) => setOpeningForm({ ...openingForm, opening_pieces: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Opening weight (g)</label>
              <input type="number" step="0.001" min="0" value={openingForm.opening_weight}
                onChange={(e) => setOpeningForm({ ...openingForm, opening_weight: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>As on date</label>
              <input type="date" value={openingForm.as_on_date}
                onChange={(e) => setOpeningForm({ ...openingForm, as_on_date: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Note (optional)</label>
              <input value={openingForm.notes} onChange={(e) => setOpeningForm({ ...openingForm, notes: e.target.value })} />
            </div>
          </div>
          <button className="btn" type="submit" disabled={!scope.ready}>Save Opening Stock</button>
        </form>

        <table style={{ marginTop: 20 }}>
          <thead>
            <tr><th>Category</th><th>Design</th><th>As on</th><th style={{ textAlign: 'right' }}>Quantity</th><th style={{ textAlign: 'right' }}>Opening weight</th><th>Note</th>{scope.isAdmin && <th />}</tr>
          </thead>
          <tbody>
            {openings.rows.length === 0 && (
              <tr><td colSpan={scope.isAdmin ? 7 : 6} style={{ color: '#6b7280' }}>No opening stock entered yet.</td></tr>
            )}
            {openings.rows.map((o) => (
              <tr key={o.id}>
                <td>{o.Category?.name}</td>
                <td>{o.ProductMaster?.product_name} ({o.ProductMaster?.design_code})</td>
                <td>{formatDate(o.as_on_date)}</td>
                <td style={{ textAlign: 'right' }}>{o.opening_pieces}</td>
                <td style={{ textAlign: 'right' }}>{grams(o.opening_weight)}</td>
                <td>{o.notes || ''}</td>
                {scope.isAdmin && (
                  <td><button className="btn btn-secondary btn-sm" onClick={() => { setCorrecting(o); setCorrectWeight(o.opening_weight); setCorrectPieces(o.opening_pieces); }}>Correct</button></td>
                )}
              </tr>
            ))}
            {openings.rows.length > 0 && (
              <tr>
                <td colSpan={3}><strong>Total</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{openings.rows.reduce((n, r) => n + Number(r.opening_pieces || 0), 0)}</strong></td>
                <td style={{ textAlign: 'right' }}><strong>{grams(openings.total_opening_weight)}</strong></td>
                <td colSpan={scope.isAdmin ? 2 : 1} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>All designs</h3>
        <table>
          <thead><tr><th>Photo</th><th>Code</th><th>Name</th><th>Category</th><th>Gender</th><th>Metal</th><th>Purity</th><th style={{ textAlign: 'right' }}>Opening stock</th></tr></thead>
          <tbody>
            {designs.map((d) => (
              <tr key={d.id}>
                <td><DesignImage src={d.default_image_url} alt={d.product_name} size={40} /></td>
                <td><Link to={`/inventory/designs/${d.id}`}>{d.design_code}</Link></td><td><Link to={`/inventory/designs/${d.id}`}>{d.product_name}</Link></td><td>{d.Category?.name}</td>
                <td>{d.gender_category}</td><td>{d.metal_type}</td><td>{d.default_purity}</td>
                <td style={{ textAlign: 'right' }}>{openingByDesign[d.id] ? grams(openingByDesign[d.id].opening_weight) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(correcting)}
        title="Correct opening stock"
        onClose={() => setCorrecting(null)}
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setCorrecting(null)}>Cancel</button>
            <button className="btn" onClick={saveCorrection}>Save correction</button>
          </>
        )}
      >
        {correcting && (
          <>
            <p>{correcting.ProductMaster?.product_name} ({correcting.ProductMaster?.design_code})</p>
            <div className="form-group">
              <label>Opening quantity (pieces)</label>
              <input type="number" step="1" min="0" value={correctPieces} onChange={(e) => setCorrectPieces(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Opening weight (g)</label>
              <input type="number" step="0.001" min="0" value={correctWeight} onChange={(e) => setCorrectWeight(e.target.value)} />
              <p className="field-hint">The wholesale stock changes by the difference only. It cannot go below what was already sold or moved to a tray.</p>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
