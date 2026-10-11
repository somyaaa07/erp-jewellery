// Display trays: every piece is entered on its own, in its own slot, with its design, weight
// and (optional) HUID. Pieces that are sold or taken off are kept in the history.
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import useBranchScope, { BranchPicker } from '../../hooks/useBranchScope';
import useLocationOptions from '../../hooks/useLocationOptions';
import DesignImage from '../../components/DesignImage';
import ImageUpload from '../../components/ImageUpload';
import MoveDialog from '../../components/MoveDialog';
import {
  Card, DataState, Modal, PageHeader, Stat, StatusBadge, Tabs, errorMessage, formatDate, grams,
} from '../../components/ui';

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function DisplayTrays() {
  const scope = useBranchScope();
  const { options: places, reload: reloadPlaces } = useLocationOptions(scope);
  const [tab, setTab] = useState('summary');
  const [categories, setCategories] = useState([]);
  const [designs, setDesigns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [trays, setTrays] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [trayForm, setTrayForm] = useState({ name: '', category_id: '', total_slots: '', empty_weight: '', location_id: '' });
  const [openTrayId, setOpenTrayId] = useState(null);
  const [trayDetail, setTrayDetail] = useState(null);
  const [audits, setAudits] = useState([]);
  const [addingSlot, setAddingSlot] = useState(null); // slot number being filled
  const [pieceForm, setPieceForm] = useState({ product_master_id: '', weight: '', huid_code: '', item_code: '', image_url: '', date_added: todayIso() });
  const [removing, setRemoving] = useState(null); // piece being removed
  const [removeForm, setRemoveForm] = useState({ outcome: 'SOLD', date: todayIso(), reason: '' });
  const [auditForm, setAuditForm] = useState({ physical_count: '', physical_weight: '', audited_on: todayIso(), notes: '' });
  const [movingPiece, setMovingPiece] = useState(null);
  const [movingTray, setMovingTray] = useState(null);
  const [moveForm, setMoveForm] = useState({ location_id: '', reason: '' });
  const [historyFilter, setHistoryFilter] = useState({ status: '', q: '' });

  useEffect(() => {
    api.get('/categories').then((res) => setCategories(res.data)).catch(() => {});
    api.get('/products').then((res) => setDesigns(res.data)).catch(() => {});
  }, []);

  const loadOverview = useCallback(async () => {
    if (!scope.ready) return;
    setLoading(true);
    setError('');
    try {
      const [s, t] = await Promise.all([
        api.get('/display-trays/summary', { params: scope.params }),
        api.get('/display-trays', { params: scope.params }),
      ]);
      setSummary(s.data);
      setTrays(t.data);
    } catch (err) {
      setError(errorMessage(err, 'Could not load display trays.'));
    } finally {
      setLoading(false);
    }
  }, [scope.ready, scope.branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadHistory = useCallback(async () => {
    if (!scope.ready) return;
    try {
      const { data } = await api.get('/display-trays/pieces', { params: { ...scope.params, ...historyFilter } });
      setPieces(data);
    } catch (err) { toast.error(errorMessage(err, 'Could not load the piece history.')); }
  }, [scope.ready, scope.branchId, historyFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTray = useCallback(async (id) => {
    try {
      const [t, a] = await Promise.all([api.get(`/display-trays/${id}`), api.get(`/display-trays/${id}/audits`)]);
      setTrayDetail(t.data);
      setAudits(a.data);
    } catch (err) { toast.error(errorMessage(err, 'Could not open this tray.')); }
  }, []);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { if (tab === 'history') loadHistory(); }, [tab, loadHistory]);
  useEffect(() => { if (openTrayId) loadTray(openTrayId); else setTrayDetail(null); }, [openTrayId, loadTray]);

  const refreshAll = () => { reloadPlaces(); loadOverview(); if (openTrayId) loadTray(openTrayId); if (tab === 'history') loadHistory(); };

  const createTray = async (e) => {
    e.preventDefault();
    try {
      await api.post('/display-trays', { ...trayForm, ...scope.params });
      toast.success('Tray created');
      setTrayForm({ name: '', category_id: '', total_slots: '', empty_weight: '', location_id: '' });
      loadOverview();
    } catch (err) { toast.error(errorMessage(err, 'Could not create the tray.')); }
  };

  const addPiece = async () => {
    try {
      await api.post(`/display-trays/${openTrayId}/pieces`, { ...pieceForm, slot_no: addingSlot });
      toast.success('Piece added to the tray');
      setAddingSlot(null);
      setPieceForm({ product_master_id: '', weight: '', huid_code: '', item_code: '', image_url: '', date_added: todayIso() });
      refreshAll();
    } catch (err) { toast.error(errorMessage(err, 'Could not add this piece.')); }
  };

  const moveTray = async () => {
    try {
      await api.post(`/display-trays/${movingTray.id}/move`, moveForm);
      toast.success('Tray moved. Its earlier place is kept in the movement history.');
      setMovingTray(null);
      setMoveForm({ location_id: '', reason: '' });
      refreshAll();
    } catch (err) { toast.error(errorMessage(err, 'Could not move the tray.')); }
  };

  const removePiece = async () => {
    try {
      await api.post(`/display-trays/pieces/${removing.id}/remove`, removeForm);
      toast.success(removeForm.outcome === 'SOLD' ? 'Marked as sold' : 'Taken off the tray');
      setRemoving(null);
      setRemoveForm({ outcome: 'SOLD', date: todayIso(), reason: '' });
      refreshAll();
    } catch (err) { toast.error(errorMessage(err, 'Could not remove this piece.')); }
  };

  const saveAudit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/display-trays/${openTrayId}/audits`, auditForm);
      const diff = Number(data.difference);
      toast[Math.abs(diff) < 0.0005 ? 'success' : 'warning'](
        Math.abs(diff) < 0.0005 ? 'Audit saved. The weight matches.' : `Audit saved. Weight difference: ${diff.toFixed(3)} g`,
      );
      setAuditForm({ physical_count: '', physical_weight: '', audited_on: todayIso(), notes: '' });
      refreshAll();
    } catch (err) { toast.error(errorMessage(err, 'Could not save the audit.')); }
  };

  // A tray is not tied to a category: any design can be placed in it.
  const designsForTray = designs;
  const totals = summary?.totals;

  return (
    <div>
      <PageHeader
        title="Display Trays"
        subtitle="Each piece is entered individually in its own slot. When it is sold or taken off, the slot is freed and the date is kept."
        actions={<BranchPicker scope={scope} />}
      />

      <div className="stat-grid">
        <Stat label="Trays" value={totals?.trays ?? '—'} />
        <Stat label="Total slots" value={totals?.total_slots ?? '—'} />
        <Stat label="Pieces on display" value={totals?.present ?? '—'} />
        <Stat label="Empty slots" value={totals?.empty_slots ?? '—'} />
        <Stat label="Total weight" value={totals ? grams(totals.total_weight) : '—'} />
      </div>

      <Tabs
        tabs={[{ key: 'summary', label: 'Summary' }, { key: 'trays', label: 'Trays' }, { key: 'history', label: 'Piece history' }]}
        active={tab}
        onChange={setTab}
      />

      <DataState loading={loading} error={error} onRetry={loadOverview}>
        {tab === 'summary' && (
          <Card title="By category" note="Slots, pieces, empty slots and weight for every category, with the latest audit.">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th><th>Trays</th><th>Total slots</th><th>Pieces present</th><th>Empty slots</th>
                    <th style={{ textAlign: 'right' }}>Total weight</th><th>Last audited</th>
                    <th style={{ textAlign: 'right' }}>Audited weight</th><th style={{ textAlign: 'right' }}>Audit difference</th>
                  </tr>
                </thead>
                <tbody>
                  {(summary?.rows || []).length === 0 && <tr><td colSpan={9}>No trays yet. Create one in the Trays tab.</td></tr>}
                  {(summary?.rows || []).map((r) => {
                    const diff = r.last_audited ? r.audit_weight - r.audited_system_weight : null;
                    return (
                      <tr key={r.category_id}>
                        <td>{r.category_name}</td><td>{r.trays}</td><td>{r.total_slots}</td><td>{r.present}</td>
                        <td>{r.empty_slots}</td>
                        <td style={{ textAlign: 'right' }}>{grams(r.total_weight)}</td>
                        <td>{r.last_audited ? formatDate(r.last_audited) : 'Never'}</td>
                        <td style={{ textAlign: 'right' }}>{r.last_audited ? grams(r.audit_weight) : '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {diff === null ? '—' : <span className={`badge ${Math.abs(diff) < 0.0005 ? 'green' : 'red'}`}>{diff.toFixed(3)} g</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'trays' && (
          <>
            <Card title="New tray">
              <form onSubmit={createTray}>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Tray name</label>
                    <input value={trayForm.name} onChange={(e) => setTrayForm({ ...trayForm, name: e.target.value })} placeholder="e.g. Ladies Ring - Tray 1" required />
                  </div>
                  <div className="form-group">
                    <label>Placed at (counter or box)</label>
                    <select value={trayForm.location_id} onChange={(e) => setTrayForm({ ...trayForm, location_id: e.target.value })}>
                      <option value="">Not placed yet</option>
                      {places.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Category label (optional)</label>
                    <select value={trayForm.category_id} onChange={(e) => setTrayForm({ ...trayForm, category_id: e.target.value })}>
                      <option value="">None - a tray can hold any designs</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Number of slots</label>
                    <input type="number" min="1" value={trayForm.total_slots} onChange={(e) => setTrayForm({ ...trayForm, total_slots: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label>Empty tray weight (g, optional)</label>
                    <input type="number" step="0.001" min="0" value={trayForm.empty_weight} onChange={(e) => setTrayForm({ ...trayForm, empty_weight: e.target.value })} />
                  </div>
                </div>
                <button className="btn" type="submit" disabled={!scope.ready}>Create Tray</button>
              </form>
            </Card>

            <Card title="All trays">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Tray</th><th>Counter</th><th>Location</th><th>Slots</th><th>Present</th><th>Empty</th><th style={{ textAlign: 'right' }}>Weight</th><th>Last audit</th><th /></tr>
                  </thead>
                  <tbody>
                    {trays.length === 0 && <tr><td colSpan={9}>No trays yet.</td></tr>}
                    {trays.map((t) => (
                      <tr key={t.id}>
                        <td>{t.name}{t.Category?.name ? <span className="cell-sub"> · {t.Category.name}</span> : null}</td><td>{t.counter || '—'}</td><td>{t.location_path || 'Not placed'}</td><td>{t.total_slots}</td><td>{t.present}</td><td>{t.empty_slots}</td>
                        <td style={{ textAlign: 'right' }}>{grams(t.total_weight)}</td>
                        <td>{t.last_audit ? formatDate(t.last_audit.audited_on) : 'Never'}</td>
                        <td><button className="btn btn-secondary btn-sm" onClick={() => setOpenTrayId(t.id)}>Open</button>{' '}<button className="btn btn-secondary btn-sm" onClick={() => { setMovingTray(t); setMoveForm({ location_id: '', reason: '' }); }}>Move</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {tab === 'history' && (
          <Card title="Every piece, including sold and removed">
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Status</label>
                <select value={historyFilter.status} onChange={(e) => setHistoryFilter({ ...historyFilter, status: e.target.value })}>
                  <option value="">All</option>
                  <option value="ON_DISPLAY">On display</option>
                  <option value="SOLD">Sold</option>
                  <option value="REMOVED">Removed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Search item code or HUID</label>
                <input value={historyFilter.q} onChange={(e) => setHistoryFilter({ ...historyFilter, q: e.target.value })} />
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Item code</th><th>Design</th><th>Category</th><th>Tray / slot</th><th style={{ textAlign: 'right' }}>Weight</th><th>HUID</th><th>Status</th><th>Added</th><th>Released</th></tr>
                </thead>
                <tbody>
                  {pieces.length === 0 && <tr><td colSpan={9}>No pieces found.</td></tr>}
                  {pieces.map((p) => (
                    <tr key={p.id}>
                      <td>{p.item_code}</td>
                      <td>{p.ProductMaster?.product_name} ({p.ProductMaster?.design_code})</td>
                      <td>{p.Category?.name}</td>
                      <td>{p.DisplayTray?.name} / {p.slot_no}</td>
                      <td style={{ textAlign: 'right' }}>{grams(p.weight)}</td>
                      <td>{p.huid_code || '—'}</td>
                      <td><StatusBadge value={p.status} tone={p.status === 'ON_DISPLAY' ? 'green' : undefined} /></td>
                      <td>{formatDate(p.date_added)}</td>
                      <td>{p.date_released ? formatDate(p.date_released) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </DataState>

      {/* ---- One tray, slot by slot ---- */}
      <Modal
        open={Boolean(openTrayId && trayDetail)}
        title={trayDetail ? `${trayDetail.tray.name}${trayDetail.tray.location_path ? ` - ${trayDetail.tray.location_path}` : ' - not placed'}` : ''}
        size="lg"
        onClose={() => setOpenTrayId(null)}
      >
        {trayDetail && (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>{trayDetail.present}</strong> of {trayDetail.tray.total_slots} slots filled,
              {' '}<strong>{trayDetail.empty_slots}</strong> empty, total weight <strong>{grams(trayDetail.total_weight)}</strong>
            </p>
            <div className="slot-grid">
              {trayDetail.slots.map((s) => (
                <div key={s.slot_no} className={`slot ${s.item ? 'filled' : 'empty'}`}>
                  <div className="slot-no">Slot {s.slot_no}</div>
                  {s.item ? (
                    <>
                      <DesignImage src={s.item.display_image} alt={s.item.ProductMaster?.product_name} size={56} />
                      <div className="slot-code">{s.item.item_code}</div>
                      <div className="slot-meta">{s.item.ProductMaster?.product_name}</div>
                      <div className="slot-meta">{grams(s.item.weight)}{s.item.huid_code ? ` · ${s.item.huid_code}` : ''}</div>
                      <div className="slot-meta">Added {formatDate(s.item.date_added)}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setMovingPiece({ ...s.item, tray_name: trayDetail.tray.name, location_path: trayDetail.tray.location_path })}>Move</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setRemoving(s.item)}>Remove</button>
                      </div>
                    </>
                  ) : (
                    <button className="btn btn-sm" onClick={() => setAddingSlot(s.slot_no)}>Add piece</button>
                  )}
                </div>
              ))}
            </div>

            <h4 style={{ marginTop: 24 }}>Audit this tray</h4>
            <p className="field-hint">Count the pieces and weigh them (without the empty tray). The system compares them with what it expects.</p>
            <form onSubmit={saveAudit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Pieces counted</label>
                  <input type="number" min="0" value={auditForm.physical_count} onChange={(e) => setAuditForm({ ...auditForm, physical_count: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Weighed total (g)</label>
                  <input type="number" step="0.001" min="0" value={auditForm.physical_weight} onChange={(e) => setAuditForm({ ...auditForm, physical_weight: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Audit date</label>
                  <input type="date" value={auditForm.audited_on} onChange={(e) => setAuditForm({ ...auditForm, audited_on: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Note (optional)</label>
                  <input value={auditForm.notes} onChange={(e) => setAuditForm({ ...auditForm, notes: e.target.value })} />
                </div>
              </div>
              <button className="btn" type="submit">Save Audit</button>
            </form>

            {audits.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 16 }}>
                <table>
                  <thead>
                    <tr><th>Date</th><th>System pieces</th><th>Counted</th><th style={{ textAlign: 'right' }}>System weight</th><th style={{ textAlign: 'right' }}>Weighed</th><th style={{ textAlign: 'right' }}>Difference</th></tr>
                  </thead>
                  <tbody>
                    {audits.map((a) => (
                      <tr key={a.id}>
                        <td>{formatDate(a.audited_on)}</td><td>{a.system_count}</td><td>{a.physical_count}</td>
                        <td style={{ textAlign: 'right' }}>{grams(a.system_weight)}</td>
                        <td style={{ textAlign: 'right' }}>{grams(a.physical_weight)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`badge ${Math.abs(Number(a.difference)) < 0.0005 && a.system_count === a.physical_count ? 'green' : 'red'}`}>{Number(a.difference).toFixed(3)} g</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* ---- Add a piece to a slot ---- */}
      <Modal
        open={addingSlot !== null}
        title={`Add piece to slot ${addingSlot ?? ''}`}
        onClose={() => setAddingSlot(null)}
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setAddingSlot(null)}>Cancel</button>
            <button className="btn" onClick={addPiece}>Add Piece</button>
          </>
        )}
      >
        <div className="form-group">
          <label>Design</label>
          <select value={pieceForm.product_master_id} onChange={(e) => setPieceForm({ ...pieceForm, product_master_id: e.target.value })}>
            <option value="">Select design</option>
            {designsForTray.map((d) => <option key={d.id} value={d.id}>{d.product_name} ({d.design_code}){d.Category?.name ? ` - ${d.Category.name}` : ''}</option>)}
          </select>
          {designsForTray.length === 0 && <p className="field-hint">No designs yet. Create one under Designs & Categories.</p>}
        </div>
        <div className="form-group">
          <label>Weight (g)</label>
          <input type="number" step="0.001" min="0" value={pieceForm.weight} onChange={(e) => setPieceForm({ ...pieceForm, weight: e.target.value })} />
        </div>
        <div className="form-group">
          <label>HUID (optional, 6 characters)</label>
          <input maxLength={6} value={pieceForm.huid_code} onChange={(e) => setPieceForm({ ...pieceForm, huid_code: e.target.value.toUpperCase() })} />
        </div>
        <div className="form-group">
          <label>Item code (optional)</label>
          <input value={pieceForm.item_code} onChange={(e) => setPieceForm({ ...pieceForm, item_code: e.target.value })} />
          <p className="field-hint">Leave empty to generate one automatically.</p>
        </div>
        <ImageUpload label="Photo of this piece (optional)" value={pieceForm.image_url} onChange={(url) => setPieceForm({ ...pieceForm, image_url: url })} size={72} />
        <p className="field-hint" style={{ marginTop: -8 }}>Leave empty to show the design's own photo.</p>
        <div className="form-group">
          <label>Date added</label>
          <input type="date" value={pieceForm.date_added} onChange={(e) => setPieceForm({ ...pieceForm, date_added: e.target.value })} />
        </div>
      </Modal>

      <MoveDialog
        open={Boolean(movingPiece)} onClose={() => setMovingPiece(null)} title="Move this piece to another tray"
        subjectLabel={movingPiece ? movingPiece.item_code : ''}
        currentPath={movingPiece ? `${movingPiece.tray_name} / slot ${movingPiece.slot_no}${movingPiece.location_path ? ` (${movingPiece.location_path})` : ''}` : ''}
        destinationLabel="Move to tray" note="Only this piece moves. Other pieces of the same design stay where they are."
        options={trays.filter((t) => movingPiece && t.id !== movingPiece.tray_id).map((t) => ({ id: t.id, label: t.name, hint: `${t.location_path || 'Not placed'} · ${t.empty_slots} free`, append: false }))}
        onConfirm={async (trayId, reason) => {
          try {
            await api.post(`/display-trays/pieces/${movingPiece.id}/move`, { tray_id: trayId, reason });
            toast.success('Piece moved');
            setMovingPiece(null);
            refreshAll();
          } catch (err) { toast.error(errorMessage(err, 'Could not move the piece.')); }
        }}
      />

      {/* ---- Move a tray ---- */}
      <Modal
        open={Boolean(movingTray)}
        title={movingTray ? `Move ${movingTray.name}` : ''}
        onClose={() => setMovingTray(null)}
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setMovingTray(null)}>Cancel</button>
            <button className="btn" onClick={moveTray} disabled={!moveForm.location_id}>Move</button>
          </>
        )}
      >
        {movingTray && <p className="field-hint">Now at: {movingTray.location_path || 'Not placed'}</p>}
        <div className="form-group">
          <label>Move to (counter or box)</label>
          <select value={moveForm.location_id} onChange={(e) => setMoveForm({ ...moveForm, location_id: e.target.value })}>
            <option value="">Select destination</option>
            {places.filter((o) => !movingTray || o.id !== movingTray.location_id).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label>Reason (optional)</label>
          <input value={moveForm.reason} onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })} />
        </div>
      </Modal>

      {/* ---- Remove a piece ---- */}
      <Modal
        open={Boolean(removing)}
        title={removing ? `Remove ${removing.item_code}` : ''}
        onClose={() => setRemoving(null)}
        footer={(
          <>
            <button className="btn btn-secondary" onClick={() => setRemoving(null)}>Cancel</button>
            <button className="btn" onClick={removePiece}>Confirm</button>
          </>
        )}
      >
        <div className="form-group">
          <label>What happened to this piece?</label>
          <select value={removeForm.outcome} onChange={(e) => setRemoveForm({ ...removeForm, outcome: e.target.value })}>
            <option value="SOLD">Sold (without a bill)</option>
            <option value="REMOVED">Taken off the tray (back to the store)</option>
          </select>
          <p className="field-hint">Pieces sold through Billing are removed from the tray automatically.</p>
        </div>
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={removeForm.date} onChange={(e) => setRemoveForm({ ...removeForm, date: e.target.value })} />
        </div>
        <div className="form-group">
          <label>Note (optional)</label>
          <input value={removeForm.reason} onChange={(e) => setRemoveForm({ ...removeForm, reason: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
