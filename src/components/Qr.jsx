import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function Qr({ text, label }) {
  const [src, setSrc] = useState(null);
  useEffect(() => { QRCode.toDataURL(text, { margin: 1, width: 160 }).then(setSrc).catch(() => setSrc(null)); }, [text]);
  return src ? <figure className="w-36 text-center"><img src={src} alt={label} className="mx-auto h-32 w-32" /><figcaption className="text-[10px] leading-tight text-muted">{label}</figcaption></figure> : null;
}
