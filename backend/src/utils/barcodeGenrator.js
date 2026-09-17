// utils/barcodeGenerator.js
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

export function generateBarcodeValue({ sku, grossWeight, purity }) {
  return `${sku}|${grossWeight}|${purity}`;
}

export function generateSku() {
  return `SKU-${uuidv4().split('-')[0].toUpperCase()}`;
}

export async function generateQrDataUrl(payloadString) {
  return QRCode.toDataURL(payloadString, { errorCorrectionLevel: 'M', margin: 1, width: 200 });
}

// The QR now encodes a direct link to the item detail page, so any ordinary
// phone camera scan karke seedha item ki info khol leta hai (login zaroori hai).
export function buildItemQrUrl(itemId) {
  const base = process.env.FRONTEND_URL || 'http://localhost:5173';
  return `${base}/inventory/items/${itemId}`;
}