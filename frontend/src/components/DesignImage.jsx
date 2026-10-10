// A design / piece photo that never breaks the screen: when there is no image, or it fails to
// load, a neutral placeholder is shown instead.
import React, { useState } from 'react';

export default function DesignImage({ src, alt = '', size = 44 }) {
  const [failed, setFailed] = useState(false);
  const box = {
    width: size, height: size, borderRadius: 6, flex: 'none', objectFit: 'cover',
    background: '#f3f4f6', border: '1px solid #e5e7eb',
  };
  if (!src || failed) {
    return (
      <div style={{ ...box, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: Math.max(10, size / 4) }} title="No image">
        No image
      </div>
    );
  }
  return <img src={src} alt={alt} style={box} onError={() => setFailed(true)} />;
}
