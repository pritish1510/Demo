// "Use sample product" on New Inspection: rasterise the bundled label SVGs into PNG
// Files, so the same demo also works against a real OCR backend.
import { SAMPLE_IMAGES } from '../services/mockData';

function svgToPngFile(url, fileName, width = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = width / img.naturalWidth;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => (blob ? resolve(new File([blob], fileName, { type: 'image/png' })) : reject(new Error('Render failed'))), 'image/png');
    };
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

export function loadSampleFiles() {
  return Promise.all([SAMPLE_IMAGES.front, SAMPLE_IMAGES.back].map((s) => svgToPngFile(s.imageUrl, s.fileName)));
}
