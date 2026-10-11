// One master design and EVERY physical instance of it: each wholesale lot (per box) and each
// individual tray piece, with its current place. Any single instance can be moved on its own.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axios';
import DesignImage from '../../components/DesignImage';
import ImageUpload from '../../components/ImageUpload';
import MoveDialog from '../../components/MoveDialog';
import { QuantityBadge } from './StorageMap';
import useLocationOptions from '../../hooks/useLocationOptions';
import { Card, DataState, PageHeader, errorMessage, grams } from '../../components/ui';

export default function DesignDetails() {
  const { id } = useParams();
  const { options } = useLocationOptions(null);
  const [data, setData] = useState(null);
  const [trays, setTrays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [moveLot, setMoveLot] = useState(null);
  const [movePiece, setMovePiece] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [d, t] = await Promise.all([api.get(`/products/${id}/instances`), api.get('/display-trays')]);
      setData(d.data); setTrays(t.data);
    } catch (err) { setError(errorMessage(err, 'Could not load this design.')); }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const saveImage = async (url) => {
    try {
      await api.patch(`/products/${id}`, { default_image_url: url || null });
      toast.success(url ? 'Image saved' : 'Image removed');
      load();
    } catch (err) { toast.error(errorMessage(err, 'Could not save the image.')); }
  };

  const doMove = async (fn, ok, close) => {
    try { await fn(); toast.success(ok); close(); load(); } catch (err) { toast.error(errorMessage(err, 'Could not move it.')); }
  };

  const lotTargets = useMemo(() => (moveLot
    ? options.filter((o) => o.in_wholesale && o.branch_id === moveLot.branch_id && o.id !== moveLot.location_id)
    : []), [options, moveLot]);
  const trayTargets = useMemo(() => (movePiece
    ? trays.filter((t) => t.branch_id === movePiece.branch_id && t.id !== movePiece.tray_id)
      .map((t) => ({ id: t.id, label: t.name, hint: `${t.location_path || 'Not placed'} · ${t.empty_slots} free`, append: false }))
    : []), [trays, movePiece]);

  const design = data?.design;
  const totalPieces = data ? data.tray_pieces.length + data.lots.reduce((s, l) => s + (l.quantity_status === 'CONFIRMED' ? l.pieces : 0), 0) : 0;

  return (
    <div>
      <PageHeader
        title={design ? design.product_name : 'Design'}
        subtitle={design ? `${design.design_code} · ${design.Category?.name || 'No category'} · ${design.metal_type} ${design.default_purity}` : ''}
        actions={<Link className="btn btn-secondary" to="/inventory/designs">Back to designs</Link>}
      />
      <DataState loading={loading} error={error} onRetry={load}>
        {data && (
          <>
            <Card title="Photo">
              <ImageUpload label="Design image" value={design.default_image_url} onChange={saveImage} size={120} />
              <p className="field-hint">This photo is shown wherever the design appears: Stock, boxes, trays and search.</p>
            </Card>

            <Card title="Wholesale stock" note={`${data.lots.length} location(s)`}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Where it is</th><th style={{ textAlign: 'right' }}>Pieces</th><th style={{ textAlign: 'right' }}>Weight</th><th>Quantity</th><th /></tr></thead>
                  <tbody>
                    {data.lots.length === 0 && <tr><td colSpan={5}>No wholesale stock of this design.</td></tr>}
                    {data.lots.map((l) => (
                      <tr key={l.item_id}>
                        <td>{l.location_path} <Link className="cell-sub" to={`/inventory/storage-map?location=${l.location_id}`}>show on map</Link></td>
                        <td style={{ textAlign: 'right' }}>{l.quantity_status === 'CONFIRMED' ? l.pieces : '—'}</td>
                        <td style={{ textAlign: 'right' }}>{l.quantity_status === 'CONFIRMED' ? grams(l.weight) : '—'}</td>
                        <td><QuantityBadge status={l.quantity_status} pieces={l.pieces} /></td>
                        <td>{l.quantity_status !== 'ISSUED_TO_KARIGAR' && <button className="btn btn-secondary btn-sm" onClick={() => setMoveLot(l)}>Change location</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Pieces on trays" note={`${data.tray_pieces.length} piece(s) · ${totalPieces} counted in total`}>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Piece</th><th>Tray / slot</th><th>Counter</th><th>Location</th><th style={{ textAlign: 'right' }}>Weight</th><th /></tr></thead>
                  <tbody>
                    {data.tray_pieces.length === 0 && <tr><td colSpan={6}>No pieces of this design are on a tray.</td></tr>}
                    {data.tray_pieces.map((p) => (
                      <tr key={p.piece_id}>
                        <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><DesignImage src={p.image_url} alt={design.product_name} /><span>{p.item_code}{p.huid_code ? <span className="cell-sub"> · {p.huid_code}</span> : null}</span></div></td>
                        <td>{p.tray_name} / {p.slot_no}</td>
                        <td>{p.counter || '—'}</td>
                        <td>{p.location_path}{p.location_id ? <> <Link className="cell-sub" to={`/inventory/storage-map?location=${p.location_id}`}>show on map</Link></> : null}</td>
                        <td style={{ textAlign: 'right' }}>{grams(p.weight)}</td>
                        <td><button className="btn btn-secondary btn-sm" onClick={() => setMovePiece(p)}>Change tray</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </DataState>

      <MoveDialog
        open={Boolean(moveLot)} onClose={() => setMoveLot(null)} title="Change location of this stock"
        subjectLabel={design ? `${design.product_name} (${design.design_code})` : ''} currentPath={moveLot?.location_path}
        note="Only this stock moves. Copies of the design in other boxes or trays stay where they are."
        options={lotTargets}
        onConfirm={(dest, reason) => doMove(() => api.post(`/locations/items/${moveLot.item_id}/move`, { location_id: dest, reason }), 'Location changed', () => setMoveLot(null))}
      />
      <MoveDialog
        open={Boolean(movePiece)} onClose={() => setMovePiece(null)} title="Move this piece to another tray"
        subjectLabel={movePiece ? `${movePiece.item_code}` : ''} currentPath={movePiece ? `${movePiece.tray_name} / slot ${movePiece.slot_no} (${movePiece.location_path})` : ''}
        destinationLabel="Move to tray" note="Only this one piece moves. Other pieces of the design stay on their trays."
        options={trayTargets}
        onConfirm={(dest, reason) => doMove(() => api.post(`/display-trays/pieces/${movePiece.piece_id}/move`, { tray_id: dest, reason }), 'Piece moved', () => setMovePiece(null))}
      />
    </div>
  );
}
