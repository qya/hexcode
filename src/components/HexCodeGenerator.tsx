import { useState, useRef } from 'react';
import { getCapacity, getMaxCapacity } from '../core/capacity';
import type { CellLevel, ECLevel, FormatVersion, HexCodeStyle } from '../core/types';
import { HexCodeCanvas } from './HexCodeCanvas';
import { EncodeErrorPanel } from './EncodeErrorPanel';
import { useHexEncoder } from '../hooks/useHexEncoder';
import { DensityComparison } from './DensityComparison';
import {
  DEFAULT_STYLE,
  detectPresetKey,
  HEX_PRESETS,
  mergeHexStyle,
  STYLE_COLOR_FIELDS,
  type HexPresetKey
} from '../themes/hexPresets';
import {
  Type,
  Settings2,
  Palette,
  Download,
  Image,
  FileCode2,
  Upload,
  FileDown,
  AlertTriangle,
} from 'lucide-react';

const CONFIG_TABS = [
  { id: 'payload', icon: Type, label: 'Payload' },
  { id: 'encoding', icon: Settings2, label: 'Encode' },
  { id: 'theme', icon: Palette, label: 'Theme' },
] as const;

type ConfigTabId = (typeof CONFIG_TABS)[number]['id'];

/* ─── Toggle Switch ─── */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
}) {
  return (
    <div className="toggle-wrap" onClick={() => onChange(!checked)}>
      <div className={`toggle-track ${checked ? 'on' : ''}`}>
        <div className="toggle-thumb" />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

/* ─── Main Component ─── */
interface Props {
  text: string;
  setText: (text: string) => void;
  level: CellLevel;
  setLevel: (level: CellLevel) => void;
  ecLevel: ECLevel;
  setEcLevel: (level: ECLevel) => void;
}

export function HexCodeGenerator({ text, setText, level, setLevel, ecLevel, setEcLevel }: Props) {
  const [customStyle, setCustomStyle] = useState<HexCodeStyle>(DEFAULT_STYLE);
  const [activePreset, setActivePreset] = useState<HexPresetKey | 'custom'>('classic');
  const [exportSize, setExportSize] = useState<number>(512);
  const [formatVersion, setFormatVersion] = useState<FormatVersion>(2);
  const [activeConfigTab, setActiveConfigTab] = useState<ConfigTabId>('payload');
  const svgRef = useRef<SVGSVGElement | null>(null);

  const encoded = useHexEncoder(text, { level, ecLevel, centerLogo: false, formatVersion });
  const capacityOptions = { reserveCenterLogo: false, formatVersion };
  const maxCapacity = getMaxCapacity(ecLevel, level, capacityOptions);
  const capacity = encoded.ok
    ? getCapacity(encoded.code.version, ecLevel, level, capacityOptions)
    : maxCapacity;
  const canExport = encoded.ok;

  const applyPreset = (presetName: HexPresetKey) => {
    const preset = HEX_PRESETS[presetName];
    if (preset) {
      setCustomStyle(mergeHexStyle(preset.style));
      setActivePreset(presetName);
    }
  };

  const handleStyleChange = (key: keyof HexCodeStyle, value: string | number) => {
    setCustomStyle((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'frameOuterColor' && typeof value === 'string') {
        next.frameInnerColor = value;
      }
      return next;
    });
    setActivePreset('custom');
  };

  const byteCount = new TextEncoder().encode(text).length;

  const exportDimensions = (svgEl: SVGSVGElement, width: number) => {
    const viewBox = svgEl.viewBox.baseVal;
    const height =
      viewBox.width > 0
        ? Math.max(1, Math.round(width * (viewBox.height / viewBox.width)))
        : Math.round(width / 1.15);
    return { width, height };
  };

  // SVG Export
  const downloadSVG = () => {
    if (!encoded.ok || !svgRef.current) return;
    const svgEl = svgRef.current.cloneNode(true) as SVGSVGElement;
    const { width, height } = exportDimensions(svgEl, exportSize);
    svgEl.setAttribute('width', `${width}px`);
    svgEl.setAttribute('height', `${height}px`);

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svgEl);
    if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
      source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hex-code-${Date.now()}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // PNG/JPG Export
  const downloadRaster = (format: 'png' | 'jpeg') => {
    if (!encoded.ok || !svgRef.current) return;
    const svgEl = svgRef.current.cloneNode(true) as SVGSVGElement;
    const { width, height } = exportDimensions(svgEl, exportSize);
    svgEl.setAttribute('width', `${width}px`);
    svgEl.setAttribute('height', `${height}px`);

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        if (format === 'jpeg') {
          ctx.fillStyle = customStyle.lightColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL(`image/${format}`, 1.0);
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `hex-code-${Date.now()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
        link.click();
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // Save Style Preset (JSON)
  const exportStyleJSON = () => {
    const dataStr = JSON.stringify(customStyle, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hex-code-style-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Load Style Preset (JSON)
  const importStyleJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string);
        if (typeof parsed === 'object' && parsed !== null) {
          const merged = mergeHexStyle(parsed);
          setCustomStyle(merged);
          setActivePreset(detectPresetKey(merged) ?? 'custom');
        }
      } catch (err) {
        alert('Invalid JSON style preset.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="animate-in"
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3xl)' }}
    >
      {/* Top row: Preview + Config side by side */}
      <div className="generator-layout">
        {/* Preview Panel */}
        <div className="generator-preview">
          <div className="panel" style={{ height: '100%' }}>
            <div
              className="panel-body"
              style={{
                minHeight: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {encoded.ok ? (
                <HexCodeCanvas
                  code={encoded.code}
                  centerLogo=""
                  customStyle={customStyle}
                  svgRef={svgRef}
                />
              ) : (
                <EncodeErrorPanel error={encoded.error} />
              )}
              <div
                style={{
                  marginTop: 'var(--space-xl)',
                  textAlign: 'center',
                }}
              >
                <p
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    margin: '0 0 4px',
                  }}
                >
                  Format Properties
                </p>
                {encoded.ok ? (
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-secondary)',
                      margin: 0,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    v{encoded.code.version} · fmt {encoded.code.formatVersion ?? 2} · ⬡code H{encoded.code.radius} ·{' '}
                    {encoded.code.cells.filter((c) => c.kind === 'data').length} data ·{' '}
                    {Math.log2(encoded.code.level)}b/cell · {capacity} bits
                  </p>
                ) : (
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--danger, #ef4444)',
                      margin: 0,
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    Over capacity · {byteCount} bytes · max ~{encoded.error.maxPayloadBytesEstimate} bytes
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Config Panel — Tabs + Export */}
        <div className="generator-config">
          <div className="panel config-panel">
            <div className="tab-bar" role="tablist" aria-label="Configuration">
              {CONFIG_TABS.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeConfigTab === id}
                  className={`tab-trigger ${activeConfigTab === id ? 'active' : ''}`}
                  onClick={() => setActiveConfigTab(id)}
                >
                  <Icon className="tab-trigger-icon" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <div className="tab-panel" role="tabpanel">
              <div className="tab-panel-inner">
                {activeConfigTab === 'payload' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
                    <textarea
                      id="payload"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="textarea"
                      placeholder="Enter data to encode..."
                    />
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: 'var(--space-md)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span className="badge badge-muted">{text.length} chars</span>
                      <span className="badge badge-muted">{byteCount} bytes</span>
                      {!encoded.ok && (
                        <span className="badge" style={{ color: 'var(--danger, #ef4444)', borderColor: 'currentColor' }}>
                          <AlertTriangle size={12} style={{ marginRight: 4 }} />
                          Over capacity
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {activeConfigTab === 'encoding' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label className="field-label">Format Version</label>
                        <select
                          value={formatVersion}
                          onChange={(e) => {
                            const next = Number(e.target.value) as FormatVersion;
                            setFormatVersion(next);
                            if (next === 2 && level < 8) setLevel(8);
                          }}
                          className="select"
                        >
                          <option value={2}>2 — ⬡code (C8, high density)</option>
                          <option value={1}>1 — ⬡code legacy</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">Cell Levels</label>
                        <select
                          value={level}
                          onChange={(e) => setLevel(Number(e.target.value) as CellLevel)}
                          className="select"
                        >
                          <option value={2}>2 — Binary</option>
                          <option value={4}>4 — Grayscale</option>
                          <option value={8}>8 — Density</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">Error Correction</label>
                        <select
                          value={ecLevel}
                          onChange={(e) => setEcLevel(e.target.value as ECLevel)}
                          className="select"
                        >
                          <option value="L">L — 7%</option>
                          <option value="M">M — 15%</option>
                          <option value="Q">Q — 25%</option>
                          <option value="H">H — 30%</option>
                        </select>
                      </div>
                    </div>

                  </>
                )}

                {activeConfigTab === 'theme' && (
                  <div className="theme-tab">
                    <section className="theme-section">
                      <label className="field-label">Presets</label>
                      <div className="preset-strip">
                        {(Object.entries(HEX_PRESETS) as Array<[HexPresetKey, (typeof HEX_PRESETS)[HexPresetKey]]>).map(
                          ([key, item]) => {
                            const isSelected = activePreset === key;
                            return (
                              <button
                                key={key}
                                onClick={() => applyPreset(key)}
                                className={`preset-chip ${isSelected ? 'active' : ''}`}
                                type="button"
                                title={item.description}
                              >
                                <span
                                  className="preset-chip-swatch"
                                  style={{
                                    background: `linear-gradient(135deg, ${item.style.lightColor} 0 50%, ${item.style.darkColor} 50% 100%)`,
                                    boxShadow: `inset 0 0 0 1px ${item.style.frameOuterColor}`
                                  }}
                                />
                                <span>{item.label}</span>
                              </button>
                            );
                          }
                        )}
                      </div>
                    </section>

                    <section className="theme-section">
                      <label className="field-label">Colors</label>
                      <div className="color-grid">
                        {STYLE_COLOR_FIELDS.map(({ key, label: fieldLabel }) => (
                          <div key={key} className="color-field">
                            <label className="field-label">{fieldLabel}</label>
                            <div className="color-swatch-wrap color-swatch-compact">
                              <input
                                type="color"
                                value={customStyle[key] as string}
                                onChange={(e) => handleStyleChange(key, e.target.value)}
                                title={customStyle[key] as string}
                              />
                              <span className="color-hex-label">{customStyle[key] as string}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="theme-section theme-scale-row">
                      <label className="field-label" style={{ margin: 0, whiteSpace: 'nowrap' }}>
                        Cell Scale
                      </label>
                      <input
                        type="range"
                        min="0.75"
                        max="1.0"
                        step="0.01"
                        value={customStyle.cellScale}
                        onChange={(e) => handleStyleChange('cellScale', parseFloat(e.target.value))}
                      />
                      <span className="theme-scale-value">{Math.round(customStyle.cellScale * 100)}%</span>
                    </section>

                    <div className="theme-toolbar">
                      <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                        <Upload className="btn-icon" />
                        Import
                        <input type="file" accept=".json" onChange={importStyleJSON} style={{ display: 'none' }} />
                      </label>
                      <button onClick={exportStyleJSON} className="btn btn-ghost btn-sm">
                        <FileDown className="btn-icon" />
                        Export
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="panel export-panel">
            <div className="export-panel-header">
              <Download className="export-panel-icon" />
              <span>Export</span>
            </div>
            <div className="export-panel-body">
              <div>
                <label className="field-label">Output Dimension</label>
                <select
                  value={exportSize}
                  onChange={(e) => setExportSize(Number(e.target.value))}
                  className="select"
                >
                  <option value={256}>256 × 256 px</option>
                  <option value={512}>512 × 512 px</option>
                  <option value={1024}>1024 × 1024 px</option>
                  <option value={2048}>2048 × 2048 px</option>
                </select>
              </div>

              <div className="export-actions">
                <button
                  onClick={() => downloadRaster('png')}
                  className="btn btn-primary"
                  disabled={!canExport}
                  title={canExport ? undefined : 'Fix payload size before exporting'}
                >
                  <Image className="btn-icon" />
                  PNG
                </button>
                <button
                  onClick={() => downloadRaster('jpeg')}
                  className="btn btn-primary"
                  disabled={!canExport}
                  title={canExport ? undefined : 'Fix payload size before exporting'}
                >
                  <Image className="btn-icon" />
                  JPG
                </button>
                <button
                  onClick={downloadSVG}
                  className="btn btn-secondary"
                  disabled={!canExport}
                  title={canExport ? undefined : 'Fix payload size before exporting'}
                >
                  <FileCode2 className="btn-icon" />
                  SVG
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison below */}
      <DensityComparison text={text} level={level} ecLevel={ecLevel} formatVersion={formatVersion} />
    </div>
  );
}
