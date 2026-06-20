import { useMemo, useState } from 'react';
import { AlertTriangle, Check, Copy, FileImage, Loader2, ScanLine, TerminalSquare, Upload, Zap } from 'lucide-react';
import { useCameraDecode } from '../hooks/useCameraDecode';

export function HexCodeScanner() {
  const { decodeFile, result, error, isDecoding, logs } = useCameraDecode();
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const resultMeta = useMemo(
    () =>
      result
        ? [
            { label: 'Format', value: `v${result.formatVersion}` },
            { label: 'Confidence', value: `${(result.confidence * 100).toFixed(0)}%` },
            { label: 'Corrected', value: String(result.correctedCells) }
          ]
        : [],
    [result]
  );

  const handleDrag = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(event.type === 'dragenter' || event.type === 'dragover');
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer.files[0];
    if (file) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(URL.createObjectURL(file));
      decodeFile(file);
    }
  };

  const copyToClipboard = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="route-page decode-page animate-in">
      <section className="route-hero decode-hero">
        <div>
          <span className="eyebrow">Decoder</span>
          <h1>Decode ⬡code symbols from image exports</h1>
          <p>
            Upload a generated PNG, JPG, or SVG. Decoding runs in a worker thread via the Rust/WASM v2 sampler.
          </p>
        </div>
        <div className="decode-status-strip" aria-label="Decoder pipeline">
          <span><Zap size={14} /> WASM first</span>
          <span><ScanLine size={14} /> Worker thread</span>
          <span><FileImage size={14} /> PNG / JPG / SVG</span>
        </div>
      </section>

      <div className="decode-grid">
        <section className="panel decode-upload-panel">
          <div className="panel-heading">
            <span className="eyebrow">Input</span>
            <h2>Drop a symbol</h2>
          </div>
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            className={`drop-zone decode-drop ${dragActive ? 'active' : ''} ${previewUrl ? 'has-preview' : ''}`}
            style={{ position: 'relative', minHeight: '260px' }}
          >
            {previewUrl ? (
              <div className="preview-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', gap: 'var(--space-md)' }}>
                <img
                  src={previewUrl}
                  alt="HexCode Symbol Preview"
                  className="preview-image"
                  style={{
                    maxHeight: '160px',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-strong)',
                    boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
                    background: 'var(--surface-2)',
                    padding: 'var(--space-sm)'
                  }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                    Change Image
                    <input
                      type="file"
                      accept="image/*,.svg,image/svg+xml"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          if (previewUrl) URL.revokeObjectURL(previewUrl);
                          setPreviewUrl(URL.createObjectURL(file));
                          decodeFile(file);
                        }
                      }}
                      style={{ display: 'none' }}
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (previewUrl) URL.revokeObjectURL(previewUrl);
                      setPreviewUrl(null);
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="decode-drop-icon">
                  <Upload size={24} />
                </div>
                <p>Drag an image here</p>
                <span>or choose a local export</span>
                <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer', marginTop: 'var(--space-lg)' }}>
                  Browse Files
                  <input
                    type="file"
                    accept="image/*,.svg,image/svg+xml"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        if (previewUrl) URL.revokeObjectURL(previewUrl);
                        setPreviewUrl(URL.createObjectURL(file));
                        decodeFile(file);
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                </label>
              </>
            )}
          </div>
        </section>

        <section className="panel decode-output-panel">
          <div className="panel-heading">
            <span className="eyebrow">Output</span>
            <h2>{isDecoding ? 'Decoding image' : result ? 'Decoded payload' : error ? 'Decode failed' : 'Waiting for image'}</h2>
          </div>

          {isDecoding && (
            <div className="decode-loading-state">
              <Loader2 size={30} />
              <div>
                <strong>Sampling lattice</strong>
                <p>Rasterizing input and sampling the symbol with the WASM v2 decoder.</p>
              </div>
            </div>
          )}

          {!isDecoding && !result && !error && (
            <div className="empty-state">
              <ScanLine size={28} />
              <p>Results appear here after the worker samples the symbol.</p>
            </div>
          )}

          {!isDecoding && result && (
            <div className="result-card decode-result-card">
              <div className="result-card-header">
                <span className="success-label"><Check size={14} /> Decoded</span>
                <button onClick={copyToClipboard} className="btn btn-ghost btn-sm">
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="result-card-body">
                <p className="decoded-text">{result.text}</p>
                <div className="metric-row">
                  {resultMeta.map((item) => (
                    <span key={item.label} className="metric-pill">
                      <strong>{item.value}</strong>
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!isDecoding && error && (
            <div className="error-callout">
              <AlertTriangle size={18} />
              <div>
                <h3>Scanner Error</h3>
                <p>{error}</p>
              </div>
            </div>
          )}
        </section>
      </div>

      <section className="panel debug-panel">
        <div className="panel-heading debug-heading">
          <div>
            <span className="eyebrow">Debug</span>
            <h2>Decode log</h2>
          </div>
          <span className={`debug-state ${isDecoding ? 'active' : ''}`}>
            {isDecoding ? 'running' : logs.length ? 'idle' : 'empty'}
          </span>
        </div>
        <div className="debug-log-list">
          {logs.length === 0 ? (
            <div className="debug-empty">
              <TerminalSquare size={18} />
              <span>No decode attempts yet.</span>
            </div>
          ) : (
            logs.map((entry) => (
              <div key={entry.id} className={`debug-log-entry ${entry.level}`}>
                <time>{entry.time}</time>
                <span>{entry.level}</span>
                <p>{entry.message}</p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
