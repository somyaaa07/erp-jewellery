// Find stock: search every tray and wholesale box at once, by design, tray, counter or place.
// Results show where each thing is RIGHT NOW.
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/axios';
import useBranchScope, { BranchPicker } from '../../hooks/useBranchScope';
import useLocationOptions from '../../hooks/useLocationOptions';
import DesignImage from '../../components/DesignImage';
import { QuantityBadge } from './StorageMap';
import { Card, DataState, PageHeader, errorMessage, grams } from '../../components/ui';

export default function FindStock() {
  const scope = useBranchScope();
  const { options, counters } = useLocationOptions(scope);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ q: '', counter_id: '', location_id: '', category_id: '', kind: '', quantity_status: '' });
  const [result, setResult] = useState({ rows: [], count: 0, totals: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/categories').then((r) => setCategories(r.data)).catch(() => {}); }, []);

  useEffect(() => {
    if (!scope.ready) return undefined;
    const timer = setTimeout(async () => {
      setLoading(true); setError('');
      try {
        const params = { ...scope.params };
        Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
        const { data } = await api.get('/inventory-search', { params });
        setResult(data);
      } catch (err) { setError(errorMessage(err, 'Search failed.')); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [filters, scope.ready, scope.branchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div>
      <PageHeader
        title="Find Stock"
        subtitle="Search by design, tray, counter or place. Results show where each tray or box is right now."
        actions={<BranchPicker scope={scope} />}
      />
      <Card>
        <div className="form-grid">
          <div className="form-group"><label>Design, tray, item code, HUID or place</label><input value={filters.q} onChange={set('q')} placeholder="e.g. D1, T2, Counter C1" /></div>
          <div className="form-group"><label>Counter</label>
            <select value={filters.counter_id} onChange={set('counter_id')}>
              <option value="">All counters</option>{counters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Box or place</label>
            <select value={filters.location_id} onChange={set('location_id')}>
              <option value="">Anywhere</option>{options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Category (optional)</label>
            <select value={filters.category_id} onChange={set('category_id')}>
              <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group"><label>Where</label>
            <select value={filters.kind} onChange={set('kind')}>
              <option value="">Trays and wholesale</option><option value="TRAY">Trays only</option><option value="WHOLESALE">Wholesale boxes only</option>
            </select>
          </div>
          <div className="form-group"><label>Quantity</label>
            <select value={filters.quantity_status} onChange={set('quantity_status')}>
              <option value="">Any</option><option value="CONFIRMED">Confirmed</option>
              <option value="UNKNOWN">Not finalised</option><option value="ISSUED_TO_KARIGAR">With karigar</option>
            </select>
          </div>
        </div>
      </Card>

      <DataState loading={loading} error={error}>
        <Card
          title="Results"
          note={result.totals ? `${result.count} result(s) · ${result.totals.tray_pieces} piece(s) on trays · ${result.totals.wholesale_pieces} piece(s) in wholesale` : undefined}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Design</th><th>Where</th><th>Tray</th><th>Counter</th><th>Location</th><th style={{ textAlign: 'right' }}>Pieces</th><th style={{ textAlign: 'right' }}>Weight</th><th>Quantity</th><th /></tr>
              </thead>
              <tbody>
                {result.rows.length === 0 && <tr><td colSpan={9}>Nothing found.</td></tr>}
                {result.rows.map((r, i) => (
                  <tr key={`${r.kind}-${r.tray_id || r.item_id}-${r.product_master_id}-${i}`}>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <DesignImage src={r.image_url} alt={r.design_name} />
                        <div><Link to={`/inventory/designs/${r.product_master_id}`} className="cell-title">{r.design_name}</Link><div className="cell-sub">{r.design_code}{r.category ? ` · ${r.category}` : ''}</div></div>
                      </div>
                    </td>
                    <td><span className={`badge ${r.kind === 'TRAY' ? 'green' : 'yellow'}`}>{r.kind === 'TRAY' ? 'On tray' : 'Wholesale'}</span></td>
                    <td>{r.tray_name || '—'}</td>
                    <td>{r.counter || '—'}</td>
                    <td>{r.location_path}</td>
                    <td style={{ textAlign: 'right' }}>{r.quantity_status === 'CONFIRMED' ? r.pieces : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{r.quantity_status === 'CONFIRMED' ? grams(r.weight) : '—'}</td>
                    <td><QuantityBadge status={r.quantity_status} pieces={r.pieces} /></td>
                    <td>{r.location_id ? <Link className="btn btn-secondary btn-sm" to={`/inventory/storage-map?location=${r.location_id}`}>Show on map</Link> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </DataState>
    </div>
  );
}
