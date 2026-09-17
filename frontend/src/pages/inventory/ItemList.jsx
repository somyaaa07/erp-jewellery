// src/pages/inventory/ItemList.jsx
// The stock list. Each row shows ONE price - the price for the channel that piece of stock
// came in on. There is no longer a "Retail price" and "Wholesale price" column pair, because
// an item is either retail stock or wholesale stock, never both.
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import {
  PageHeader, Card, Tabs, DataState, TableWrap, StatusBadge, ChannelBadge,
  money, grams, titleCase,
} from '../../components/ui';

const TABS = [
  { key: 'ALL', label: 'All stock' },
  { key: 'RETAIL', label: 'Retail' },
  { key: 'WHOLESALE', label: 'Wholesale' },
  { key: 'TRAY', label: 'On tray display' },
];

export default function ItemList() {
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');

  const query = activeTab === 'ALL' ? '/items' : `/items?channel=${activeTab}`;
  const { data, loading, error, reload } = useFetch(query, { initialData: [] });

  const items = Array.isArray(data) ? data : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => [
      i.ProductMaster?.product_name,
      i.ProductMaster?.design_code,
      i.ProductMaster?.Category?.name,
      i.barcode_value,
      i.huid_code,
      i.Location?.name,
    ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [items, search]);

  const totalPieces = filtered.reduce(
    (sum, i) => sum + (i.mode === 'BULK' ? Number(i.BulkItem?.total_pieces || 0) : 1),
    0,
  );

  return (
    <div>
      <PageHeader
        title="Stock"
        subtitle="Every lot currently in inventory. Prices are calculated live from today's metal rate, so they update on their own when the rate changes."
        actions={<Link className="btn" to="/inventory/items/new">Add stock</Link>}
      />

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <Card
        title={`${titleCase(activeTab === 'ALL' ? 'All stock' : activeTab)}`}
        note={filtered.length ? `${filtered.length} lot(s) · ${totalPieces} piece(s)` : undefined}
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
            title: search ? 'No matching stock' : 'No stock in this view',
            text: search
              ? 'Try a different search term, or switch tabs.'
              : 'Add stock to see it here. Adding the same design again merges into the existing lot instead of creating a duplicate.',
            action: !search ? <Link className="btn" to="/inventory/items/new">Add stock</Link> : null,
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
                  <th>Channel</th>
                  <th>Location</th>
                  <th className="num">Price / piece</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => {
                  const priceError = i.pricing?.error;
                  const qty = i.mode === 'BULK' ? Number(i.BulkItem?.total_pieces || 0) : 1;
                  const weight = i.mode === 'BULK'
                    ? i.BulkItem?.total_gross_weight
                    : i.MetalDetail?.gross_weight;
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
                          {i.is_tray_display ? ' · on tray' : ''}
                        </div>
                      </td>
                      <td>
                        {titleCase(i.MetalDetail?.metal_type)}
                        <div className="cell-sub">{i.MetalDetail?.purity}</div>
                      </td>
                      <td className="num">{grams(weight)}</td>
                      <td className="num">{qty}</td>
                      <td><ChannelBadge channel={i.channel} /></td>
                      <td>{i.Location?.name || <span className="subtle">—</span>}</td>
                      <td className="num">
                        {priceError
                          ? <span className="badge red" title={priceError}>No price</span>
                          : <strong>{money(i.pricing?.price?.final_price)}</strong>}
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
