import { useEffect, useState } from 'react';
import { ImageOff, ZoomIn, ZoomOut } from 'lucide-react';
import { resultStatusMeta } from '../utils/statusUtils';

/**
 * Package image with the evidence region highlighted.
 * bbox is {x1,y1,x2,y2} in the image's natural pixel coordinates.
 */
export default function EvidenceViewer({ imageUrl, bbox, status, fieldName }) {
  const [natural, setNatural] = useState(null);
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    setNatural(null);
    setFailed(false);
  }, [imageUrl]);

  useEffect(() => setZoomed(Boolean(bbox)), [bbox]);

  const color = resultStatusMeta(status).box;

  if (!imageUrl || failed) {
    return (
      <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-lg bg-slate-100 text-center text-sm text-slate-500">
        <ImageOff className="h-8 w-8 text-slate-300" />
        {failed ? 'Image could not be loaded' : 'No package image attached to this finding'}
      </div>
    );
  }

  let box = null;
  let transform;
  if (bbox && natural) {
    box = {
      left: (bbox.x1 / natural.w) * 100,
      top: (bbox.y1 / natural.h) * 100,
      width: ((bbox.x2 - bbox.x1) / natural.w) * 100,
      height: ((bbox.y2 - bbox.y1) / natural.h) * 100,
    };
    if (zoomed) {
      // Scale so the evidence fills ~70% of the frame width, centred on the box.
      const scale = Math.min(3, Math.max(1, 70 / box.width));
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      transform = { transformOrigin: `${cx}% ${cy}%`, transform: `scale(${scale})` };
    }
  }

  return (
    <div className="relative">
      <div className="relative overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200">
        <div className="relative transition-transform duration-500 ease-out" style={transform}>
          <img
            src={imageUrl}
            alt={`Package evidence for ${fieldName}`}
            className="block w-full select-none"
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onError={() => setFailed(true)}
            draggable={false}
          />
          {box && (
            <div
              className="pointer-events-none absolute rounded-sm"
              style={{
                left: `${box.left}%`,
                top: `${box.top}%`,
                width: `${box.width}%`,
                height: `${box.height}%`,
                border: `2px solid ${color}`,
                background: `${color}22`,
                boxShadow: '0 0 0 9999px rgba(15,23,42,0.35)',
              }}
            />
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
        <span>{bbox ? 'Highlighted: evidence region detected by OCR' : 'No evidence region returned for this field'}</span>
        {bbox && (
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setZoomed((z) => !z)}>
            {zoomed ? <ZoomOut className="h-3.5 w-3.5" /> : <ZoomIn className="h-3.5 w-3.5" />}
            {zoomed ? 'Full image' : 'Zoom to evidence'}
          </button>
        )}
      </div>
    </div>
  );
}
