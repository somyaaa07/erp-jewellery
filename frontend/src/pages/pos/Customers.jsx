// src/pages/pos/Customers.jsx
//
// Why this page was blank before:
//   1. `useEffect(load, [])` passed a function that returned a promise. React expects an effect
//      to return nothing or a cleanup function, so this was wrong and unpredictable.
//   2. The request had no .catch, so any failure (server down, 403, duplicate phone) silently
//      did nothing and the table just stayed empty with no message.
// Both are fixed here: the fetch hook owns loading/error state and the page always renders
// one of loading / error / empty / data.
import React, { useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import useFetch from '../../hooks/useFetch';
import {
  PageHeader, Card, DataState, Modal, TableWrap,
  money, formatDate, errorMessage,
} from '../../components/ui';

const EMPTY_FORM = { name: '', phone: '', email: '', address: '', gstin: '' };

export default function Customers() {
  const { data: customers, loading, error, reload } = useFetch('/customers', { initialData: [] });

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const list = Array.isArray(customers) ? customers : [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => [c.name, c.phone, c.email, c.address]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q)));
  }, [list, search]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  };

  const openEdit = (customer) => {
    setEditing(customer);
    setForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      gstin: customer.gstin || '',
    });
    setFormError('');
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!form.name.trim()) { setFormError('Customer name is required.'); return; }
    if (!/^[0-9+\-\s]{6,15}$/.test(form.phone.trim())) {
      setFormError('Enter a valid phone number.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.patch(`/customers/${editing.id}`, form);
        toast.success('Customer updated');
      } else {
        await api.post('/customers', form);
        toast.success('Customer added');
      }
      setShowForm(false);
      setForm(EMPTY_FORM);
      setEditing(null);
      reload();
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save this customer.'));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (customer) => {
    if (!window.confirm(`Deactivate ${customer.name}? Their past invoices stay untouched.`)) return;
    try {
      await api.delete(`/customers/${customer.id}`);
      toast.success(`${customer.name} deactivated`);
      reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not deactivate this customer.'));
    }
  };

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Everyone you bill. Adding a customer here lets you attach them to an invoice and see their purchase history."
        actions={<button type="button" className="btn" onClick={openAdd}>Add customer</button>}
      />

      <Card
        title={`All customers${list.length ? ` (${list.length})` : ''}`}
        actions={(
          <input
            className="search-input"
            type="search"
            placeholder="Search by name, phone or email"
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
            title: search ? 'No matching customers' : 'No customers yet',
            text: search
              ? 'Try a different name or phone number.'
              : 'Add your first customer so you can attach them to a bill.',
            action: !search
              ? <button type="button" className="btn" onClick={openAdd}>Add customer</button>
              : null,
          }}
        >
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Address</th>
                  <th className="num">Purchases</th>
                  <th className="num">Total spent</th>
                  <th>Last purchase</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="cell-title">{c.name}</div>
                      {c.gstin && <div className="cell-sub">GSTIN {c.gstin}</div>}
                    </td>
                    <td className="mono">{c.phone}</td>
                    <td>{c.email || <span className="subtle">—</span>}</td>
                    <td>{c.address || <span className="subtle">—</span>}</td>
                    <td className="num">{c.total_purchases ?? 0}</td>
                    <td className="num">{money(c.total_spent)}</td>
                    <td>{c.last_purchase_date ? formatDate(c.last_purchase_date) : <span className="subtle">—</span>}</td>
                    <td>
                      <div className="row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(c)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => deactivate(c)}>
                          Deactivate
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
        open={showForm}
        title={editing ? `Edit ${editing.name}` : 'Add customer'}
        onClose={() => setShowForm(false)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              Cancel
            </button>
            <button type="submit" form="customer-form" className="btn" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add customer'}
            </button>
          </>
        )}
      >
        <form id="customer-form" onSubmit={submit}>
          {formError && <div className="alert alert-error"><div>{formError}</div></div>}

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="c-name">Name *</label>
              <input
                id="c-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Ramesh Gupta"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="c-phone">Phone *</label>
              <input
                id="c-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="10-digit mobile number"
                required
              />
              <p className="field-hint">A phone number can only belong to one customer.</p>
            </div>
            <div className="form-group">
              <label htmlFor="c-email">Email</label>
              <input
                id="c-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="Optional"
              />
            </div>
            <div className="form-group">
              <label htmlFor="c-gstin">GSTIN</label>
              <input
                id="c-gstin"
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                placeholder="Optional, for business customers"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="c-address">Address</label>
            <input
              id="c-address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="Optional"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
