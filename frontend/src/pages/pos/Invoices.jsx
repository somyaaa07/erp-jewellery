// src/pages/pos/Invoices.jsx
// Every bill that has been created, with a working reprint.
// Reprint fetches the frozen invoice from the server, so an old bill always prints with the
// gold rate and amounts it was originally made with.
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import useFetch from '../../hooks/useFetch';
import InvoiceBill from '../../components/InvoiceBill';
import {
  PageHeader, Card, DataState, Modal, TableWrap, StatusBadge,
  money, formatDate, errorMessage,
} from '../../components/ui';

export default function Invoices() {
  const { data: sales, loading, error, reload } = useFetch('/sales', { initialData: [] });

  const [search, setSearch] = useState('');
  const [invoice, setInvoice] = useState(null);
  const [opening, setOpening] = useState(null);

  const list = Array.isArray(sales) ? sales : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) => [
      s.sale_number,
      s.Invoice?.invoice_number,
      s.Customer?.name,
      s.Customer?.phone,
    ].filter(Boolean).some((v) => String(v).toLowerCase().includes(q)));
  }, [list, search]);

  const totalBilled = filtered.reduce((sum, s) => sum + Number(s.total_amount || 0), 0);

  const openBill = async (sale) => {
    setOpening(sale.id);
    try {
      const { data } = await api.get(`/sales/${sale.id}/invoice`);
      setInvoice(data);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not open this invoice.'));
    } finally {
      setOpening(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle="Every bill created from the POS. Open any one to view it again or print another copy."
        actions={<Link className="btn" to="/pos/billing">New bill</Link>}
      />

      <Card
        title={`Invoices${filtered.length ? ` (${filtered.length})` : ''}`}
        note={filtered.length ? `Total billed: ${money(totalBilled)}` : undefined}
        actions={(
          <input
            className="search-input"
            type="search"
            placeholder="Search invoice number or customer"
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
            title: search ? 'No matching invoices' : 'No invoices yet',
            text: search
              ? 'Try a different invoice number or customer name.'
              : 'Bills you create from the Billing screen will appear here.',
            action: !search ? <Link className="btn" to="/pos/billing">Create a bill</Link> : null,
          }}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Payment</th>
                  <th className="num">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-title mono">{s.Invoice?.invoice_number || s.sale_number}</div>
                      <div className="cell-sub">{s.sale_number}</div>
                    </td>
                    <td>{formatDate(s.sale_date)}</td>
                    <td>
                      {s.Customer
                        ? <>{s.Customer.name}<div className="cell-sub">{s.Customer.phone}</div></>
                        : <span className="subtle">Walk-in</span>}
                    </td>
                    <td><StatusBadge value={s.sale_type} /></td>
                    <td><StatusBadge value={s.payment_status} /></td>
                    <td className="num strong">{money(s.total_amount)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => openBill(s)}
                          disabled={opening === s.id}
                        >
                          {opening === s.id ? 'Opening…' : 'View & print'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </DataState>
      </Card>

      <Modal
        open={Boolean(invoice)}
        size="lg"
        title={`Invoice ${invoice?.invoice_number || ''}`}
        onClose={() => setInvoice(null)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setInvoice(null)}>Close</button>
            <button type="button" className="btn" onClick={() => window.print()}>Print bill</button>
          </>
        )}
      >
        <InvoiceBill invoice={invoice} />
      </Modal>
    </div>
  );
}
