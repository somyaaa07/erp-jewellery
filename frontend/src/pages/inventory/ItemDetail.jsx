// src/pages/inventory/ItemDetail.jsx
// Shows one stock lot with its live price and the full breakdown of how that price was
// reached. Only the item's own channel is priced, because that is the only price it sells at.
import React from 'react';
import { useParams, Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import {
  PageHeader, Card, DataState, TableWrap, StatusBadge, ChannelBadge,
  money, grams, titleCase, formatDateTime,
} from '../../components/ui';

function Detail({ label, children }) {
  return (
    <div className="detail-item">
      <div className="k">{label}</div>
      <div className="v">{children ?? <span className="subtle">—</span>}</div>
    </div>
  );
}

export default function ItemDetail() {
  const { id } = useParams();
  const { data: item, loading, error, reload } = useFetch(`/items/${id}`);

  if (loading || error || !item) {
    return (
      <div>
        <PageHeader title="Stock item" actions={<Link className="btn btn-secondary" to="/inventory/items">Back to stock</Link>} />
        <Card>
          <DataState loading={loading} error={error} onRetry={reload} empty={!loading && !error && !item}
            emptyProps={{ title: 'Item not found', text: 'This stock lot may have been sold or removed.' }}>
            <div />
          </DataState>
        </Card>
      </div>
    );
  }

  const price = item.pricing?.price;
  const priceError = item.pricing?.error;
  const breakdown = price?.breakdown || {};
  const isBulk = item.mode === 'BULK';

  return (
    <div>
      <PageHeader
        title={item.ProductMaster?.product_name || 'Stock item'}
        subtitle={[item.ProductMaster?.design_code, item.ProductMaster?.Category?.name]
          .filter(Boolean).join(' · ')}
        actions={<Link className="btn btn-secondary" to="/inventory/items">Back to stock</Link>}
      />

      <div className="two-col">
        <div>
          <Card title="Stock details">
            <div className="detail-grid">
              <Detail label="Status"><StatusBadge value={item.status} /></Detail>
              <Detail label="Channel"><ChannelBadge channel={item.channel} /></Detail>
              <Detail label="Inventory mode">{isBulk ? 'Bulk lot' : 'Single piece'}</Detail>
              <Detail label="Source">{titleCase(item.source_type)}</Detail>
              <Detail label="Location">{item.Location?.name}</Detail>
              <Detail label="Tray display">{item.is_tray_display ? 'Yes' : 'No'}</Detail>
              <Detail label="Metal">
                {titleCase(item.MetalDetail?.metal_type)} {item.MetalDetail?.purity}
              </Detail>
              <Detail label="Gender">{titleCase(item.ProductMaster?.gender_category)}</Detail>
              <Detail label="HUID">{item.huid_code}</Detail>
              {isBulk ? (
                <>
                  <Detail label="Pieces in lot">{item.BulkItem?.total_pieces}</Detail>
                  <Detail label="Total gross weight">{grams(item.BulkItem?.total_gross_weight)}</Detail>
                  <Detail label="Total net weight">{grams(item.BulkItem?.total_net_weight)}</Detail>
                </>
              ) : (
                <>
                  <Detail label="SKU"><span className="mono">{item.PieceItem?.sku}</span></Detail>
                  <Detail label="Gross weight">{grams(item.PieceItem?.gross_weight)}</Detail>
                  <Detail label="Less weight">{grams(item.PieceItem?.less_weight)}</Detail>
                </>
              )}
              <Detail label="Last moved">
                {item.last_moved_at ? formatDateTime(item.last_moved_at) : null}
              </Detail>
            </div>
          </Card>

          {item.ItemImages?.length > 0 && (
            <Card title="Photos">
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {item.ItemImages.slice().sort((a, b) => a.sort_order - b.sort_order).map((img) => (
                  <img
                    key={img.id}
                    src={img.image_url}
                    alt={item.ProductMaster?.product_name}
                    style={{
                      width: 108, height: 108, objectFit: 'cover',
                      borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                    }}
                  />
                ))}
              </div>
            </Card>
          )}

          {item.StoneDetails?.length > 0 && (
            <Card title="Stones" bodyClass="tight">
              <TableWrap>
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th className="num">Pieces</th>
                      <th className="num">Carat</th>
                      <th className="num">Rate / carat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.StoneDetails.map((s) => (
                      <tr key={s.id}>
                        <td>{titleCase(s.stone_type)}</td>
                        <td className="num">{s.stone_pieces_count}</td>
                        <td className="num">{s.stone_weight_carat}</td>
                        <td className="num">{money(s.stone_rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          )}
        </div>

        <div className="sticky-summary">
          <Card
            title="Live price"
            note={`${item.channel === 'WHOLESALE' ? 'Wholesale' : 'Retail'} price, per piece`}
          >
            {priceError ? (
              <div className="alert alert-warn" style={{ marginBottom: 0 }}>
                <div>
                  <div className="alert-title">Price cannot be calculated yet</div>
                  {priceError}
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>
                  {money(price?.final_price, { decimals: 2 })}
                </div>
                <p className="field-hint" style={{ marginBottom: 14 }}>
                  {price?.is_override
                    ? 'This price was set manually and does not follow the formula.'
                    : "Recalculated from today's metal rate every time this page loads."}
                </p>

                {!price?.is_override && (
                  <div className="stack-sm" style={{ fontSize: 13 }}>
                    <div className="split"><span className="muted">Rate used</span><span>{money(breakdown.gold_rate_used, { decimals: 2 })}/g</span></div>
                    <div className="split"><span className="muted">Net weight</span><span>{grams(breakdown.net_weight)}</span></div>
                    <div className="split"><span className="muted">Metal value</span><span>{money(breakdown.gold_value, { decimals: 2 })}</span></div>
                    <div className="split"><span className="muted">Making charge</span><span>{money(breakdown.making_charge, { decimals: 2 })}</span></div>
                    <div className="split"><span className="muted">Wastage ({breakdown.wastage_percent}%)</span><span>{money(breakdown.wastage_amount, { decimals: 2 })}</span></div>
                    {Number(breakdown.stone_value) > 0 && (
                      <div className="split"><span className="muted">Stones</span><span>{money(breakdown.stone_value, { decimals: 2 })}</span></div>
                    )}
                    {Number(breakdown.other_charges) > 0 && (
                      <div className="split"><span className="muted">Other charges</span><span>{money(breakdown.other_charges, { decimals: 2 })}</span></div>
                    )}
                    <div className="split" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <span className="muted">Subtotal</span><span>{money(breakdown.subtotal, { decimals: 2 })}</span>
                    </div>
                    <div className="split"><span className="muted">GST ({breakdown.gst_percent}%)</span><span>{money(breakdown.gst_amount, { decimals: 2 })}</span></div>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card title="Label & scan">
            {item.qr_code_data_url ? (
              <img
                src={item.qr_code_data_url}
                alt="Item QR code"
                style={{ width: '100%', maxWidth: 190, margin: '0 auto', display: 'block' }}
              />
            ) : (
              <p className="muted" style={{ fontSize: 13 }}>No QR code generated for this lot.</p>
            )}
            <p className="mono" style={{ marginTop: 10, textAlign: 'center', wordBreak: 'break-all', color: 'var(--text-muted)' }}>
              {item.barcode_value}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
