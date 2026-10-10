// Upload a photo straight from the computer or phone. Browse, drag and drop, preview, replace,
// remove. The file is sent to the server right away and `onChange` receives the saved URL, so
// nobody ever types an image link.
import React, { useRef, useState } from 'react';
import api from '../api/axios';
import DesignImage from './DesignImage';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

export default function ImageUpload({ value, onChange, label = 'Photo', size = 96 }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null); // local preview while the file is uploading
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  const upload = async (file) => {
    setError('');
    if (!file) return;
    if (!TYPES.includes(file.type)) { setError('Use a JPG, PNG or WEBP image.'); return; }
    if (file.size > MAX_BYTES) { setError('The image is larger than 5 MB. Choose a smaller one.'); return; }
    const local = URL.createObjectURL(file);
    setPreview(local);
    setBusy(true);
    try {
      const form = new FormData();
      form.append('image', file);
      const { data } = await api.post('/uploads/image', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      onChange(data.url);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setBusy(false);
      setPreview(null);
      URL.revokeObjectURL(local);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const shown = preview || value;

  return (
    <div className="form-group">
      <label>{label}</label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files?.[0]); }}
        style={{
          display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 8,
          border: `2px dashed ${dragging ? '#4f46e5' : '#d1d5db'}`, background: dragging ? '#eef2ff' : '#fafafa',
        }}
      >
        <DesignImage src={shown} alt="Preview" size={size} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {value || preview ? 'Replace image' : 'Browse files'}
            </button>
            {value && !busy && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange('')}>Remove</button>}
          </div>
          <p className="field-hint" style={{ margin: '6px 0 0' }}>
            {busy ? 'Uploading…' : 'Drag a photo here, or browse. JPG, PNG or WEBP, up to 5 MB.'}
          </p>
          {error && <p style={{ color: '#b91c1c', margin: '4px 0 0', fontSize: 13 }} role="alert">{error}</p>}
        </div>
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
    </div>
  );
}
