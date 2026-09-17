// src/pages/pos/Billing.jsx
//
// Two things changed here:
//
// 1. There is no longer a Retail/Wholesale toggle. Each piece of stock carries the channel it
//    came into inventory on, and that is the price it sells at. Retail stock bills at the retail
//    price, wholesale stock at the wholesale price - the cashier cannot pick the wrong one.
//
// 2. After checkout the bill actually appears. The API returns the full printable invoice, it
//    opens in a modal, and "Print" prints just the bill (index.css hides the rest of the app
//    when printing). Before this, checkout only showed an invoice number and nothing printed.
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import { useFetchAll } from '../../hooks/useFetch';
import InvoiceBill from '../../components/InvoiceBill';
import {
  PageHeader, Card, DataState, Modal, TableWrap, ChannelBadge,
  money, grams, errorMessage,
} from '../../components/ui';

export default function Billing() {
  const { data, loading, error, reload } = useFetchAll({
    items: '/items?status=IN_STOCK',
    customers: '/customers',
  });

  const items = Array.isArray(data.items) ? data.items : [];
  const customers = Array.isArray(data.customers) ? data.customers : [];

  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('ALL');
  const [customerId, setCustomerId] = useState('');
  const [discount, setDiscount] = useState('');
  const [cart, setCart] = useState({});            // item_id -> quantity
  const [invoice, setInvoice] = useState(null);    // the bill returned after checkout
  const [checkingOut, setCheckingOut] = useState(false);

  const availableOf = (item) => (item.mode === 'BULK' ? Number(item.BulkItem?.total_pieces || 0) : 1);
  const unitPriceOf = (item) => Number(item.pricing?.price?.final_price || 0);
  const priceErrorOf = (item) => item.pricing?.error || null;

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (availableOf(i) <= 0) return false;
      if (channelFilter !== 'ALL' && (i.channel || 'RETAIL') !== channelFilter) return false;
      if (!q) return true;
      return [
        i.ProductMaster?.product_name,
        i.ProductMaster?.design_code,
        i.barcode_value,
        i.huid_code,
        i.MetalDetail?.purity,
      ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
    });
  }, [items, search, channelFilter]);

  const setQty = (item, raw) => {
    const max = availableOf(item);
    let qty = raw === '' ? '' : Math.max(0, Math.min(max, Number(raw)));
    setCart((c) => {
      const next = { ...c };
      if (qty === '' || qty === 0) delete next[item.id];
      else next[item.id] = qty;
      return next;
    });
  };

  const cartLines = useMemo(() => Object.entries(cart).map(([itemId, qty]) => {
    const item = items.find((i) => String(i.id) === String(itemId));
    if (!item) return null;
    const unitPrice = unitPriceOf(item);
    return { item, qty: Number(qty), unitPrice, lineTotal: unitPrice * Number(qty) };
  }).filter(Boolean), [cart, items]);

  const cartSubtotal = cartLines.reduce((sum, l) => sum + l.lineTotal, 0);
  const discountValue = Math.min(Number(discount) || 0, cartSubtotal);
  const cartTotal = cartSubtotal - discountValue;

  // A bill made entirely of wholesale stock is a wholesale bill; anything else is retail.
  const billChannel = cartLines.length && cartLines.every((l) => l.item.channel === 'WHOLESALE')
    ? 'WHOLESALE'
    : 'RETAIL';

  const mixedChannels = cartLines.length > 1
    && new Set(cartLines.map((l) => l.item.channel || 'RETAIL')).size > 1;

  const checkout = async () => {
    if (cartLines.length === 0) { toast.error('Add at least one item to the bill'); return; }

    const unpriced = cartLines.find((l) => priceErrorOf(l.item));
    if (unpriced) {
      toast.error(`${unpriced.item.ProductMaster?.product_name} has no price yet: ${priceErrorOf(unpriced.item)}`);
      return;
    }

    setCheckingOut(true);
    try {
      const { data: bill } = await api.post('/sales', {
        customer_id: customerId || undefined,
        discount_amount: discountValue || 0,
        items: cartLines.map((l) => ({ item_id: l.item.id, quantity: l.qty })),
      });
      setInvoice(bill);
      setCart({});
      setDiscount('');
      toast.success(`Invoice ${bill.invoice_number} created`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not complete this sale.'));
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle="Each item is priced on the channel it came into stock on - retail stock at the retail price, wholesale stock at the wholesale price."
        actions={<Link className="btn btn-secondary" to="/pos/invoices">View invoices</Link>}
      />

      <div className="two-col">
        <Card
          title="Available stock"
          note={`${visibleItems.length} item${visibleItems.length === 1 ? '' : 's'} in stock`}
          actions={(
            <>
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                style={{ width: 150 }}
              >
                <option value="ALL">All channels</option>
                <option value="RETAIL">Retail only</option>
                <option value="WHOLESALE">Wholesale only</option>
              </select>
              <input
                className="search-input"
                type="search"
                placeholder="Search name, design code or barcode"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </>
          )}
          bodyClass="tight"
        >
          <DataState
            loading={loading}
            error={error}
            onRetry={reload}
            empty={!loading && !error && visibleItems.length === 0}
            emptyProps={{
              title: search || channelFilter !== 'ALL' ? 'No matching stock' : 'No stock available',
              text: search || channelFilter !== 'ALL'
                ? 'Try clearing the search or the channel filter.'
                : 'Add stock from the Inventory screen before billing.',
            }}
          >
            <TableWrap>
              <table>
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Channel</th>
                    <th>Purity</th>
                    <th className="num">Available</th>
                    <th className="num">Price / piece</th>
                    <th className="num" style={{ width: 110 }}>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((i) => {
                    const priceError = priceErrorOf(i);
                    const available = availableOf(i);
                    return (
                      <tr key={i.id}>
                        <td>
                          <div className="cell-title">{i.ProductMaster?.product_name}</div>
                          <div className="cell-sub">
                            {i.ProductMaster?.design_code}
                            {i.mode === 'BULK'
                              ? ` · ${grams(i.BulkItem?.total_gross_weight)} total`
                              : ` · ${grams(i.MetalDetail?.gross_weight)}`}
                          </div>
                        </td>
                        <td><ChannelBadge channel={i.channel} /></td>
                        <td>{i.MetalDetail?.purity || '—'}</td>
                        <td className="num">{available}</td>
                        <td className="num">
                          {priceError
                            ? <span className="badge red" title={priceError}>No price</span>
                            : <strong>{money(i.pricing?.price?.final_price)}</strong>}
                        </td>
                        <td className="num">
                          <input
                            className="qty-input"
                            type="number"
                            min="0"
                            max={available}
                            disabled={Boolean(priceError)}
                            value={cart[i.id] ?? ''}
                            placeholder="0"
                            onChange={(e) => setQty(i, e.target.value)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          </DataState>
        </Card>

        <div className="sticky-summary">
          <Card title="Current bill" note={cartLines.length ? `${cartLines.length} line item(s)` : 'Empty'}>
            <div className="form-group">
              <label htmlFor="bill-customer">Customer</label>
              <select
                id="bill-customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">Walk-in customer</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>
                ))}
              </select>
              {customers.length === 0 && (
                <p className="field-hint">
                  No customers yet. <Link to="/pos/customers">Add one</Link> to attach them to a bill.
                </p>
              )}
            </div>

            {cartLines.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, padding: '8px 0 12px' }}>
                Enter a quantity against any item on the left to start a bill.
              </p>
            ) : (
              <div className="stack-sm" style={{ marginBottom: 14 }}>
                {cartLines.map((l) => (
                  <div className="split" key={l.item.id} style={{ fontSize: 13 }}>
                    <span style={{ minWidth: 0 }}>
                      {l.item.ProductMaster?.product_name}
                      <span className="subtle"> × {l.qty}</span>
                    </span>
                    <span className="strong">{money(l.lineTotal)}</span>
                  </div>
                ))}
              </div>
            )}

            {mixedChannels && (
              <div className="alert alert-warn">
                <div>
                  This bill mixes retail and wholesale stock. Each line still uses its own price;
                  the invoice itself will be recorded as Retail.
                </div>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="bill-discount">Discount (₹)</label>
              <input
                id="bill-discount"
                type="number"
                min="0"
                step="1"
                value={discount}
                placeholder="0"
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="split" style={{ fontSize: 13, marginBottom: 6 }}>
                <span className="muted">Subtotal (GST included)</span>
                <span>{money(cartSubtotal)}</span>
              </div>
              {discountValue > 0 && (
                <div className="split" style={{ fontSize: 13, marginBottom: 6 }}>
                  <span className="muted">Discount</span>
                  <span>− {money(discountValue)}</span>
                </div>
              )}
              <div className="split" style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>
                <span>Total</span>
                <span>{money(cartTotal)}</span>
              </div>

              {cartLines.length > 0 && (
                <p className="field-hint" style={{ marginBottom: 10 }}>
                  This will be recorded as a <strong>{billChannel === 'WHOLESALE' ? 'Wholesale' : 'Retail'}</strong> invoice.
                </p>
              )}

              <button
                type="button"
                className="btn btn-lg btn-block"
                onClick={checkout}
                disabled={checkingOut || cartLines.length === 0}
              >
                {checkingOut ? <><span className="spinner" /> Creating invoice…</> : 'Checkout & create invoice'}
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* The bill itself. On screen it is a modal; when printed, only this block goes to paper. */}
      <Modal
        open={Boolean(invoice)}
        size="lg"
        title={`Invoice ${invoice?.invoice_number || ''}`}
        onClose={() => setInvoice(null)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setInvoice(null)}>
              Close
            </button>
            <button type="button" className="btn" onClick={() => window.print()}>
              Print bill
            </button>
          </>
        )}
      >
        <InvoiceBill invoice={invoice} />
      </Modal>
    </div>
  );
}
