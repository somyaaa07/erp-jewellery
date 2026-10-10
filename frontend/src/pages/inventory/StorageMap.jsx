// Storage Map: the real, database-driven picture of where everything is.
// Top: counts. Middle: an interactive diagram (or a list on small screens). Side: the actual
// contents of whichever container is selected, with actions to add, move, rename and delete.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import useBranchScope, { BranchPicker } from '../../hooks/useBranchScope';
import { buildOptions } from '../../hooks/useLocationOptions';
import DesignImage from '../../components/DesignImage';
import MoveDialog from '../../components/MoveDialog';
import StorageDiagram, { Glyph, TYPE_STYLE } from '../../components/StorageDiagram';
import {
  Card, DataState, Modal, PageHeader, Stat, Tabs, errorMessage, formatDateTime, grams,
} from '../../components/ui';

const TYPES = ['SAFE', 'BOX', 'TRAY', 'COUNTER', 'SHELF', 'OTHER'];
const typeLabel = (t) => TYPE_STYLE[t]?.label || t;

export function QuantityBadge({ status, pieces }) {
  if (status === 'UNKNOWN') return <span className="badge yellow" title="Stored here, but the quantity is not finalised. This is not zero stock.">Quantity not final</span>;
  if (status === 'ISSUED_TO_KARIGAR') return <span className="badge red">With karigar</span>;
  return <span className="badge green">{pieces} pcs confirmed</span>;
}

function flatten(nodes, out = []) { nodes.forEach((n) => { out.push(n); flatten(n.children, out); }); return out; }

