// src/pages/inventory/ItemForm.jsx
//
// Adding stock in two steps:
//   Step 1 - pick the design. As soon as category + gender + metal are chosen, the matching
//            design is looked up automatically. If it already exists, its details and current
//            price fill in, and the new quantity MERGES into the existing lot instead of
//            creating a duplicate row.
//   Step 2 - enter the lot itself.
//
// The channel is now a single choice, not a set of checkboxes. A lot is either retail stock or
// wholesale stock, decided by how it arrived, and that is the price it will sell at. Tray
// display is kept separate because it only describes where the stock physically sits.
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Card, Alert, money, errorMessage } from '../../components/ui';

const GENDERS = ['MALE', 'FEMALE', 'UNISEX', 'KIDS'];
const METALS = ['GOLD', 'SILVER', 'PLATINUM', 'BANDHEL'];
const MAX_IMAGES = 5;

export default function ItemForm() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [locations, setLocations] = useState([]);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [categories, setCategories] = useState([]);
  const [mode, setMode] = useState('BULK');
  const [loadError, setLoadError] = useState('');

  // ---- Step 1: design lookup ----
  const [lookup, setLookup] = useState({
    category_id: '', gender_category: 'UNISEX', metal_type: 'GOLD', default_purity: '22K', item_subtype: '',
  });
  const [lookupResult, setLookupResult] = useState(null); // null = not searched yet
  const [searching, setSearching] = useState(false);
  const [newDesign, setNewDesign] = useState({ design_code: '', product_name: '' });

  // ---- Step 2: the lot ----
  const [form, setForm] = useState({
    location_id: '', huid_code: '', low_stock_threshold: '',
    total_pieces: '', total_gross_weight: '', total_net_weight: '',
    gross_weight: '', less_weight: '', purity: '',
    source_type: 'DIRECT_ENTRY',
    channel: 'RETAIL',
    is_tray_display: false,
    override_price: '',
  });
  const [stones, setStones] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);
  const [imagePreviews, setImagePreviews] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/categories')
      .then((res) => setCategories(Array.isArray(res.data) ? res.data : []))
      .catch((err) => setLoadError(errorMessage(err, 'Could not load categories.')));

    if (isAdmin) {
      api.get('/branches')
        .then((res) => {
          const list = Array.isArray(res.data) ? res.data : [];
          setBranches(list);
          if (list.length > 0) setSelectedBranch(String(list[0].id));
        })
        .catch((err) => setLoadError(errorMessage(err, 'Could not load branches.')));
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && !selectedBranch) return;
    const query = isAdmin && selectedBranch ? `?branch_id=${selectedBranch}` : '';
    api.get(`/locations${query}`)
      .then((res) => setLocations(Array.isArray(res.data) ? res.data : []))
      .catch(() => setLocations([]));
  }, [selectedBranch, isAdmin]);

  // As soon as category + gender + metal are set, find the matching design.
  useEffect(() => {
    if (!lookup.category_id || !lookup.gender_category || !lookup.metal_type) {
      setLookupResult(null);
      return undefined;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      const params = new URLSearchParams(lookup).toString();
      api.get(`/products/lookup?${params}`)
        .then((res) => {
          setLookupResult(res.data);
          if (res.data?.found) {
            setForm((f) => ({ ...f, purity: res.data.product.default_purity }));
          }
        })
        .catch(() => setLookupResult(null))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup.category_id, lookup.gender_category, lookup.metal_type, lookup.default_purity, lookup.item_subtype]);

  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (imageFiles.length + files.length > MAX_IMAGES) {
      toast.warn(`You can attach up to ${MAX_IMAGES} images.`);
    }
    const combined = [...imageFiles, ...files].slice(0, MAX_IMAGES);
    setImageFiles(combined);
    setImagePreviews(combined.map((f) => URL.createObjectURL(f)));
    e.target.value = '';
  };

  const removeImage = (idx) => {
    const files = imageFiles.filter((_, i) => i !== idx);
    setImageFiles(files);
    setImagePreviews(files.map((f) => URL.createObjectURL(f)));
  };

  const addStone = () => setStones([...stones, {
    stone_type: 'NATURAL_DIAMOND', stone_pieces_count: 1, stone_weight_carat: 0, stone_rate: 0,
  }]);
  const updateStone = (idx, field, value) => {
    const copy = [...stones];
    copy[idx] = { ...copy[idx], [field]: value };
    setStones(copy);
  };
  const removeStone = (idx) => setStones(stones.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isAdmin && !selectedBranch) { toast.error('Select a branch first.'); return; }
    if (!lookup.category_id) { toast.error('Select a category first.'); return; }
    if (!form.location_id) { toast.error('Select a storage location.'); return; }

    setSubmitting(true);
    try {
      let productMasterId = lookupResult?.found ? lookupResult.product.id : null;

      if (!productMasterId) {
        if (!newDesign.design_code.trim() || !newDesign.product_name.trim()) {
          toast.error('This is a new design — enter a design code and a product name.');
          setSubmitting(false);
          return;
        }
        const { data: product } = await api.post('/products', {
          category_id: lookup.category_id,
          design_code: newDesign.design_code.trim(),
          product_name: newDesign.product_name.trim(),
          item_subtype: lookup.item_subtype || null,
          gender_category: lookup.gender_category,
          metal_type: lookup.metal_type,
          default_purity: lookup.default_purity,
        });
        productMasterId = product.id;
      }

      const payload = { ...form, mode, stones, product_master_id: productMasterId };
      if (isAdmin) payload.branch_id = selectedBranch;
      if (!payload.override_price) delete payload.override_price;

      const { data: createdItem } = await api.post('/items', payload);

      if (imageFiles.length > 0) {
        const formData = new FormData();
        imageFiles.forEach((file) => formData.append('images', file));
        await api.post(`/items/${createdItem.id}/images`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      toast.success(
        lookupResult?.found
          ? 'Stock merged into the existing lot for this design.'
          : 'New design created and stock added.',
      );
      navigate('/inventory/items');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save this stock.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Add stock"
        subtitle="Pick the design first — if it already exists, this quantity merges into the existing lot rather than creating a duplicate."
        actions={(
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/inventory/items')}>
            Cancel
          </button>
        )}
      />

      {loadError && <Alert tone="error" title="Some data could not be loaded">{loadError}</Alert>}

      <form onSubmit={handleSubmit}>
        <Card title="Step 1 · Which design is this?">
          <div className="form-grid">
            <div className="form-group">
              <label>Category *</label>
              <select
                value={lookup.category_id}
                onChange={(e) => setLookup({ ...lookup, category_id: e.target.value })}
                required
              >
                <option value="">Select category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select
                value={lookup.gender_category}
                onChange={(e) => setLookup({ ...lookup, gender_category: e.target.value })}
              >
                {GENDERS.map((g) => <option key={g} value={g}>{g.charAt(0) + g.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Metal</label>
              <select
                value={lookup.metal_type}
                onChange={(e) => setLookup({ ...lookup, metal_type: e.target.value })}
              >
                {METALS.map((m) => <option key={m} value={m}>{m.charAt(0) + m.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Purity</label>
              <input
                value={lookup.default_purity}
                onChange={(e) => setLookup({ ...lookup, default_purity: e.target.value })}
                placeholder="22K"
              />
            </div>
            <div className="form-group">
              <label>Subtype</label>
              <input
                value={lookup.item_subtype}
                onChange={(e) => setLookup({ ...lookup, item_subtype: e.target.value })}
                placeholder="Optional, e.g. Solitaire"
              />
            </div>
          </div>

          {searching && (
            <p className="muted" style={{ fontSize: 13 }}>
              <span className="spinner" style={{ verticalAlign: 'middle', marginRight: 8 }} />
              Looking for a matching design…
            </p>
          )}

          {!searching && lookupResult?.found && (
            <Alert tone="success" title={`Design found: ${lookupResult.product.product_name} (${lookupResult.product.design_code})`}>
              {lookupResult.existing_item ? (
                <>
                  This design is already in stock at{' '}
                  <strong>{money(lookupResult.pricing?.price?.final_price)}</strong> per piece
                  {lookupResult.pricing?.channel
                    ? ` (${lookupResult.pricing.channel.toLowerCase()})`
                    : ''}.
                  Just enter the new weight and quantity below — it will merge into the existing lot.
                </>
              ) : (
                'This design already exists, so no duplicate will be created. Enter the lot details below.'
              )}
            </Alert>
          )}

          {!searching && lookupResult && !lookupResult.found && (
            <Alert tone="warn" title="This design is being added for the first time">
              Give it a name and code — next time it will be found and reused automatically.
              <div className="form-grid-2" style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label>Design code *</label>
                  <input
                    value={newDesign.design_code}
                    onChange={(e) => setNewDesign({ ...newDesign, design_code: e.target.value })}
                    placeholder="e.g. MR-002"
                  />
                </div>
                <div className="form-group">
                  <label>Product name *</label>
                  <input
                    value={newDesign.product_name}
                    onChange={(e) => setNewDesign({ ...newDesign, product_name: e.target.value })}
                    placeholder="e.g. Male Gold Ring — Floral"
                  />
                </div>
              </div>
            </Alert>
          )}
        </Card>

        <Card title="Step 2 · Sales channel" note="An item sells on one channel only — whichever way it came in.">
          <div className="choice-row">
            <label className={`choice ${form.channel === 'RETAIL' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="channel"
                value="RETAIL"
                checked={form.channel === 'RETAIL'}
                onChange={() => setForm({ ...form, channel: 'RETAIL' })}
              />
              <span>
                <span className="choice-label">Retail stock</span>
                <span className="choice-desc">Priced with the retail making charge and wastage, and billed at that price.</span>
              </span>
            </label>
            <label className={`choice ${form.channel === 'WHOLESALE' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="channel"
                value="WHOLESALE"
                checked={form.channel === 'WHOLESALE'}
                onChange={() => setForm({ ...form, channel: 'WHOLESALE' })}
              />
              <span>
                <span className="choice-label">Wholesale stock</span>
                <span className="choice-desc">Priced with the wholesale making charge and wastage, and billed at that price.</span>
              </span>
            </label>
          </div>

          <label className="switch-inline" style={{ marginTop: 14 }}>
            <input
              type="checkbox"
              checked={form.is_tray_display}
              onChange={(e) => setForm({ ...form, is_tray_display: e.target.checked })}
            />
            Keep this lot on tray display
          </label>
          <p className="field-hint">Tray display only says where the stock sits. It does not affect the price.</p>
        </Card>

        <Card title="Step 3 · Lot details">
          <div className="form-grid">
            {isAdmin && (
              <div className="form-group">
                <label>Branch *</label>
                <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} required>
                  <option value="">Select branch</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Storage location *</label>
              <select
                value={form.location_id}
                onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                required
              >
                <option value="">Select location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name} (L{l.level})</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Inventory mode</label>
              <select value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="BULK">Bulk lot — merges with existing stock</option>
                <option value="PIECE">Single piece — unique serial</option>
              </select>
            </div>

            <div className="form-group">
              <label>Source</label>
              <select
                value={form.source_type}
                onChange={(e) => setForm({ ...form, source_type: e.target.value })}
              >
                <option value="DIRECT_ENTRY">Direct entry (opening or manual stock)</option>
                <option value="SUPPLIER_PURCHASE">Supplier purchase</option>
              </select>
            </div>

            <div className="form-group">
              <label>HUID code</label>
              <input
                maxLength={6}
                value={form.huid_code}
                onChange={(e) => setForm({ ...form, huid_code: e.target.value })}
                placeholder="6 characters, single pieces only"
              />
            </div>

            <div className="form-group">
              <label>Purity of this lot</label>
              <input
                value={form.purity}
                onChange={(e) => setForm({ ...form, purity: e.target.value })}
                placeholder={lookup.default_purity}
              />
              <p className="field-hint">Defaults to the design's purity. Change it only if this lot differs.</p>
            </div>
          </div>

          {mode === 'BULK' ? (
            <div className="form-grid">
              <div className="form-group">
                <label>Total pieces *</label>
                <input
                  type="number" min="1"
                  value={form.total_pieces}
                  onChange={(e) => setForm({ ...form, total_pieces: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Total gross weight (g) *</label>
                <input
                  type="number" step="0.001" min="0"
                  value={form.total_gross_weight}
                  onChange={(e) => setForm({ ...form, total_gross_weight: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Total net weight (g) *</label>
                <input
                  type="number" step="0.001" min="0"
                  value={form.total_net_weight}
                  onChange={(e) => setForm({ ...form, total_net_weight: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Low stock alert at</label>
                <input
                  type="number" min="0"
                  value={form.low_stock_threshold}
                  onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })}
                  placeholder="pieces"
                />
              </div>
            </div>
          ) : (
            <div className="form-grid">
              <div className="form-group">
                <label>Gross weight (g) *</label>
                <input
                  type="number" step="0.001" min="0"
                  value={form.gross_weight}
                  onChange={(e) => setForm({ ...form, gross_weight: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Less weight (g)</label>
                <input
                  type="number" step="0.001" min="0"
                  value={form.less_weight}
                  onChange={(e) => setForm({ ...form, less_weight: e.target.value })}
                />
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Manual price override (₹)</label>
            <input
              type="number" step="0.01" min="0"
              value={form.override_price}
              onChange={(e) => setForm({ ...form, override_price: e.target.value })}
              placeholder="Leave empty to use the calculated price"
            />
            <p className="field-hint">
              Leave this empty unless a piece needs a fixed price. A manual price does not update
              when the metal rate changes.
            </p>
          </div>
        </Card>

        <Card
          title="Stones"
          note="Optional"
          actions={<button type="button" className="btn btn-secondary btn-sm" onClick={addStone}>Add stone</button>}
        >
          {stones.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>No stones added.</p>
          ) : stones.map((s, idx) => (
            <div key={idx} style={{
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              padding: 12, marginBottom: 10, background: 'var(--surface-2)',
            }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Stone type</label>
                  <select value={s.stone_type} onChange={(e) => updateStone(idx, 'stone_type', e.target.value)}>
                    <option value="NATURAL_DIAMOND">Natural diamond</option>
                    <option value="LAB_GROWN_DIAMOND">Lab-grown diamond</option>
                    <option value="RUBY">Ruby</option>
                    <option value="SYNTHETIC">Synthetic</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Pieces</label>
                  <input type="number" min="0" value={s.stone_pieces_count}
                    onChange={(e) => updateStone(idx, 'stone_pieces_count', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Carat weight</label>
                  <input type="number" step="0.001" min="0" value={s.stone_weight_carat}
                    onChange={(e) => updateStone(idx, 'stone_weight_carat', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Rate per carat (₹)</label>
                  <input type="number" min="0" value={s.stone_rate}
                    onChange={(e) => updateStone(idx, 'stone_rate', e.target.value)} />
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeStone(idx)}>
                Remove stone
              </button>
            </div>
          ))}
        </Card>

        <Card title="Photos" note={`Up to ${MAX_IMAGES} images`}>
          <div className="form-group">
            <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleImageSelect} />
          </div>
          {imagePreviews.length > 0 && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {imagePreviews.map((src, idx) => (
                <div key={idx} style={{ position: 'relative' }}>
                  <img
                    src={src}
                    alt={`Preview ${idx + 1}`}
                    style={{
                      width: 86, height: 86, objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(idx)}
                    aria-label="Remove image"
                    style={{
                      position: 'absolute', top: -7, right: -7, width: 22, height: 22,
                      borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: 'var(--danger)', color: '#fff', fontSize: 13, lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="form-actions" style={{ marginBottom: 24 }}>
          <button type="submit" className="btn btn-lg" disabled={submitting}>
            {submitting ? <><span className="spinner" /> Saving…</> : 'Save stock'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/inventory/items')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
