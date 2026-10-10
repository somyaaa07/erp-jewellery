// A safe way to move something: shows what is being moved, where it is now, lets the user
// search for the destination, previews "before and after", and only moves after confirmation.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './ui';

export default function MoveDialog({
  open, onClose, onConfirm, title, subjectLabel, currentPath, options, destinationLabel = 'Move to', allowRoot = false, note,
}) {
  const [text, setText] = useState('');
  const [destId, setDestId] = useState('');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState('choose'); // choose -> confirm
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setText(''); setDestId(''); setReason(''); setStep('choose'); setBusy(false); } }, [open]);

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (options || []).filter((o) => !q || o.label.toLowerCase().includes(q)).slice(0, 80);
  }, [options, text]);

  const chosen = (options || []).find((o) => String(o.id) === String(destId));
  const afterPath = destId === 'ROOT' ? subjectLabel : (chosen ? `${chosen.label}${chosen.append === false ? '' : ` > ${subjectLabel}`}` : '');
  const canContinue = destId === 'ROOT' || Boolean(chosen);

  const confirm = async () => {
    setBusy(true);
    try { await onConfirm(destId === 'ROOT' ? null : destId, reason); } finally { setBusy(false); }
  };

  const box = { padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', background: '#f9fafb', fontSize: 14 };

  return (
    <Modal
      open={open} title={title} onClose={onClose} size="lg"
      footer={(
        <>
          <button className="btn btn-secondary" onClick={step === 'confirm' ? () => setStep('choose') : onClose}>{step === 'confirm' ? 'Back' : 'Cancel'}</button>
          {step === 'choose'
            ? <button className="btn" disabled={!canContinue} onClick={() => setStep('confirm')}>Review move</button>
            : <button className="btn" disabled={busy} onClick={confirm}>{busy ? 'Moving…' : 'Confirm move'}</button>}
        </>
      )}
    >
      <p style={{ margin: '0 0 8px' }}><strong>{subjectLabel}</strong></p>
      {note && <p className="field-hint">{note}</p>}

      {step === 'choose' && (
        <>
          <div className="form-group">
            <label>Current location</label>
            <div style={box}>{currentPath || 'Not placed'}</div>
          </div>
          <div className="form-group">
            <label>{destinationLabel}</label>
            <input type="search" placeholder="Search by name or path" value={text} onChange={(e) => setText(e.target.value)} />
            <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 8, marginTop: 6 }} role="listbox">
              {allowRoot && (
                <div role="option" aria-selected={destId === 'ROOT'} onClick={() => setDestId('ROOT')}
                  style={{ padding: '7px 10px', cursor: 'pointer', background: destId === 'ROOT' ? '#eef2ff' : 'transparent', borderBottom: '1px solid #f3f4f6' }}>
                  Top level (not inside anything)
                </div>
              )}
              {filtered.length === 0 && <div style={{ padding: 10 }} className="field-hint">No matching destination.</div>}
              {filtered.map((o) => (
                <div key={o.id} role="option" aria-selected={String(destId) === String(o.id)} onClick={() => setDestId(o.id)}
                  style={{ padding: '7px 10px', cursor: 'pointer', background: String(destId) === String(o.id) ? '#eef2ff' : 'transparent', borderBottom: '1px solid #f3f4f6' }}>
                  {o.label}{o.hint ? <span className="cell-sub"> · {o.hint}</span> : null}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {step === 'confirm' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><div className="cell-sub">Before</div><div style={box}>{currentPath || 'Not placed'}</div></div>
            <div><div className="cell-sub">After</div><div style={{ ...box, borderColor: '#818cf8', background: '#eef2ff' }}>{afterPath}</div></div>
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label>Reason (optional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <p className="field-hint">The move is saved in the history. Nothing is duplicated and other copies of the same design stay where they are.</p>
        </>
      )}
    </Modal>
  );
}
