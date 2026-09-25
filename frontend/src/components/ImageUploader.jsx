import { useEffect, useMemo, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Camera, ImagePlus, X } from 'lucide-react';

const MAX_SIZE = 10 * 1024 * 1024;

/** Controlled: `files` is an array of File objects owned by the parent. */
export default function ImageUploader({ files, onChange, disabled }) {
  const cameraRef = useRef(null);

  const addFiles = (incoming) => {
    const key = (f) => `${f.name}-${f.size}-${f.lastModified}`;
    const existing = new Set(files.map(key));
    onChange([...files, ...incoming.filter((f) => !existing.has(key(f)))]);
  };

  const { getRootProps, getInputProps, isDragActive, fileRejections, open } = useDropzone({
    accept: { 'image/*': [] },
    maxSize: MAX_SIZE,
    multiple: true,
    noClick: true,
    disabled,
    onDrop: addFiles,
  });

  const previews = useMemo(() => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  return (
    <div>
      <div
        {...getRootProps()}
        className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          isDragActive ? 'border-teal-500 bg-teal-50' : 'border-slate-300 bg-slate-50/60'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <input {...getInputProps()} />
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
          <ImagePlus className="h-5 w-5" />
        </span>
        <p className="mt-3 text-sm font-medium text-slate-800">{isDragActive ? 'Drop images here' : 'Drag & drop package images'}</p>
        <p className="mt-1 text-xs text-slate-500">Front, back and side panels · JPG, PNG, WebP · up to 10 MB each</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn-secondary" onClick={open} disabled={disabled}>
            Browse files
          </button>
          <button type="button" className="btn-secondary" onClick={() => cameraRef.current?.click()} disabled={disabled}>
            <Camera className="h-4 w-4" /> Use camera
          </button>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addFiles(Array.from(e.target.files || []));
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {fileRejections.length > 0 && (
        <p className="mt-2 text-xs text-red-600">
          Skipped {fileRejections.length} file(s): only images up to 10 MB are accepted.
        </p>
      )}

      {previews.length > 0 && (
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {previews.map(({ file, url }, i) => (
            <li key={url} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white">
              <img src={url} alt={file.name} className="aspect-[3/4] w-full object-cover" />
              <p className="truncate px-2 py-1.5 text-[11px] text-slate-600">{file.name}</p>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, j) => j !== i))}
                  className="absolute top-1.5 right-1.5 rounded-full bg-slate-900/70 p-1 text-white opacity-90 hover:bg-slate-900"
                  aria-label={`Remove ${file.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
