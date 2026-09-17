import React, { useEffect, useState } from 'react';
import api from '../../api/axios';
import { toast } from 'react-toastify';

const GENDERS = ['MALE', 'FEMALE', 'UNISEX', 'KIDS'];
const METALS = ['GOLD', 'SILVER', 'PLATINUM', 'BANDHEL'];

export default function DesignMaster() {
  const [categories, setCategories] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [purities, setPurities] = useState([]);
  const [newCategory, setNewCategory] = useState({ name: '', code: '' });
  const [form, setForm] = useState({
    category_id: '', design_code: '', product_name: '', gender_category: 'UNISEX',
    metal_type: 'GOLD', default_purity: '22K', item_subtype: '',
  });

  const load = () => {
    api.get('/categories').then((res) => setCategories(res.data));
    api.get('/products').then((res) => setDesigns(res.data));
    api.get('/purities').then((res) => setPurities(res.data));
  };
  useEffect(load, []);

  const addCategory = async (e) => {
    e.preventDefault();
    try {
      await api.post('/categories', newCategory);
      toast.success('Category added');
      setNewCategory({ name: '', code: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const addDesign = async (e) => {
    e.preventDefault();
    try {
      await api.post('/products', form);
      toast.success('Design saved. Adding stock for this design will now reuse it instead of creating a duplicate.');
      setForm({ category_id: '', design_code: '', product_name: '', gender_category: 'UNISEX', metal_type: 'GOLD', default_purity: '22K', item_subtype: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  return (
    <div>
      <h1>Designs & Categories</h1>
      <p style={{ color: '#6b7280', marginTop: -10 }}>
        Create designs such as "Male Ring" or "Female Necklace" once. When adding stock you pick the design, which is why the same design never creates a duplicate row - only its quantity is merged.
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
          <ul>{categories.map((c) => <li key={c.id}>{c.name} ({c.code})</li>)}</ul>
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
            <button className="btn" type="submit">Save Design</button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>All designs</h3>
        <table>
          <thead><tr><th>Code</th><th>Name</th><th>Category</th><th>Gender</th><th>Metal</th><th>Purity</th></tr></thead>
          <tbody>
            {designs.map((d) => (
              <tr key={d.id}>
                <td>{d.design_code}</td><td>{d.product_name}</td><td>{d.Category?.name}</td>
                <td>{d.gender_category}</td><td>{d.metal_type}</td><td>{d.default_purity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
