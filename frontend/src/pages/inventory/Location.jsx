// Storage Locations: create and edit the places where stock is kept, and see them as a tree
// diagram (Safe > Box > Sub-box > Tray, Counters ...) that is drawn from the saved locations.
import React, { useEffect, useMemo, useState } from 'react';
import api from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import StorageDiagram, { Glyph, TYPE_STYLE } from '../../components/StorageDiagram';

const CONTAINER_TYPES = [
  ['SAFE', 'Safe'], ['BOX', 'Box'], ['COUNTER', 'Counter'], ['SHELF', 'Shelf'], ['TRAY', 'Tray'], ['OTHER', 'Other'],
];

function flatten(nodes, out = []) {
  nodes.forEach((n) => { out.push(n); flatten(n.children, out); });
  return out;
}

export default function Location() {
  const { user } = useAuth();
  const [locations, setLocations] = useState([]);
  const [tree, setTree] = useState([]);
  const [treeVersion, setTreeVersion] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [branches, setBranches] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const emptyForm = {
    name: '', parent_id: '', storage_type: 'GENERAL', container_type: 'BOX',
    empty_weight: '', capacity_weight: '', capacity_pieces: '',
  };
  const [form, setForm] = useState(emptyForm);

  const isAdmin = user?.role === 'ADMIN';

  const loadBranches = () => {
    if (isAdmin) {
      api.get('/branches').then((res) => {
        setBranches(res.data);
        if (res.data.length > 0) setSelectedBranch(res.data[0].id);
      });
    }
  };

  const branchParams = () => (isAdmin && selectedBranch ? { branch_id: selectedBranch } : {});

  const loadLocations = () => {
    api.get('/locations', { params: branchParams() }).then((res) => setLocations(res.data));
    api.get('/locations/tree', { params: branchParams() }).then((res) => {
      setTree(res.data);
      setTreeVersion((v) => v + 1); // redraw the diagram from the saved data
    });
  };

  useEffect(() => { loadBranches(); }, []);
  useEffect(() => {
    setSelectedId(null);
    if (!isAdmin || selectedBranch) loadLocations();
  }, [selectedBranch]);

  const flat = useMemo(() => flatten(tree), [tree]);
  const selected = flat.find((n) => n.id === selectedId) || null;
  const pathOf = (node) => {
    const names = [];
    let cur = node;
    const byId = new Map(flat.map((n) => [n.id, n]));
    while (cur) { names.unshift(cur.name); cur = cur.parent_id ? byId.get(cur.parent_id) : null; }
    return names.join(' > ');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: form.name, parent_id: form.parent_id || null, storage_type: form.storage_type,
        container_type: form.container_type,
        empty_weight: form.empty_weight || 0,
        capacity_weight: form.capacity_weight || null,
        capacity_pieces: form.capacity_pieces || null,
      };
      if (isAdmin) payload.branch_id = selectedBranch; // an admin must say which branch

      await api.post('/locations', payload);
      setForm(emptyForm);
      loadLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create location');
    }
  };

  const handleEditCapacity = async (l) => {
    const empty_weight = prompt('Empty weight of this box/tray (grams)', l.empty_weight ?? 0);
    if (empty_weight === null) return;
    const capacity_weight = prompt('Max capacity weight (grams) - blank = no limit', l.capacity_weight ?? '');
    if (capacity_weight === null) return;
    const capacity_pieces = prompt('Max capacity pieces - blank = no limit', l.capacity_pieces ?? '');
    if (capacity_pieces === null) return;
    try {
      await api.patch(`/locations/${l.id}`, { empty_weight, capacity_weight, capacity_pieces });
      loadLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed');
    }
  };

  const handleChangeType = async (l, container_type) => {
    try {
      await api.patch(`/locations/${l.id}`, { container_type });
      loadLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Update failed');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this location?')) return;
    try {
      await api.delete(`/locations/${id}`);
      if (selectedId === id) setSelectedId(null);
      loadLocations();
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed');
    }
  };

  const typeName = (t) => TYPE_STYLE[t]?.label || t;

  return (
    <div>
      <h1 style={{ marginBottom: 20 }}>Storage Locations</h1>

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

      {/* ---- Tree diagram ---- */}
      <div className="card">
        <h3 style={{ marginBottom: 4 }}>Tree diagram</h3>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Every location below is drawn from your saved data. Click a box to select it, use the number or minus on a box to open or close what is inside it.
        </p>

        {tree.length === 0
          ? <p className="field-hint">No locations yet. Add the first one below.</p>
          : (
            <StorageDiagram
              key={treeVersion}
              nodes={tree}
              selectedId={selectedId}
              focus={null}
              onSelect={(n) => setSelectedId(n.containerId)}
            />
          )}

        {selected && (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: 'var(--accent-soft)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: TYPE_STYLE[selected.container_type]?.color, display: 'flex' }}><Glyph type={selected.container_type} size={22} /></span>
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>{pathOf(selected)}</strong>
              <div className="cell-sub">
                {typeName(selected.container_type)} · level {selected.level} · {selected.children.length} container(s) inside · {selected.total.designs} design(s) · {selected.total.trays} tray(s)
              </div>
            </div>
            <button className="btn" onClick={() => { setForm({ ...emptyForm, parent_id: selected.id }); window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); }}>
              Add inside this
            </button>
          </div>
        )}
      </div>

      <form className="card" onSubmit={handleCreate}>
        <h3 style={{ marginBottom: 12 }}>Add Location</h3>
        <div className="form-group">
          <label>Name (e.g. Main Safe, Box A, Tray 5)</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="form-group">
          <label>Parent Location (leave blank for top-level)</label>
          <select value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
            <option value="">— Top Level (L1) —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{'—'.repeat(l.level - 1)} {l.name} (L{l.level})</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>What is it?</label>
          <select value={form.container_type} onChange={(e) => setForm({ ...form, container_type: e.target.value })}>
            {CONTAINER_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Type</label>
          <select value={form.storage_type} onChange={(e) => setForm({ ...form, storage_type: e.target.value })}>
            <option value="GENERAL">General (shelf / drawer)</option>
            <option value="WHOLESALE_STORE">Wholesale Store (main storage)</option>
            <option value="TRAY_DISPLAY">Display Tray</option>
          </select>
        </div>
        <div className="form-group">
          <label>Empty weight of box/tray (g)</label>
          <input type="number" step="0.001" value={form.empty_weight} onChange={(e) => setForm({ ...form, empty_weight: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Capacity - max weight (g), blank = no limit</label>
          <input type="number" step="0.001" value={form.capacity_weight} onChange={(e) => setForm({ ...form, capacity_weight: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Capacity - max pieces, blank = no limit</label>
          <input type="number" value={form.capacity_pieces} onChange={(e) => setForm({ ...form, capacity_pieces: e.target.value })} />
        </div>
        <button className="btn" type="submit">Add Location</button>
      </form>

      <div className="card">
        <table>
          <thead><tr><th>Name</th><th>Kind</th><th>Type</th><th>Level</th><th>Empty wt (g)</th><th>Capacity (g / pcs)</th><th>Parent</th><th></th></tr></thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} style={selectedId === l.id ? { background: 'var(--accent-soft)' } : undefined}>
                <td>{'—'.repeat(l.level - 1)} <a href="#!" onClick={(e) => { e.preventDefault(); setSelectedId(l.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{l.name}</a></td>
                <td>
                  <select value={l.container_type || 'OTHER'} onChange={(e) => handleChangeType(l, e.target.value)} aria-label={`Kind of ${l.name}`}>
                    {CONTAINER_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </td>
                <td>{l.storage_type === 'WHOLESALE_STORE' ? 'Wholesale Store' : l.storage_type === 'TRAY_DISPLAY' ? 'Display Tray' : 'General'}</td>
                <td>L{l.level}</td>
                <td>{l.empty_weight ?? 0}</td>
                <td>{l.capacity_weight ?? '∞'} / {l.capacity_pieces ?? '∞'}</td>
                <td>{locations.find((p) => p.id === l.parent_id)?.name || '—'}</td>
                <td>
                  <button className="btn" style={{ marginRight: 6 }} onClick={() => handleEditCapacity(l)}>Edit capacity</button>
                  <button className="btn btn-danger" onClick={() => handleDelete(l.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}