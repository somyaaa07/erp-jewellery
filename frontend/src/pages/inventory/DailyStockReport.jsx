// Daily Stock Report for the wholesale store - weight-wise, one line per category.
//   Closing = Opening + Addition - Sale (+ Other)       what the system says
//   Difference = Physical - Closing                       0 means the books match
// Staff weigh each category on the scale, enter the weight, save, and two different people sign.
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import useBranchScope, { BranchPicker } from '../../hooks/useBranchScope';
import {
  Alert, Card, DataState, PageHeader, StatusBadge, errorMessage, formatDate, formatDateTime, grams,
} from '../../components/ui';

const todayIso = () => new Date().toISOString().slice(0, 10);
const matches = (d) => d !== null && d !== undefined && Math.abs(Number(d)) < 0.0005;

export default function DailyStockReport() {
  const scope = useBranchScope();
  const [date, setDate] = useState(todayIso());
  const [report, setReport] = useState(null);
  const [physical, setPhysical] = useState({}); // category_id -> text typed in the box
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!scope.ready) return;
    setLoading(true);
    setError('');
    try {
      const [r, h] = await Promise.all([
        api.get('/daily-stock-report', { params: { ...scope.params, date } }),
        api.get('/daily-stock-report/history', { params: scope.params }),
      ]);
      setReport(r.data);
      setHistory(h.data);
      const typed = {};
      r.data.lines.forEach((l) => { typed[l.category_id] = l.physical_weight === null ? '' : String(l.physical_weight); });
      setPhysical(typed);
    } catch (err) {
      setError(errorMessage(err, 'Could not load the report.'));
    } finally {
      setLoading(false);
    }
  }, [scope.ready, scope.branchId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const signed = report?.status === 'SIGNED';

  const save = async () => {
    setBusy(true);
    try {
      const lines = report.lines.map((l) => ({ category_id: l.category_id, physical_weight: physical[l.category_id] }));
      await api.put('/daily-stock-report', { ...scope.params, date, lines });
      toast.success('Report saved');
      await load();
    } catch (err) { toast.error(errorMessage(err, 'Could not save the report.')); }
    setBusy(false);
  };

  const sign = async (slot) => {
    setBusy(true);
    try {
      await api.post('/daily-stock-report/sign', { ...scope.params, date, slot });
      toast.success(`Signature ${slot} done`);
      await load();
    } catch (err) { toast.error(errorMessage(err, 'Could not sign the report.')); }
    setBusy(false);
  };

  // Live difference while typing, before the report is saved.
  const liveDiff = (line) => {
    const typed = physical[line.category_id];
    if (typed === '' || typed === undefined) return null;
    return Number(typed) - line.closing_weight;
  };

  const totals = report?.totals;
  const nothingToShow = report && report.lines.length === 0;

  return (
    <div>
      <PageHeader
        title="Daily Stock Report"
        subtitle="Wholesale stock by weight. Closing = Opening + Addition - Sale - To tray. Weigh each category, enter the weight, then two people sign."
        actions={(
          <>
            <BranchPicker scope={scope} />
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Date</label>
              <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            </div>
          </>
        )}
      />

      <DataState loading={loading} error={error} onRetry={load}>
        {nothingToShow ? (
          <Alert tone="info" title="No wholesale stock yet">
            Enter opening stock under Designs & Categories, or receive a purchase into inventory, and the report will fill in.
          </Alert>
        ) : report && (
          <>
            <Card
              title={`Report for ${formatDate(date)}`}
              actions={<StatusBadge value={report.status} tone={signed ? 'green' : 'neutral'} />}
            >
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th style={{ textAlign: 'right' }}>Opening</th>
                      <th style={{ textAlign: 'right' }}>Addition</th>
                      <th style={{ textAlign: 'right' }}>Sale</th>
                      <th style={{ textAlign: 'right' }}>To tray</th>
                      <th style={{ textAlign: 'right' }}>Other (net)</th>
                      <th style={{ textAlign: 'right' }}>Closing (system)</th>
                      <th style={{ textAlign: 'right' }}>Physical (weighed)</th>
                      <th style={{ textAlign: 'right' }}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.lines.map((l) => {
                      const diff = signed ? l.difference : liveDiff(l);
                      return (
                        <tr key={l.category_id}>
                          <td>{l.category_name}</td>
                          <td style={{ textAlign: 'right' }}>{grams(l.opening_weight, 2)}</td>
                          <td style={{ textAlign: 'right' }}>{grams(l.addition_weight, 2)}</td>
                          <td style={{ textAlign: 'right' }}>{grams(l.sale_weight, 2)}</td>
                          <td style={{ textAlign: 'right' }}>{grams(l.tray_weight, 2)}</td>
                          <td style={{ textAlign: 'right' }}>{grams(l.other_weight, 2)}</td>
                          <td style={{ textAlign: 'right' }}><strong>{grams(l.closing_weight, 2)}</strong></td>
                          <td style={{ textAlign: 'right' }}>
                            {signed ? grams(l.physical_weight, 2) : (
                              <input
                                className="dsr-input" type="number" step="0.001" min="0"
                                value={physical[l.category_id] ?? ''}
                                onChange={(e) => setPhysical({ ...physical, [l.category_id]: e.target.value })}
                              />
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            {diff === null || diff === undefined ? '—' : (
                              <span className={`badge ${matches(diff) ? 'green' : 'red'}`}>{Number(diff).toFixed(3)} g</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="dsr-total">
                      <td>Total</td>
                      <td style={{ textAlign: 'right' }}>{grams(totals.opening_weight, 2)}</td>
                      <td style={{ textAlign: 'right' }}>{grams(totals.addition_weight, 2)}</td>
                      <td style={{ textAlign: 'right' }}>{grams(totals.sale_weight, 2)}</td>
                      <td style={{ textAlign: 'right' }}>{grams(totals.tray_weight, 2)}</td>
                      <td style={{ textAlign: 'right' }}>{grams(totals.other_weight, 2)}</td>
                      <td style={{ textAlign: 'right' }}>{grams(totals.closing_weight, 2)}</td>
                      <td style={{ textAlign: 'right' }}>{totals.physical_weight === null ? '—' : grams(totals.physical_weight, 2)}</td>
                      <td style={{ textAlign: 'right' }}>{totals.difference === null ? '—' : grams(totals.difference, 3)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {!signed && (
                <div style={{ marginTop: 16 }}>
                  <button className="btn" onClick={save} disabled={busy}>Save weighed amounts</button>
                  <span className="field-hint" style={{ marginLeft: 12 }}>Saving clears any signatures already given.</span>
                </div>
              )}
            </Card>

            <Card title="Signatures" note="Two different people must sign. The second signature locks the report.">
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {report.signatures.map((s) => (
                  <div className="sign-box" key={s.slot}>
                    <strong>Signature {s.slot}</strong>
                    {s.name ? (
                      <p style={{ margin: '8px 0 0' }}>{s.name}<br /><span className="field-hint">{formatDateTime(s.at)}</span></p>
                    ) : (
                      <p style={{ margin: '8px 0 0' }}>
                        <button className="btn btn-secondary" disabled={busy || signed || !report.id} onClick={() => sign(s.slot)}>
                          Sign as me
                        </button>
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {!report.id && <p className="field-hint">Save the weighed amounts first, then sign.</p>}
            </Card>
          </>
        )}

        <Card title="Previous reports">
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Date</th><th>Status</th><th style={{ textAlign: 'right' }}>Closing (system)</th><th style={{ textAlign: 'right' }}>Physical</th><th style={{ textAlign: 'right' }}>Difference</th><th>Signed by</th><th /></tr>
              </thead>
              <tbody>
                {history.length === 0 && <tr><td colSpan={7}>No saved reports yet.</td></tr>}
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{formatDate(h.report_date)}</td>
                    <td><StatusBadge value={h.status} tone={h.status === 'SIGNED' ? 'green' : 'neutral'} /></td>
                    <td style={{ textAlign: 'right' }}>{grams(h.totals.closing_weight, 2)}</td>
                    <td style={{ textAlign: 'right' }}>{h.totals.physical_weight === null ? '—' : grams(h.totals.physical_weight, 2)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {h.totals.difference === null ? '—' : <span className={`badge ${matches(h.totals.difference) ? 'green' : 'red'}`}>{Number(h.totals.difference).toFixed(3)} g</span>}
                    </td>
                    <td>{h.signed_by.join(', ') || '—'}</td>
                    <td><button className="btn btn-secondary btn-sm" onClick={() => setDate(String(h.report_date).slice(0, 10))}>Open</button></td>
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
