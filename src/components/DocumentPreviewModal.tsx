import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText, X } from 'lucide-react';

interface DocumentPreviewModalProps {
  url: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  onClose: () => void;
}

function isSafePreviewUrl(raw: string): boolean {
  const trimmed = (raw || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/api/files/')) return true;
  try {
    const parsed = new URL(trimmed, window.location.origin);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  url,
  name,
  mimeType,
  sizeBytes,
  onClose,
}) => {
  const safe = isSafePreviewUrl(url);
  const lower = `${name} ${url}`.toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  const isImage =
    mime.startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(lower);
  const isPdf = mime === 'application/pdf' || /\.pdf(\?|$)/i.test(lower);
  const isVideo =
    mime.startsWith('video/') || /\.(mp4|webm)(\?|$)/i.test(lower);
  const isAudio =
    mime.startsWith('audio/') || /\.(mp3|ogg|wav)(\?|$)/i.test(lower);
  const isText =
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    /\.(txt|csv|json|md)(\?|$)/i.test(lower);

  const [textContent, setTextContent] = useState<string | null>(null);
  const [textError, setTextError] = useState<string | null>(null);

  useEffect(() => {
    if (!safe || !isText) return;
    let active = true;
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Unable to load text preview');
        return res.text();
      })
      .then((txt) => {
        if (active) setTextContent(txt.slice(0, 100000));
      })
      .catch((err) => {
        if (active) setTextError(err?.message || 'Preview unavailable');
      });
    return () => {
      active = false;
    };
  }, [safe, isText, url]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2.5 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90dvh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3.5 sm:px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                {name || 'Document Preview'}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                {mimeType || 'File'}{sizeBytes ? ` · ${formatFileSize(sizeBytes)}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {safe && (
              <>
                <a
                  href={url}
                  download={name || 'download'}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </a>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-3 sm:p-5 bg-slate-50 dark:bg-slate-950 flex items-center justify-center min-h-[240px] sm:min-h-[340px]">
          {!safe ? (
            <p className="text-xs text-rose-500 font-semibold">
              Blocked unsafe preview URL.
            </p>
          ) : isImage ? (
            <img
              src={url}
              alt={name}
              className="max-w-full max-h-[70vh] rounded-xl object-contain shadow-md"
            />
          ) : isPdf ? (
            <iframe
              src={url}
              title={name}
              className="w-full h-[70vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white"
            />
          ) : isVideo ? (
            <video
              src={url}
              controls
              className="max-w-full max-h-[70vh] rounded-xl bg-black"
            />
          ) : isAudio ? (
            <div className="w-full max-w-md p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                {name}
              </p>
              <audio src={url} controls className="w-full" />
            </div>
          ) : isText ? (
            <div className="w-full h-[65vh] overflow-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
              {textError ? (
                <p className="text-xs text-rose-500">{textError}</p>
              ) : textContent === null ? (
                <p className="text-xs text-slate-500">Loading document preview...</p>
              ) : (
                <pre className="text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">
                  {textContent}
                </pre>
              )}
            </div>
          ) : (
            <div className="max-w-sm w-full p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <FileText className="w-10 h-10 text-sky-500 mx-auto" />
              <p className="text-sm font-bold text-slate-900 dark:text-white break-all">
                {name}
              </p>
              <p className="text-xs text-slate-500">
                Direct browser rendering is not supported for this binary format. Use Download above to open locally.
              </p>
              <a
                href={url}
                download={name || 'download'}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