// Plain nested list, used on small screens and as an alternative view.
function ListNode({ node, depth, expanded, toggle, selectedId, onSelect }) {
  const open = expanded.has(node.id);
  const t = node.total;
  return (
    <div>
      <div onClick={() => onSelect(node.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px', paddingLeft: 6 + depth * 18, cursor: 'pointer', borderRadius: 6, background: selectedId === node.id ? '#eef2ff' : 'transparent' }}>
        <span onClick={(e) => { e.stopPropagation(); if (node.children.length) toggle(node.id); }} style={{ width: 16, color: '#6b7280' }}>{node.children.length ? (open ? '▾' : '▸') : '·'}</span>
        <span style={{ color: TYPE_STYLE[node.container_type]?.color, display: 'flex' }}><Glyph type={node.container_type} size={16} /></span>
        <strong>{node.name}</strong>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>{t.designs} design{t.designs === 1 ? '' : 's'}{t.trays ? ` · ${t.trays} tray${t.trays === 1 ? '' : 's'}` : ''}</span>
      </div>
      {open && node.children.map((c) => <ListNode key={c.id} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} selectedId={selectedId} onSelect={onSelect} />)}
    </div>
  );
}

export default function StorageMap() {
  const scope = useBranchScope();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('map');
  const [mode, setMode] = useState(() => (window.innerWidth < 900 ? 'list' : 'diagram'));
  const [tree, setTree] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(params.get('location') ? Number(params.get('location')) : null);
  const [focus, setFocus] = useState(null);
  const [contents, setContents] = useState(null);
  const [findText, setFindText] = useState('');
  const [found, setFound] = useState([]);
  const [history, setHistory] = useState([]);
  const [listOpen, setListOpen] = useState(new Set());
  const [designs, setDesigns] = useState([]);
  const [allTrays, setAllTrays] = useState([]);

  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', container_type: 'BOX', parent_id: '' });
  const [trayOpen, setTrayOpen] = useState(false);
  const [trayForm, setTrayForm] = useState({ name: '', total_slots: '' });
  const [placeOpen, setPlaceOpen] = useState(false);
  const [placeForm, setPlaceForm] = useState({ product_master_id: '', pieces: '', weight: '' });
  const [assignOpen, setAssignOpen] = useState(false);
  const [moveNode, setMoveNode] = useState(false);
  const [moveLot, setMoveLot] = useState(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const loadAll = useCallback(async () => {
    if (!scope.ready) return;
    setLoading(true); setError('');
    try {
      const [t, s] = await Promise.all([
        api.get('/locations/tree', { params: scope.params }),
        api.get('/locations/summary', { params: scope.params }),
      ]);
      setTree(t.data); setSummary(s.data);
    } catch (err) { setError(errorMessage(err, 'Could not load the storage map.')); }
    setLoading(false);
  }, [scope.ready, scope.branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadContents = useCallback(async (id) => {
    if (!id) { setContents(null); return; }
    try { const { data } = await api.get(`/locations/${id}/contents`); setContents(data); }
    catch (err) { toast.error(errorMessage(err, 'Could not open this container.')); setContents(null); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { loadContents(selectedId); }, [selectedId, loadContents]);
  useEffect(() => {
    api.get('/products').then((r) => setDesigns(r.data)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!scope.ready) return;
    api.get('/display-trays', { params: scope.params }).then((r) => setAllTrays(r.data)).catch(() => setAllTrays([]));
  }, [scope.ready, scope.branchId, tree]);
  useEffect(() => {
    if (tab !== 'history' || !scope.ready) return;
    api.get('/locations/movements', { params: scope.params }).then((r) => setHistory(r.data)).catch((e) => toast.error(errorMessage(e, 'Could not load the history.')));
  }, [tab, scope.ready, scope.branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!findText.trim()) { setFound([]); return undefined; }
    const timer = setTimeout(() => {
      api.get('/locations/find', { params: { ...scope.params, q: findText } }).then((r) => setFound(r.data)).catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [findText, scope.branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flat = useMemo(() => flatten(tree), [tree]);
  const options = useMemo(() => buildOptions(flat.map((n) => ({ id: n.id, name: n.name, parent_id: n.parent_id, level: n.level, container_type: n.container_type, storage_type: n.storage_type }))), [flat]);
  const optionById = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const selectedNode = flat.find((n) => n.id === selectedId) || null;

  const select = (id, nextFocus = null) => {
    setSelectedId(id); setFocus(nextFocus);
    const next = new URLSearchParams(params);
    if (id) next.set('location', id); else next.delete('location');
    setParams(next, { replace: true });
  };
  const onDiagramSelect = (n) => select(n.containerId, n.kind === 'CONTAINER' ? null : n);

  const refresh = async () => { await loadAll(); await loadContents(selectedId); };
  const run = async (fn, okMessage) => {
    try { await fn(); toast.success(okMessage); await refresh(); return true; }
    catch (err) { toast.error(errorMessage(err, 'That did not work.')); return false; }
  };

  // Destinations for moving a container: never itself or anything inside it.
  const containerTargets = useMemo(() => {
    if (!selectedNode) return [];
    const banned = new Set();
    const mark = (n) => { banned.add(n.id); n.children.forEach(mark); };
    mark(selectedNode);
    return options.filter((o) => !banned.has(o.id) && o.storage_type !== 'TRAY_DISPLAY');
  }, [selectedNode, options]);

  const lotTargets = useMemo(() => options.filter((o) => o.in_wholesale && (!moveLot || o.id !== moveLot.location_id)), [options, moveLot]);
  const crumbs = contents?.location?.path_ids || [];
  const highlightIds = useMemo(() => new Set(found.map((f) => f.id)), [found]);

  return (
    <div>
      <PageHeader
        title="Storage Map"
        subtitle="Where every safe, box, tray, counter and design is right now. Click anything to see what is inside it."
        actions={<BranchPicker scope={scope} />}
      />

      <div className="stat-grid">
        <Stat label="Root locations" value={summary?.root_locations ?? '—'} />
        <Stat label="Safes" value={summary?.safes ?? '—'} />
        <Stat label="Boxes" value={summary?.boxes ?? '—'} />
        <Stat label="Counters" value={summary?.counters ?? '—'} />
        <Stat label="Trays" value={summary?.trays ?? '—'} />
        <Stat label="Physical instances" value={summary?.physical_instances ?? '—'} />
        <Stat label="With karigar" value={summary?.with_karigar ?? '—'} />
        <Stat label="Quantity not final" value={summary?.quantity_unknown ?? '—'} />
      </div>

      <Tabs tabs={[{ key: 'map', label: 'Map' }, { key: 'history', label: 'Movement history' }]} active={tab} onChange={setTab} />

      {tab === 'map' && (
        <DataState loading={loading} error={error} onRetry={loadAll}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
            <div style={{ gridColumn: mode === 'diagram' ? 'span 2' : 'auto', minWidth: 0 }}>
              <Card
                title={mode === 'diagram' ? 'Hierarchy diagram' : 'Locations'}
                actions={(
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className={`btn btn-sm ${mode === 'diagram' ? '' : 'btn-secondary'}`} onClick={() => setMode('diagram')}>Diagram</button>
                    <button className={`btn btn-sm ${mode === 'list' ? '' : 'btn-secondary'}`} onClick={() => setMode('list')}>List</button>
                    <button className="btn btn-sm" onClick={() => { setAddForm({ name: '', container_type: 'BOX', parent_id: selectedId || '' }); setAddOpen(true); }}>Add container</button>
                  </div>
                )}
              >
                <input className="search-input" type="search" placeholder="Find a box, tray, counter or design"
                  value={findText} onChange={(e) => setFindText(e.target.value)} style={{ width: '100%', marginBottom: 8 }} />
                {found.length > 0 && (
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, marginBottom: 8, maxHeight: 180, overflowY: 'auto' }}>
                    {found.map((f) => (
                      <div key={f.id} onClick={() => { select(f.id); setFound([]); }} style={{ padding: '6px 8px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}>
                        <strong>{f.name}</strong> <span className="cell-sub">{typeLabel(f.container_type)}{f.counter ? ` · ${f.counter}` : ''}</span>
                        <div className="cell-sub">{f.path}</div>
                      </div>
                    ))}
                  </div>
                )}
                {tree.length === 0 && <p className="field-hint">No storage locations yet. Add a container to start.</p>}
                {mode === 'diagram'
                  ? <StorageDiagram nodes={tree} selectedId={selectedId} focus={focus} onSelect={onDiagramSelect} searchText={findText} highlightIds={highlightIds} />
                  : tree.map((n) => (
                    <ListNode key={n.id} node={n} depth={0} expanded={listOpen} selectedId={selectedId} onSelect={select}
                      toggle={(id) => setListOpen((p) => { const x = new Set(p); if (x.has(id)) x.delete(id); else x.add(id); return x; })} />
                  ))}
              </Card>
            </div>

            <div style={{ minWidth: 0 }}>
              {!contents && <Card title="Contents"><p className="field-hint">Select a container in the {mode === 'diagram' ? 'diagram' : 'list'} to see exactly what is inside it.</p></Card>}
              {contents && (
                <>
                  <Card
                    title={contents.location.name}
                    note={`${typeLabel(contents.location.container_type)} · level ${contents.location.level}${contents.location.counter ? ` · at ${contents.location.counter}` : ''}`}
                  >
                    <div style={{ marginBottom: 8, fontSize: 14 }}>
                      {crumbs.map((id, i) => (
                        <span key={id}>{i > 0 && ' > '}<a href="#!" onClick={(e) => { e.preventDefault(); select(id); }}>{optionById.get(id)?.name || id}</a></span>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {contents.location.parent_id && <button className="btn btn-secondary btn-sm" onClick={() => select(contents.location.parent_id)}>Up to parent</button>}
                      <button className="btn btn-sm" onClick={() => { setAddForm({ name: '', container_type: 'BOX', parent_id: contents.location.id }); setAddOpen(true); }}>Add box inside</button>
                      <button className="btn btn-sm" onClick={() => { setTrayForm({ name: '', total_slots: '' }); setTrayOpen(true); }}>Add tray here</button>
                      <button className="btn btn-sm" onClick={() => { setPlaceForm({ product_master_id: '', pieces: '', weight: '' }); setPlaceOpen(true); }}>Add design here</button>
                      {contents.location.container_type === 'COUNTER' && <button className="btn btn-sm" onClick={() => setAssignOpen(true)}>Assign tray here</button>}
                      {contents.location.storage_type === 'GENERAL' && (
                        <>
                          <button className="btn btn-secondary btn-sm" onClick={() => setMoveNode(true)}>Move</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => { setNewName(contents.location.name); setRenameOpen(true); }}>Rename</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => {
                            if (!window.confirm(`Delete ${contents.location.name}? This only works when it is empty.`)) return;
                            run(async () => { await api.delete(`/locations/${contents.location.id}`); select(contents.location.parent_id || null); }, 'Deleted');
                          }}>Delete</button>
                        </>
                      )}
                    </div>
                  </Card>

                  {contents.children.length > 0 && (
                    <Card title="Containers directly inside" note={`${contents.children.length}`}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {contents.children.map((c) => (
                          <button key={c.id} className="btn btn-secondary btn-sm" onClick={() => select(c.id)}>
                            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ color: TYPE_STYLE[c.container_type]?.color, display: 'flex' }}><Glyph type={c.container_type} size={14} /></span>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    </Card>
                  )}

                  {contents.trays.length > 0 && (
                    <Card title="Trays directly inside" note={`${contents.trays.length}`}>
                      {contents.trays.map((tr) => (
                        <div key={tr.id} style={{ marginBottom: 10, padding: 8, borderRadius: 8, border: `1px solid ${focus?.key === `t:${tr.id}` ? '#4f46e5' : '#e5e7eb'}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <strong>{tr.name}</strong>
                            <Link to="/inventory/display-trays" className="cell-sub">{tr.present}/{tr.total_slots} slots · open trays</Link>
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            {tr.designs.length === 0 && <span className="cell-sub">Empty tray</span>}
                            {tr.designs.map((d) => (
                              <Link key={d.id} to={`/inventory/designs/${d.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <DesignImage src={d.image_url} alt={d.design_name} size={40} /><span className="cell-sub">{d.design_code}</span>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </Card>
                  )}

                  <Card title="Designs directly inside" note={`${contents.lots.length}`}>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>Design</th><th style={{ textAlign: 'right' }}>Pieces</th><th style={{ textAlign: 'right' }}>Weight</th><th>Quantity</th><th /></tr></thead>
                        <tbody>
                          {contents.lots.length === 0 && <tr><td colSpan={5}>No designs stored directly in this container.</td></tr>}
                          {contents.lots.map((l) => (
                            <tr key={l.item_id} style={focus?.key?.endsWith(`:${l.item_id}`) ? { background: '#eef2ff' } : undefined}>
                              <td>
                                <Link to={`/inventory/designs/${l.product_master_id}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <DesignImage src={l.image_url} alt={l.design_name} />
                                  <span><span className="cell-title">{l.design_name}</span><br /><span className="cell-sub">{l.design_code}{l.category ? ` · ${l.category}` : ''}</span></span>
                                </Link>
                              </td>
                              <td style={{ textAlign: 'right' }}>{l.quantity_status === 'CONFIRMED' ? l.pieces : '—'}</td>
                              <td style={{ textAlign: 'right' }}>{l.quantity_status === 'CONFIRMED' ? grams(l.weight) : '—'}</td>
                              <td><QuantityBadge status={l.quantity_status} pieces={l.pieces} /></td>
                              <td>{l.quantity_status !== 'ISSUED_TO_KARIGAR' && <button className="btn btn-secondary btn-sm" onClick={() => setMoveLot(l)}>Move</button>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card title="Recent moves here">
                    {(contents.history || []).length === 0 && <p className="field-hint">No moves recorded yet.</p>}
                    {(contents.history || []).map((h) => (
                      <div key={h.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                        <strong>{h.entity_label}</strong> <span className="cell-sub">{formatDateTime(h.createdAt || h.created_at)}</span>
                        <div className="cell-sub">{h.from_path || '—'} → {h.to_path || '—'}</div>
                      </div>
                    ))}
                  </Card>
                </>
              )}
            </div>
          </div>
        </DataState>
      )}

      {tab === 'history' && (
        <Card title="Where things were, and where they went">
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>What</th><th>Type</th><th>From</th><th>To</th><th>By</th><th>Reason</th></tr></thead>
              <tbody>
                {history.length === 0 && <tr><td colSpan={7}>No moves recorded yet.</td></tr>}
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDateTime(h.createdAt || h.created_at)}</td><td>{h.entity_label}</td>
                    <td>{{ LOCATION: 'Container', TRAY: 'Tray', STOCK_LOT: 'Stock', TRAY_PIECE: 'Tray piece' }[h.entity_type]}</td>
                    <td>{h.from_path || '—'}</td><td>{h.to_path || '—'}</td><td>{h.moved_by_name || '—'}</td><td>{h.reason || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add a container */}
      <Modal open={addOpen} title="Add container" onClose={() => setAddOpen(false)}
        footer={<><button className="btn btn-secondary" onClick={() => setAddOpen(false)}>Cancel</button>
          <button className="btn" disabled={!addForm.name.trim()} onClick={async () => {
            const ok = await run(() => api.post('/locations', { name: addForm.name, container_type: addForm.container_type, parent_id: addForm.parent_id || null, ...scope.params }), 'Container added');
            if (ok) { setAddOpen(false); }
          }}>Add</button></>}>
        <div className="form-group"><label>Will be created inside</label>
          <div style={{ padding: 8, borderRadius: 6, background: '#eef2ff' }}>{addForm.parent_id ? optionById.get(Number(addForm.parent_id))?.label : 'Top level (nothing above it)'}</div>
          <select value={addForm.parent_id} onChange={(e) => setAddForm({ ...addForm, parent_id: e.target.value })} style={{ marginTop: 6 }}>
            <option value="">Top level</option>
            {options.filter((o) => o.storage_type !== 'TRAY_DISPLAY').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="form-group"><label>Name or code</label><input value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} placeholder="e.g. Box B1" /></div>
        <div className="form-group"><label>Type</label>
          <select value={addForm.container_type} onChange={(e) => setAddForm({ ...addForm, container_type: e.target.value })}>
            {TYPES.filter((t) => t !== 'TRAY').map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
          </select>
        </div>
      </Modal>

      {/* Add a tray in this container */}
      <Modal open={trayOpen} title={`Add tray in ${contents?.location?.name || ''}`} onClose={() => setTrayOpen(false)}
        footer={<><button className="btn btn-secondary" onClick={() => setTrayOpen(false)}>Cancel</button>
          <button className="btn" disabled={!trayForm.name.trim() || !trayForm.total_slots} onClick={async () => {
            const ok = await run(() => api.post('/display-trays', { name: trayForm.name, total_slots: trayForm.total_slots, location_id: contents.location.id, ...scope.params }), 'Tray added');
            if (ok) setTrayOpen(false);
          }}>Add tray</button></>}>
        <p className="field-hint">Placed at: {contents?.location?.path}</p>
        <div className="form-group"><label>Tray name or code</label><input value={trayForm.name} onChange={(e) => setTrayForm({ ...trayForm, name: e.target.value })} placeholder="e.g. T1" /></div>
        <div className="form-group"><label>Number of slots</label><input type="number" min="1" value={trayForm.total_slots} onChange={(e) => setTrayForm({ ...trayForm, total_slots: e.target.value })} /></div>
      </Modal>

      {/* Put a design in this container */}
      <Modal open={placeOpen} title={`Add design to ${contents?.location?.name || ''}`} onClose={() => setPlaceOpen(false)}
        footer={<><button className="btn btn-secondary" onClick={() => setPlaceOpen(false)}>Cancel</button>
          <button className="btn" disabled={!placeForm.product_master_id} onClick={async () => {
            const ok = await run(() => api.post(`/locations/${contents.location.id}/place-design`, placeForm), 'Design placed');
            if (ok) setPlaceOpen(false);
          }}>Place design</button></>}>
        <div className="form-group"><label>Design</label>
          <select value={placeForm.product_master_id} onChange={(e) => setPlaceForm({ ...placeForm, product_master_id: e.target.value })}>
            <option value="">Select design</option>
            {designs.map((d) => <option key={d.id} value={d.id}>{d.product_name} ({d.design_code})</option>)}
          </select>
        </div>
        <div className="form-grid">
          <div className="form-group"><label>Quantity (pieces)</label><input type="number" min="0" value={placeForm.pieces} onChange={(e) => setPlaceForm({ ...placeForm, pieces: e.target.value })} /></div>
          <div className="form-group"><label>Weight (g)</label><input type="number" step="0.001" min="0" value={placeForm.weight} onChange={(e) => setPlaceForm({ ...placeForm, weight: e.target.value })} /></div>
        </div>
        <p className="field-hint">Leave the weight empty if the quantity is not known yet. It is saved as "quantity not final", not as zero.</p>
      </Modal>

      {/* Assign an existing tray to this counter */}
      <MoveDialog
        open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign tray to this counter"
        subjectLabel="Choose a tray" currentPath={null} destinationLabel="Tray"
        options={allTrays.filter((t) => t.location_id !== contents?.location?.id).map((t) => ({ id: t.id, label: t.name, hint: t.location_path || 'Not placed', append: false }))}
        onConfirm={async (trayId, reason) => {
          const ok = await run(() => api.post(`/display-trays/${trayId}/move`, { location_id: contents.location.id, reason }), 'Tray assigned');
          if (ok) setAssignOpen(false);
        }}
      />

      {/* Move a container */}
      <MoveDialog
        open={moveNode} onClose={() => setMoveNode(false)} title="Move container" allowRoot
        subjectLabel={contents?.location?.name || ''} currentPath={contents?.location?.path}
        note="Everything inside it moves with it, and keeps its place in the hierarchy."
        options={containerTargets}
        onConfirm={async (destId, reason) => {
          const ok = await run(() => api.post(`/locations/${contents.location.id}/move`, { parent_id: destId, reason }), 'Moved');
          if (ok) setMoveNode(false);
        }}
      />

      {/* Move a stock lot */}
      <MoveDialog
        open={Boolean(moveLot)} onClose={() => setMoveLot(null)} title="Move stock"
        subjectLabel={moveLot ? `${moveLot.design_name} (${moveLot.design_code})` : ''} currentPath={moveLot?.location_path}
        note="If the destination already holds this design, the stock is merged into it. Copies in other boxes are not touched."
        options={lotTargets}
        onConfirm={async (destId, reason) => {
          const ok = await run(() => api.post(`/locations/items/${moveLot.item_id}/move`, { location_id: destId, reason }), 'Stock moved');
          if (ok) setMoveLot(null);
        }}
      />

      <Modal open={renameOpen} title="Rename container" onClose={() => setRenameOpen(false)}
        footer={<><button className="btn btn-secondary" onClick={() => setRenameOpen(false)}>Cancel</button>
          <button className="btn" disabled={!newName.trim()} onClick={async () => {
            const ok = await run(() => api.patch(`/locations/${contents.location.id}`, { name: newName.trim() }), 'Renamed');
            if (ok) setRenameOpen(false);
          }}>Save</button></>}>
        <div className="form-group"><label>Name</label><input value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
      </Modal>
    </div>
  );
}
