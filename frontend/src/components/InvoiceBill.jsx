// src/components/InvoiceBill.jsx
// The actual bill. It renders on screen inside a modal and prints as a clean A4 page,
// because index.css hides everything except this block under @media print.
//
// Everything shown here comes straight from the frozen sale record returned by
// GET /sales/:id/invoice - nothing is recalculated, so a reprint is always identical
// to the original bill even if the gold rate has changed since.
import React from 'react';
import { money, grams, formatDate, titleCase } from './ui';

function amountInWords(num) {
  const n = Math.round(Number(num) || 0);
  if (n === 0) return 'Zero Rupees Only';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (x) => (x < 20 ? ones[x] : `${tens[Math.floor(x / 10)]}${x % 10 ? ` ${ones[x % 10]}` : ''}`);
  const threeDigits = (x) => {
    const h = Math.floor(x / 100);
    const rest = x % 100;
    return `${h ? `${ones[h]} Hundred${rest ? ' ' : ''}` : ''}${rest ? twoDigits(rest) : ''}`;
  };

  // Indian numbering: crore, lakh, thousand, hundred.
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  return `${parts.join(' ')} Rupees Only`;
}

export default function InvoiceBill({ invoice }) {
  if (!invoice) return null;

  const { shop = {}, customer = {}, lines = [], totals = {} } = invoice;

  return (
    <div className="bill">
      <header className="bill-head">
        <div className="bill-shop">{shop.name || 'Jewellery Store'}</div>
        <div className="bill-shop-meta">
          {[shop.branch_name, shop.address].filter(Boolean).join(' · ')}
          {shop.gstin ? <><br />GSTIN: {shop.gstin}</> : null}
          {shop.phone ? <> · Phone: {shop.phone}</> : null}
        </div>
        <div className="bill-title">Tax Invoice</div>
      </header>

      <div className="bill-meta">
        <div className="bill-meta-block">
          <div className="k">Billed to</div>
          <div><strong>{customer.name || 'Walk-in Customer'}</strong></div>
          {customer.phone && <div>{customer.phone}</div>}
          {customer.address && <div>{customer.address}</div>}
          {customer.gstin && <div>GSTIN: {customer.gstin}</div>}
        </div>
        <div className="bill-meta-block" style={{ textAlign: 'right' }}>
          <div className="k">Invoice details</div>
          <div>Invoice No: <strong>{invoice.invoice_number}</strong></div>
          <div>Date: {formatDate(invoice.invoice_date || invoice.generated_at)}</div>
          <div>Type: {titleCase(invoice.sale_type)}</div>
          <div>Payment: {titleCase(invoice.payment_status || 'PAID')}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th>Item</th>
            <th style={{ width: 54 }}>HSN</th>
            <th style={{ width: 52 }}>Purity</th>
            <th style={{ width: 70, textAlign: 'right' }}>Net wt.</th>
            <th style={{ width: 78, textAlign: 'right' }}>Rate/g</th>
            <th style={{ width: 78, textAlign: 'right' }}>Making</th>
            <th style={{ width: 70, textAlign: 'right' }}>GST</th>
            <th style={{ width: 92, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.sale_item_id || i}>
              <td>{i + 1}</td>
              <td>
                <strong>{l.product_name}</strong>
                {l.design_code ? <div style={{ fontSize: 10.5, color: '#64748b' }}>{l.design_code}</div> : null}
              </td>
              <td>{l.hsn_code || '7113'}</td>
              <td>{l.purity}</td>
              <td style={{ textAlign: 'right' }}>{grams(l.net_weight)}</td>
              <td style={{ textAlign: 'right' }}>{money(l.gold_rate_used)}</td>
              <td style={{ textAlign: 'right' }}>{money(Number(l.making_charge) + Number(l.wastage_amount))}</td>
              <td style={{ textAlign: 'right' }}>{money(l.gst_amount)}</td>
              <td style={{ textAlign: 'right' }}><strong>{money(l.line_total)}</strong></td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr><td colSpan={9} style={{ textAlign: 'center', color: '#64748b' }}>No items on this invoice</td></tr>
          )}
        </tbody>
      </table>

      <div className="bill-totals">
        <div className="row"><span>Subtotal</span><span>{money(totals.subtotal, { decimals: 2 })}</span></div>
        <div className="row"><span>GST</span><span>{money(totals.gst, { decimals: 2 })}</span></div>
        {Number(totals.discount) > 0 && (
          <div className="row"><span>Discount</span><span>− {money(totals.discount, { decimals: 2 })}</span></div>
        )}
        <div className="row grand"><span>Total</span><span>{money(totals.grand_total, { decimals: 2 })}</span></div>
      </div>

      <div className="bill-note">
        <strong>Amount in words:</strong> {amountInWords(totals.grand_total)}
      </div>

      <div className="bill-foot">
        <div>
          Goods once sold are only exchangeable as per store policy.<br />
          This is a computer-generated invoice.
        </div>
        <div className="bill-sign">Authorised Signatory</div>
      </div>
    </div>
  );
}
