// src/pages/inventory/ItemList.jsx
// The stock list. There is one storage (the wholesale store) and a display tray that stock is
// moved into. So each row is one lot, split into two quantities: pieces still in the wholesale
// store, and pieces on the tray. Wholesale stock shows the wholesale price, tray stock shows
// the retail price.
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import {
  PageHeader, Card, Tabs, DataState, TableWrap, StatusBadge,
  money, grams, titleCase,
} from '../../components/ui';

const TABS = [
  { key: 'ALL', label: 'All stock' },
  { key: 'WHOLESALE', label: 'In wholesale store' },
  { key: 'TRAY', label: 'On tray' },
];

// Pieces / weight of a row in each bucket.
function wholesalePieces(item) {
  if (item.mode === 'PIECE') return item.is_tray_display ? 0 : 1;
  return Number(item.BulkItem?.total_pieces || 0);
}
function trayPieces(item) {
  if (item.mode === 'PIECE') return item.is_tray_display ? 1 : 0;
  return Number(item.BulkItem?.tray_pieces || 0);
}
function weightOf(item, activeTab) {
  if (item.mode === 'PIECE') return item.MetalDetail?.gross_weight;
  const w = Number(item.BulkItem?.total_gross_weight || 0);
  const t = Number(item.BulkItem?.tray_gross_weight || 0);
  if (activeTab === 'WHOLESALE') return w;
  if (activeTab === 'TRAY') return t;
  return w + t;
}
function qtyFor(item, activeTab) {
  if (activeTab === 'WHOLESALE') return wholesalePieces(item);
  if (activeTab === 'TRAY') return trayPieces(item);
  return wholesalePieces(item) + trayPieces(item);
}

export default function ItemList() {
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');

  const { data, loading, error, reload } = useFetch('/items', { initialData: [] });

  const items = Array.isArray(data) ? data : [];

  const filtered = useMemo(() => {
    const inTab = items.filter((i) => {
      if (activeTab === 'WHOLESALE') return wholesalePieces(i) > 0;
      if (activeTab === 'TRAY') return trayPieces(i) > 0;
      return true;
    });
    const q = search.trim().toLowerCase();
    if (!q) return inTab;
    return inTab.filter((i) => [
      i.ProductMaster?.product_name,
      i.ProductMaster?.design_code,
      i.ProductMaster?.Category?.name,
      i.barcode_value,
      i.huid_code,
      i.Location?.name,
    ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [items, search, activeTab]);

  const totalPieces = filtered.reduce((sum, i) => sum + qtyFor(i, activeTab), 0);

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Every lot currently in inventory. Prices are calculated live from today's metal rate, so they update on their own when the rate changes."
        actions={<Link className="btn" to="/inventory/items/new">Add stock</Link>}
      />

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <Card
        title={activeTab === 'TRAY' ? 'Showing (tray)' : titleCase(activeTab === 'ALL' ? 'All stock' : activeTab)}
        note={filtered.length
          ? (activeTab === 'TRAY'
            ? `${filtered.length} design(s) on tray · ${totalPieces} piece(s) currently displayed`
            : `${filtered.length} lot(s) · ${totalPieces} piece(s)`)
          : undefined}
        actions={(
          <input
            className="search-input"
            type="search"
            placeholder="Search design, code, barcode or location"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        bodyClass="tight"
      >
        <DataState
          loading={loading}
          error={error}
          onRetry={reload}
          empty={!loading && !error && filtered.length === 0}
          emptyProps={{
            title: search
              ? 'No matching stock'
              : (activeTab === 'TRAY' ? 'Nothing on tray right now' : 'No stock in this view'),
            text: search
              ? 'Try a different search term, or switch tabs.'
              : (activeTab === 'TRAY'
                ? 'No design has any pieces on the tray. Move some from Stock Operations → Tray Transfer.'
                : 'Add stock to see it here. Adding the same design again merges into the existing lot instead of creating a duplicate.'),
            action: !search && activeTab === 'ALL'
              ? <Link className="btn" to="/inventory/items/new">Add stock</Link> : null,
          }}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>Photo</th>
                  <th>Design</th>
                  <th>Metal</th>
                  <th className="num">Weight</th>
                  <th className="num">Qty</th>
                  <th>Wholesale / Tray</th>
                  <th>Location</th>
                  <th className="num">Price / piece</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const wholesalePrice = i.bucket_pricing?.wholesale;
                  const trayPrice = i.bucket_pricing?.tray;
                  const qty = qtyFor(i, activeTab);
                  const weight = weightOf(i, activeTab);
                  return (
                    <tr key={i.id}>
                      <td>
                        {i.ItemImages?.[0]
                          ? <img className="thumb" src={i.ItemImages[0].image_url} alt="" />
                          : <div className="thumb" />}
                      </td>
                      <td>
                        <div className="cell-title">{i.ProductMaster?.product_name}</div>
                        <div className="cell-sub">
                          {i.ProductMaster?.design_code}
                          {i.ProductMaster?.Category?.name ? ` · ${i.ProductMaster.Category.name}` : ''}
                        </div>
                      </td>
                      <td>
                        {titleCase(i.MetalDetail?.metal_type)}
                        <div className="cell-sub">{i.MetalDetail?.purity}</div>
                      </td>
                      <td className="num">{grams(weight)}</td>
                      <td className="num">{qty}</td>
                      <td>{wholesalePieces(i)} in store · {trayPieces(i)} on tray</td>
                      <td>{i.Location?.name || <span className="subtle">—</span>}</td>
                      <td className="num">
                        {activeTab !== 'TRAY' && wholesalePieces(i) > 0 && (
                          wholesalePrice?.error
                            ? <span className="badge red" title={wholesalePrice.error}>No price</span>
                            : <div><strong>{money(wholesalePrice?.final_price)}</strong> <span className="cell-sub">wholesale</span></div>
                        )}
                        {activeTab !== 'WHOLESALE' && trayPieces(i) > 0 && (
                          trayPrice?.error
                            ? <span className="badge red" title={trayPrice.error}>No price</span>
                            : <div><strong>{money(trayPrice?.final_price)}</strong> <span className="cell-sub">retail</span></div>
                        )}
                      </td>
                      <td><StatusBadge value={i.status} /></td>
                      <td>
                        <div className="row-actions">
                          <Link className="btn btn-secondary btn-sm" to={`/inventory/items/${i.id}`}>
                            Open
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        </DataState>
      </Card>
    </div>
  );
}
