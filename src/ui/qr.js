import qrcode from 'qrcode-generator';

const QR_CELL_SIZE = 4;
const QR_MARGIN = 2;

/** Inline SVG QR code for `text` (auto size, medium error correction). Bundled, so it also works offline. */
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: QR_CELL_SIZE, margin: QR_MARGIN, scalable: true });
}
