// Interactive hierarchy diagram built from the saved location tree:
//   Safe > Box > Nested box > Tray > Design, and Counter > Tray > Design.
// Pan by dragging, zoom with the buttons or the mouse wheel, fit to screen, collapse branches.
// The path from the root to the selected container is highlighted, and so are search matches.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import DesignImage from './DesignImage';

const NODE_W = 232;
const NODE_H = 56;
const COL_W = 290;
const ROW_GAP = 12;
const MAX_DESIGN_LEAVES = 8;

export const TYPE_STYLE = {
  SAFE: { color: '#3b4a8a', bg: '#eef0f8', label: 'Safe' },
  BOX: { color: '#8a5314', bg: '#fbf1e1', label: 'Box' },
  COUNTER: { color: '#1f6f68', bg: '#e9f4f1', label: 'Counter' },
  SHELF: { color: '#6b3fa0', bg: '#f3eef9', label: 'Shelf' },
  OTHER: { color: '#6b6153', bg: '#f5f0e6', label: 'Place' },
  TRAY: { color: '#2e6b3a', bg: '#ebf4e8', label: 'Tray' },
  DESIGN: { color: '#4a4034', bg: '#fffefa', label: 'Design' },
};

export function Glyph({ type, size = 18, color = 'currentColor' }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (type) {
    case 'SAFE': return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="12" cy="12" r="3.2" /><path d="M12 8.8v-1M12 16.2v1M8.8 12h-1M16.2 12h1" /></svg>;
    case 'BOX': return <svg {...p}><path d="M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8" /></svg>;
    case 'TRAY': return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="1.5" /><path d="M3 12h18M9 6v12M15 6v12" /></svg>;
    case 'COUNTER': return <svg {...p}><path d="M3 9h18M5 9v10M19 9v10M3 9l2-4h14l2 4" /></svg>;
    case 'SHELF': return <svg {...p}><path d="M3 6h18M3 13h18M3 20h18M6 6v7M18 13v7" /></svg>;
    case 'DESIGN': return <svg {...p}><path d="M6 3h12l3 6-9 12L3 9z" /><path d="M3 9h18M9 3l3 6 3-6M12 21V9" /></svg>;
    default: return <svg {...p}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

// Turns the saved tree into the nodes that are visible right now (respecting collapsed branches).
function buildVisible(tree, expanded) {
  const rows = [];
  const edges = [];
  let nextY = 0;

  const place = (node, depth, parentKey) => {
    const key = node.key;
    const kids = node.kids || [];
    const open = expanded.has(key) && kids.length > 0;
    let y;
    if (!open) {
      y = nextY;
      nextY += NODE_H + ROW_GAP;
    } else {
      const childYs = [];
      kids.forEach((k) => childYs.push(place(k, depth + 1, key)));
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }
    rows.push({ ...node, depth, x: depth * COL_W, y, open, parentKey });
    if (parentKey) edges.push({ from: parentKey, to: key });
    return y;
  };

  tree.forEach((root) => place(root, 0, null));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return { rows, edges, byKey, width: Math.max(0, ...rows.map((r) => r.x + NODE_W)), height: Math.max(0, nextY - ROW_GAP) };
}

// Adds trays and designs under each container, with long design lists folded into "+N more".
export function toDiagramTree(nodes) {
  const convert = (n) => {
    const kids = [];
    n.children.forEach((c) => kids.push(convert(c)));
    n.trays.forEach((t) => kids.push({
      key: `t:${t.id}`, kind: 'TRAY', type: 'TRAY', id: t.id, containerId: n.id, name: t.name,
      sub: `${t.present}/${t.total_slots} slots`,
      kids: t.designs.map((d) => ({
        key: `td:${t.id}:${d.product_master_id}`, kind: 'DESIGN', type: 'DESIGN', id: d.product_master_id, containerId: n.id, trayId: t.id,
        name: d.design_name, sub: `${d.design_code} · ${d.pieces} pc`, image: d.image_url, code: d.design_code, kids: [],
      })),
    }));
    const shown = n.lots.slice(0, MAX_DESIGN_LEAVES);
    shown.forEach((l) => kids.push({
      key: `d:${l.item_id}`, kind: 'DESIGN', type: 'DESIGN', id: l.product_master_id, containerId: n.id, name: l.design_name,
      sub: `${l.design_code} · ${l.quantity_status === 'CONFIRMED' ? `${l.pieces} pc` : (l.quantity_status === 'UNKNOWN' ? 'qty not final' : 'with karigar')}`,
      image: l.image_url, code: l.design_code, status: l.quantity_status, kids: [],
    }));
    if (n.lots.length > MAX_DESIGN_LEAVES) {
      kids.push({
        key: `more:${n.id}`, kind: 'MORE', type: 'DESIGN', id: n.id, containerId: n.id,
        name: `+${n.lots.length - MAX_DESIGN_LEAVES} more designs`, sub: 'Open this box to see all', kids: [],
      });
    }
    return {
      key: `c:${n.id}`, kind: 'CONTAINER', type: n.container_type, id: n.id, containerId: n.id, name: n.name,
      sub: `L${n.level} · ${n.total.designs} design${n.total.designs === 1 ? '' : 's'}${n.total.trays ? ` · ${n.total.trays} tray${n.total.trays === 1 ? '' : 's'}` : ''}`,
      unknown: n.total.unknown_lots, kids,
    };
  };
  return nodes.map(convert);
}

export default function StorageDiagram({ nodes, selectedId, focus, onSelect, searchText, highlightIds }) {
  const diagramTree = useMemo(() => toDiagramTree(nodes), [nodes]);
  const [expanded, setExpanded] = useState(() => {
    const s = new Set();
    diagramTree.forEach((r) => { s.add(r.key); r.kids.forEach((k) => { if (k.kind === 'CONTAINER') s.add(k.key); }); });
    return s;
  });
  const [view, setView] = useState({ x: 16, y: 16, k: 1 });
  const wrapRef = useRef(null);
  const drag = useRef(null);

  const { rows, edges, byKey, width, height } = useMemo(() => buildVisible(diagramTree, expanded), [diagramTree, expanded]);

  // Ancestors of the selected container: this is the path that gets highlighted.
  const pathKeys = useMemo(() => {
    const set = new Set();
    let cur = byKey.get(`c:${selectedId}`);
    while (cur) { set.add(cur.key); cur = cur.parentKey ? byKey.get(cur.parentKey) : null; }
    return set;
  }, [byKey, selectedId]);

  const needle = (searchText || '').trim().toLowerCase();
  const matches = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      const hit = (needle && `${r.name} ${r.code || ''}`.toLowerCase().includes(needle)) || (highlightIds && r.kind === 'CONTAINER' && highlightIds.has(r.id));
      if (hit) set.add(r.key);
    });
    return set;
  }, [rows, needle, highlightIds]);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el || !width) return;
    const k = Math.min((el.clientWidth - 32) / width, (el.clientHeight - 32) / Math.max(height, 1), 1);
    setView({ x: 16, y: 16, k: Math.max(0.25, k) });
  }, [width, height]);

  useLayoutEffect(() => { fit(); }, [nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open every branch above a container (used when a search result or link points to it).
  useEffect(() => {
    if (!selectedId) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      const find = (list, trail) => {
        for (const n of list) {
          const t = [...trail, n.key];
          if (n.key === `c:${selectedId}`) { trail.forEach((k) => next.add(k)); next.add(n.key); return true; }
          if (find(n.kids || [], t)) return true;
        }
        return false;
      };
      find(diagramTree, []);
      return next;
    });
  }, [selectedId, diagramTree]);

  // Wheel zoom around the pointer (needs a non-passive listener to stop the page from scrolling).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      setView((v) => {
        const k = Math.min(2, Math.max(0.25, v.k * (e.deltaY < 0 ? 1.1 : 0.9)));
        const ratio = k / v.k;
        return { k, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoom = (f) => setView((v) => ({ ...v, k: Math.min(2, Math.max(0.25, v.k * f)) }));
  const toggle = (key) => setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const expandAll = () => {
    const all = new Set();
    const walk = (list) => list.forEach((n) => { all.add(n.key); walk(n.kids || []); });
    walk(diagramTree);
    setExpanded(all);
  };
  const collapseAll = () => setExpanded(new Set());

  const onPointerDown = (e) => {
    if (e.target.closest('[data-node]')) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setView((v) => ({ ...v, x: drag.current.vx + e.clientX - drag.current.x, y: drag.current.vy + e.clientY - drag.current.y }));
  };
  const onPointerUp = () => { drag.current = null; };

  const edgePath = (a, b) => {
    const x1 = a.x + NODE_W; const y1 = a.y + NODE_H / 2;
    const x2 = b.x; const y2 = b.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => zoom(1.2)} aria-label="Zoom in">Zoom +</button>
        <button className="btn btn-secondary btn-sm" onClick={() => zoom(1 / 1.2)} aria-label="Zoom out">Zoom −</button>
        <button className="btn btn-secondary btn-sm" onClick={fit}>Fit to screen</button>
        <button className="btn btn-secondary btn-sm" onClick={expandAll}>Expand all</button>
        <button className="btn btn-secondary btn-sm" onClick={collapseAll}>Collapse all</button>
        <span className="cell-sub" style={{ alignSelf: 'center' }}>Drag to pan · scroll to zoom · {Math.round(view.k * 100)}%</span>
      </div>

      <div
        ref={wrapRef}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        style={{
          position: 'relative', height: 'min(70vh, 620px)', overflow: 'hidden', borderRadius: 10, touchAction: 'none',
          border: '1px solid #e8dcc4', cursor: drag.current ? 'grabbing' : 'grab',
          background: 'radial-gradient(circle, #e8dcc4 1px, transparent 1px) 0 0 / 22px 22px, #faf7f0',
        }}
      >
        {rows.length === 0 && <p className="field-hint" style={{ padding: 16 }}>No storage locations yet. Use "Add container" to create the first one.</p>}
        <div style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width, height }}>
          <svg width={width} height={Math.max(height, 1)} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}>
            {edges.map((e) => {
              const a = byKey.get(e.from); const b = byKey.get(e.to);
              if (!a || !b) return null;
              const onPath = pathKeys.has(e.from) && pathKeys.has(e.to);
              return <path key={`${e.from}>${e.to}`} d={edgePath(a, b)} fill="none" stroke={onPath ? '#98752f' : '#d6c7a3'} strokeWidth={onPath ? 2.6 : 1.4} />;
            })}
          </svg>

          {rows.map((r) => {
            const st = TYPE_STYLE[r.type] || TYPE_STYLE.OTHER;
            const selected = r.kind === 'CONTAINER' ? r.id === selectedId && !focus : (focus && focus.key === r.key);
            const onPath = pathKeys.has(r.key);
            const hit = matches.has(r.key);
            const hasKids = (r.kids || []).length > 0;
            return (
              <div
                key={r.key} data-node
                role="button" tabIndex={0}
                onClick={() => onSelect({ kind: r.kind, id: r.id, containerId: r.containerId, key: r.key, trayId: r.trayId })}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelect({ kind: r.kind, id: r.id, containerId: r.containerId, key: r.key, trayId: r.trayId }); }}
                style={{
                  position: 'absolute', left: r.x, top: r.y, width: NODE_W, height: NODE_H, boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', borderRadius: 10, cursor: 'pointer',
                  background: st.bg, border: `${selected || hit ? 2.5 : 1.5}px solid ${hit ? '#2f6fa8' : (selected ? '#98752f' : (onPath ? '#d4af37' : '#d6c7a3'))}`,
                  boxShadow: selected ? '0 4px 14px rgba(152,117,47,.28)' : '0 1px 2px rgba(48,41,31,.07)',
                  borderLeft: `5px solid ${st.color}`,
                }}
              >
                {r.kind === 'DESIGN' ? <DesignImage src={r.image} alt={r.name} size={38} /> : <span style={{ color: st.color, display: 'flex' }}><Glyph type={r.type} size={22} /></span>}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.name}>{r.name}</div>
                  <div style={{ fontSize: 11, color: '#756b5d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.kind !== 'DESIGN' && r.kind !== 'MORE' && <span style={{ color: st.color, fontWeight: 600 }}>{st.label} · </span>}{r.sub}
                  </div>
                </div>
                {r.unknown > 0 && <span title={`${r.unknown} design(s) with quantity not final`} style={{ width: 8, height: 8, borderRadius: 8, background: '#c77700', flex: 'none' }} />}
                {hasKids && (
                  <button
                    type="button" aria-label={r.open ? 'Collapse' : 'Expand'}
                    onClick={(e) => { e.stopPropagation(); toggle(r.key); }}
                    style={{ border: '1px solid #d6c7a3', background: '#fffefa', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', flex: 'none', lineHeight: 1 }}
                  >
                    {r.open ? '−' : r.kids.length}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: '#6b6153' }}>
        {['SAFE', 'BOX', 'COUNTER', 'TRAY', 'DESIGN'].map((t) => (
          <span key={t} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
            <span style={{ color: TYPE_STYLE[t].color, display: 'flex' }}><Glyph type={t} size={14} /></span>{TYPE_STYLE[t].label}
          </span>
        ))}
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 8, height: 8, borderRadius: 8, background: '#c77700' }} />Has quantity not final</span>
        <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 18, height: 3, background: '#98752f' }} />Path to selected</span>
      </div>
    </div>
  );
}
