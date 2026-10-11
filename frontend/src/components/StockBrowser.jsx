// Container-first stock view: start at the safes and counters, open a container, and see what is
// inside it (boxes, trays, designs) with photos. The flat inventory list is the other view.
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import DesignImage from './DesignImage';
import { Glyph, TYPE_STYLE } from './StorageDiagram';
import { QuantityBadge } from '../pages/inventory/StorageMap';
import useBranchScope, { BranchPicker } from '../hooks/useBranchScope';
import { Card, DataState, errorMessage, grams } from './ui';

function flatten(nodes, out = []) { nodes.forEach((n) => { out.push(n); flatten(n.children, out); }); return out; }

function ContainerCard({ node, onOpen }) {
  const st = TYPE_STYLE[node.container_type] || TYPE_STYLE.OTHER;
  const t = node.total;
  const previews = [...node.lots, ...node.trays.flatMap((tr) => tr.designs)].filter((d) => d.image_url).slice(0, 3);
  return (
    <button type="button" onClick={() => onOpen(node.id)}
      style={{ textAlign: 'left', padding: 12, borderRadius: 12, border: '1px solid var(--border)', borderLeft: `5px solid ${st.color}`, background: st.bg, cursor: 'pointer' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: st.color, display: 'flex' }}><Glyph type={node.container_type} size={26} /></span>
        <div>
          <div style={{ fontWeight: 700 }}>{node.name}</div>
          <div className="cell-sub">{st.label} · level {node.level}</div>
        </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: 'var(--text)' }}>
        {node.children.length} container{node.children.length === 1 ? '' : 's'} · {t.trays} tray{t.trays === 1 ? '' : 's'} · {t.designs} design{t.designs === 1 ? '' : 's'}
        {t.unknown_lots > 0 && <span className="badge yellow" style={{ marginLeft: 6 }}>{t.unknown_lots} not final</span>}
      </div>
      {previews.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>{previews.map((d, i) => <DesignImage key={i} src={d.image_url} alt={d.design_name} size={34} />)}</div>
      )}
    </button>
  );
}

export default function StockBrowser() {
  const scope = useBranchScope();
  const [tree, setTree] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [contents, setContents] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!scope.ready) return;
    setLoading(true); setError('');
    api.get('/locations/tree', { params: scope.params })
      .then((r) => { setTree(r.data); setCurrentId(null); })
      .catch((e) => setError(errorMessage(e, 'Could not load storage.')))
      .finally(() => setLoading(false));
  }, [scope.ready, scope.branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!currentId) { setContents(null); return; }
    api.get(`/locations/${currentId}/contents`).then((r) => setContents(r.data)).catch(() => setContents(null));
  }, [currentId]);

  const flat = useMemo(() => flatten(tree), [tree]);
  const byId = useMemo(() => new Map(flat.map((n) => [n.id, n])), [flat]);
  const current = currentId ? byId.get(currentId) : null;
  const crumbs = contents?.location?.path_ids || [];
  const shownContainers = current ? current.children : tree;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <nav aria-label="Location path" style={{ fontSize: 15 }}>
          <a href="#!" onClick={(e) => { e.preventDefault(); setCurrentId(null); }}>All storage</a>
          {crumbs.map((id) => (
            <span key={id}> &gt; <a href="#!" onClick={(e) => { e.preventDefault(); setCurrentId(id); }}>{byId.get(id)?.name || id}</a></span>
          ))}
        </nav>
        <BranchPicker scope={scope} />
      </div>

      <DataState loading={loading} error={error}>
        {tree.length === 0 && <Card><p className="field-hint">No storage locations yet. Create them on the Storage Map.</p></Card>}

        {shownContainers.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 16 }}>
            {shownContainers.map((n) => <ContainerCard key={n.id} node={n} onOpen={setCurrentId} />)}
          </div>
        )}

        {current && contents && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {current.parent_id && <button className="btn btn-secondary btn-sm" onClick={() => setCurrentId(current.parent_id)}>Up to parent</button>}
              <Link className="btn btn-secondary btn-sm" to={`/inventory/storage-map?location=${current.id}`}>Show on Storage Map</Link>
            </div>

            {contents.trays.length > 0 && (
              <Card title="Trays in this container">
                {contents.trays.map((tr) => (
                  <div key={tr.id} style={{ marginBottom: 10 }}>
                    <strong>{tr.name}</strong> <span className="cell-sub">{tr.present}/{tr.total_slots} slots</span>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                      {tr.designs.map((d) => (
                        <Link key={d.id} to={`/inventory/designs/${d.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <DesignImage src={d.image_url} alt={d.design_name} size={44} /><span className="cell-sub">{d.design_code}</span>
                        </Link>
                      ))}
                      {tr.designs.length === 0 && <span className="cell-sub">Empty tray</span>}
                    </div>
                  </div>
                ))}
              </Card>
            )}

            <Card title="Designs in this container" note={`${contents.lots.length}`}>
              {contents.lots.length === 0 && <p className="field-hint">No designs stored directly here.</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
                {contents.lots.map((l) => (
                  <Link key={l.item_id} to={`/inventory/designs/${l.product_master_id}`} style={{ display: 'flex', gap: 10, padding: 8, border: '1px solid var(--border)', borderRadius: 10, alignItems: 'center' }}>
                    <DesignImage src={l.image_url} alt={l.design_name} size={56} />
                    <div style={{ minWidth: 0 }}>
                      <div className="cell-title">{l.design_name}</div>
                      <div className="cell-sub">{l.design_code}</div>
                      <div style={{ marginTop: 3 }}><QuantityBadge status={l.quantity_status} pieces={l.pieces} /></div>
                      {l.quantity_status === 'CONFIRMED' && <div className="cell-sub">{grams(l.weight)}</div>}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </>
        )}
      </DataState>
    </div>
  );
}
