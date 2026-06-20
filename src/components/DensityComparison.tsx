import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { computeDensityComparison, getCapacityBreakdown, getMaxCapacity, MAX_HEX_VERSION } from '../core/capacity';
import { tryEncodeText, type EncodeError } from '../core/encoder';
import { hexCodeToPngDataUrl } from '../core/hexPreview';
import type { CellLevel, ECLevel, EncodedHexCode, FormatVersion } from '../core/types';
import { isModernFormat } from '../core/types';
import { EncodeErrorPanel } from './EncodeErrorPanel';
import { HEX_PRESETS } from '../themes/hexPresets';
import { Activity, Award, Gauge, Grid3x3, Hexagon, ShieldCheck, TrendingUp, Zap } from 'lucide-react';

interface Props {
  text: string;
  level: CellLevel;
  ecLevel: ECLevel;
  formatVersion?: FormatVersion;
}

const FORMAT_LABEL: Record<FormatVersion, string> = {
  1: '⬡code legacy',
  2: '⬡code'
};

const QR_EC: Record<ECLevel, 'L' | 'M' | 'Q' | 'H'> = { L: 'L', M: 'M', Q: 'Q', H: 'H' };
/** QR version 1 module count — baseline when no payload is entered. */
const QR_EMPTY_MODULES = 21;

export function DensityComparison({ text, level, ecLevel, formatVersion = 2 }: Props) {
  const [qrUrl, setQrUrl] = useState('');
  const [hexUrl, setHexUrl] = useState('');
  const [animate, setAnimate] = useState(false);
  const trimmed = text.trim();
  const hasPayload = trimmed.length > 0;

  useEffect(() => {
    if (!hasPayload) {
      setQrUrl('');
      return;
    }
    QRCode.toDataURL(trimmed, { margin: 1, width: 220, errorCorrectionLevel: QR_EC[ecLevel] })
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [trimmed, hasPayload, ecLevel]);

  useEffect(() => {
    setAnimate(false);
    const t = requestAnimationFrame(() => setAnimate(true));
    return () => cancelAnimationFrame(t);
  }, [text, level, ecLevel, formatVersion]);

  const hexLabel = FORMAT_LABEL[formatVersion];

  const stats = useMemo(() => {
    const payloadBits = new TextEncoder().encode(trimmed).length * 8;
    const capacityOptions = { formatVersion };
    const encoded = tryEncodeText(trimmed, { level, ecLevel, formatVersion });
    const encodeError: EncodeError | null = encoded.ok ? null : encoded.error;
    const code: EncodedHexCode | null = encoded.ok ? encoded.code : null;
    const breakdown = getCapacityBreakdown(
      code?.version ?? MAX_HEX_VERSION,
      ecLevel,
      level,
      capacityOptions
    );
    const maxCapacityBits = getMaxCapacity(ecLevel, level, capacityOptions);
    let qrModules = QR_EMPTY_MODULES;
    let qrVersion = 1;
    if (hasPayload) {
      try {
        const qr = QRCode.create(trimmed, { errorCorrectionLevel: QR_EC[ecLevel] });
        qrModules = qr.modules.size;
        qrVersion = qr.version;
      } catch {
        qrModules = QR_EMPTY_MODULES;
        qrVersion = 1;
      }
    }

    const qrRawBits = qrModules * qrModules;
    const qrCapacity = Math.floor(qrRawBits * (1 - breakdown.ecOverheadPercent / 100));
    const hexCapacity = encodeError ? maxCapacityBits : breakdown.usableBits;
    const density = code
      ? computeDensityComparison(hexCapacity, qrCapacity, breakdown.gridCells, qrModules, code.cells)
      : {
          hexSymbolArea: breakdown.gridCells * Math.sqrt(3),
          qrSymbolArea: qrModules * qrModules,
          hexPrintArea: 0,
          qrPrintArea: (qrModules + 2) * (qrModules + 2),
          hexDensity: hexCapacity / Math.max(breakdown.gridCells * Math.sqrt(3), 1),
          qrDensity: qrCapacity / Math.max(qrModules * qrModules, 1),
          hexPrintDensity: 0,
          qrPrintDensity: qrCapacity / Math.max((qrModules + 2) * (qrModules + 2), 1),
          densityRatio: 0,
          printDensityRatio: 0,
          advantage: 0,
          printAdvantage: 0,
          maxDensity: 1,
          maxPrintDensity: 1,
          quietMarginCells: 1
        };
    const hexUtilization = hexCapacity > 0 ? (payloadBits / hexCapacity) * 100 : 0;
    const qrUtilization = qrCapacity > 0 ? (payloadBits / qrCapacity) * 100 : 0;
    const winner = encodeError ? 'QR Code' : density.hexDensity >= density.qrDensity ? hexLabel : 'QR Code';
    const printWinner = encodeError ? 'QR Code' : density.hexPrintDensity >= density.qrPrintDensity ? hexLabel : 'QR Code';

    return {
      payloadBits,
      code,
      encodeError,
      breakdown,
      density,
      parityCellCount: 0,
      qrModules,
      qrVersion,
      qrCapacity,
      qrRawBits,
      hexCapacity,
      hexDensity: density.hexDensity,
      qrDensity: density.qrDensity,
      hexPrintDensity: density.hexPrintDensity,
      qrPrintDensity: density.qrPrintDensity,
      maxDensity: Math.max(density.maxDensity, density.qrDensity, density.hexDensity, 0.001),
      maxPrintDensity: Math.max(density.maxPrintDensity, density.qrPrintDensity, density.hexPrintDensity, 0.001),
      densityRatio: density.densityRatio,
      printDensityRatio: density.printDensityRatio,
      advantage: density.advantage,
      printAdvantage: density.printAdvantage,
      hexUtilization,
      qrUtilization,
      hexSpareBits: Math.max(hexCapacity - payloadBits, 0),
      qrSpareBits: Math.max(qrCapacity - payloadBits, 0),
      winner,
      printWinner,
      bitsPerCell: Math.log2(level),
      structuralOverheadPct: (breakdown.structuralCells / Math.max(breakdown.gridCells, 1)) * 100,
      hasPayload,
      formatVersion,
      hexLabel
    };
  }, [trimmed, hasPayload, level, ecLevel, formatVersion, hexLabel]);

  useEffect(() => {
    let cancelled = false;

    if (!stats.code) {
      setHexUrl('');
      return;
    }

    hexCodeToPngDataUrl(stats.code, {
      size: 5,
      customStyle: HEX_PRESETS.cobalt.style,
      width: 120
    })
      .then((url) => {
        if (!cancelled) setHexUrl(url);
      })
      .catch(() => {
        if (!cancelled) setHexUrl('');
      });

    return () => {
      cancelled = true;
    };
  }, [stats.code]);

  const analysisCards = useMemo(
    () =>
      stats.encodeError
        ? [
            {
              label: 'Status',
              value: 'Over capacity',
              detail: stats.encodeError.message,
              icon: Award,
              tone: 'accent' as const
            },
            {
              label: 'Payload',
              value: `${stats.encodeError.payloadBytes} bytes`,
              detail: `Exceeds ~${stats.encodeError.maxPayloadBytesEstimate} byte estimate at fmt ${stats.formatVersion}`,
              icon: Gauge,
              tone: 'success' as const
            },
            {
              label: 'Max grid',
              value: `v${MAX_HEX_VERSION}`,
              detail: `${stats.encodeError.maxCapacityBits} usable bits at current settings`,
              icon: Activity,
              tone: 'muted' as const
            },
            {
              label: 'QR baseline',
              value: `${stats.qrCapacity} bits`,
              detail: `QR v${stats.qrVersion} still fits this payload for comparison`,
              icon: ShieldCheck,
              tone: 'muted' as const
            }
          ]
        : [
      {
        label: 'Winner',
        value: stats.winner,
        detail:
          stats.winner === stats.hexLabel
            ? `${stats.densityRatio.toFixed(2)}× area-normalized density`
            : `${(1 / stats.densityRatio).toFixed(2)}× QR advantage at EC ${ecLevel}`,
        icon: Award,
        tone: 'accent' as const
      },
      {
        label: 'Payload Fit',
        value: `${stats.hexUtilization.toFixed(1)}%`,
        detail: `${stats.hexSpareBits} spare bits · v${stats.code?.version ?? '—'}${isModernFormat(stats.formatVersion) && stats.code ? ` · ⬡code H${stats.code.radius}` : ''}`,
        icon: Gauge,
        tone: 'success' as const
      },
      {
        label: 'Structural',
        value: `${stats.structuralOverheadPct.toFixed(1)}%`,
        detail:
          isModernFormat(stats.formatVersion)
            ? `${stats.breakdown.structuralCells} reserved cells · compact fiducials + perimeter sync`
            : `${stats.breakdown.structuralCells} reserved cells · legacy finder layout`,
        icon: Activity,
        tone: 'muted' as const
      },
      {
        label: 'Protection',
        value: isModernFormat(stats.formatVersion) ? `Stream ${ecLevel}` : `XOR ${ecLevel}`,
        detail:
          isModernFormat(stats.formatVersion)
            ? `${stats.breakdown.ecOverheadPercent.toFixed(0)}% stream ECC + XOR parity bytes`
            : 'Legacy XOR parity bytes + neighbor vote',
        icon: ShieldCheck,
        tone: 'muted' as const
      }
        ],
    [stats, ecLevel]
  );

  const comparisonRows = useMemo(
    () => [
      { label: 'Format', hex: stats.hexLabel, qr: `QR v${stats.qrVersion}`, hexHighlight: true },
      { label: 'Grid', hex: 'Hexagonal', qr: 'Square' },
      {
        label: 'Data channel',
        hex:
          isModernFormat(stats.formatVersion)
            ? `${stats.breakdown.totalDataCells} cells (${stats.breakdown.structuralCells} structural)`
            : `${stats.breakdown.payloadCells} payload cells`,
        qr: `${stats.qrModules}×${stats.qrModules} modules`,
        hexHighlight: stats.breakdown.totalDataCells > stats.qrRawBits / 4
      },
      {
        label: 'Usable capacity',
        hex: `${stats.hexCapacity} bits`,
        qr: `${stats.qrCapacity} bits (est.)`,
        hexHighlight: stats.hexCapacity > stats.qrCapacity
      },
      {
        label: 'Density',
        hex: `${stats.hexDensity.toFixed(2)} bits/u² (symbol)`,
        qr: `${stats.qrDensity.toFixed(2)} bits/u² (symbol)`,
        hexHighlight: stats.hexDensity > stats.qrDensity
      },
      {
        label: 'Print density',
        hex: `${stats.hexPrintDensity.toFixed(2)} bits/u²`,
        qr: `${stats.qrPrintDensity.toFixed(2)} bits/u²`,
        hexHighlight: stats.hexPrintDensity > stats.qrPrintDensity
      },
      {
        label: 'Symbol area',
        hex: `${stats.breakdown.gridCells} cells × √3 u²`,
        qr: `${stats.qrModules}² modules`,
        hexHighlight: stats.density.hexSymbolArea < stats.density.qrSymbolArea
      },
      {
        label: 'Print footprint',
        hex: `${stats.density.hexPrintArea.toFixed(1)} u²`,
        qr: `${stats.density.qrPrintArea.toFixed(0)} u²`,
        hexHighlight: stats.density.hexPrintArea < stats.density.qrPrintArea
      },
      {
        label: 'Quiet zone',
        hex: `${stats.density.quietMarginCells}-cell margin + outline`,
        qr: `margin: ${stats.density.quietMarginCells}`,
        hexHighlight: true
      },
      {
        label: 'Border',
        hex: isModernFormat(stats.formatVersion) ? 'Cluster outline + corner triads' : 'Cluster outline',
        qr: 'Corner finders',
        hexHighlight: true
      },
      {
        label: 'Bits / module',
        hex: `${stats.bitsPerCell}b × ${level} levels`,
        qr: '1b binary',
        hexHighlight: level > 2
      },
      {
        label: 'Fill order',
        hex: 'Helix wavefront',
        qr: 'Zig-zag columns',
        hexHighlight: true
      },
      {
        label: 'Sync',
        hex: isModernFormat(stats.formatVersion) ? 'Perimeter Gold code' : 'Gold-coded ring',
        qr: 'Timing patterns',
        hexHighlight: true
      },
      {
        label: 'Error correction',
        hex: isModernFormat(stats.formatVersion) ? `Stream ECC + XOR (${ecLevel})` : `XOR parity (${ecLevel})`,
        qr: `Reed–Solomon (${ecLevel})`
      },
      {
        label: 'Neighbors',
        hex: '6 equidistant',
        qr: '4 + 4 diagonal',
        hexHighlight: true
      }
    ],
    [stats, level, ecLevel]
  );

  return (
    <section className="panel animate-in" style={{ overflow: 'hidden' }}>
      <div
        style={{
          padding: 'var(--space-2xl)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 'var(--space-md)'
        }}
      >
        <div>
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--accent)',
              margin: '0 0 4px'
            }}
          >
            Analysis
          </p>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.01em'
            }}
          >
            Density Comparison
          </h2>
        </div>
        {stats.advantage > 0 && !stats.encodeError && (
          <span className="badge badge-success">
            <TrendingUp size={12} />+{stats.advantage.toFixed(0)}% denser
          </span>
        )}
      </div>

      <div className="panel-body">
        {stats.encodeError && (
          <div style={{ marginBottom: 'var(--space-2xl)' }}>
            <EncodeErrorPanel error={stats.encodeError} compact />
          </div>
        )}
        <div
          className="comparison-insight-grid"
          style={{
            display: 'grid',
            gap: 'var(--space-lg)',
            marginBottom: 'var(--space-2xl)'
          }}
        >
          <div
            style={{
              background: 'var(--accent-soft)',
              border: '1px solid var(--border-accent)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-xl)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
              <Award size={18} color="var(--accent)" />
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: 'var(--accent)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em'
                }}
              >
                Winner
              </span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>
              {stats.winner}
            </div>
            <p style={{ margin: 'var(--space-md) 0 0', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
              {stats.encodeError
                ? `${stats.hexLabel} cannot encode this payload. Shorten the text or switch to lower EC / higher cell levels. QR v${stats.qrVersion} remains available as a baseline (${stats.qrCapacity} est. bits).`
                : stats.winner === stats.hexLabel
                  ? isModernFormat(stats.formatVersion)
                    ? `Same payload at EC ${ecLevel}: ${stats.densityRatio.toFixed(2)}× symbol density vs QR v${stats.qrVersion}. ⬡code H${stats.code!.radius} reserves ${stats.structuralOverheadPct.toFixed(0)}% structural cells with C8 multi-state encoding.`
                    : `Same payload at EC ${ecLevel}: ${stats.densityRatio.toFixed(2)}× symbol density vs QR v${stats.qrVersion}, ${stats.printDensityRatio.toFixed(2)}× on rendered print footprint.`
                  : `QR v${stats.qrVersion} wins on symbol density for this payload and EC level (${stats.printWinner} on print footprint).`}
            </p>
          </div>

          <div
            className="comparison-metric-grid"
            style={{
              display: 'grid',
              gap: 'var(--space-md)'
            }}
          >
            {analysisCards.map(({ label, value, detail, icon: Icon, tone }) => (
              <div
                key={label}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-lg)',
                  minWidth: 0
                }}
              >
                <Icon
                  size={16}
                  color={tone === 'accent' ? 'var(--accent)' : tone === 'success' ? 'var(--success)' : 'var(--text-tertiary)'}
                  style={{ marginBottom: 'var(--space-md)' }}
                />
                <div style={{ fontSize: 18, fontWeight: 850, color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginTop: 6
                  }}
                >
                  {label}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.45, margin: 'var(--space-sm) 0 0' }}>
                  {detail}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xl)', marginBottom: 'var(--space-2xl)' }}>
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Hexagon size={14} color="var(--accent)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {stats.hexLabel} · ⬡code H{stats.code?.radius ?? stats.breakdown.gridCells} · symbol density
                </span>
              </div>
              <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                {stats.hexDensity.toFixed(2)}
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: 4 }}>
                  bits/u²
                </span>
              </span>
            </div>
            <div className="comparison-bar-track">
              <div
                className="comparison-bar-fill hex"
                style={{
                  width: animate ? `${(stats.hexDensity / stats.maxDensity) * 100}%` : '0%'
                }}
              />
            </div>
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Grid3x3 size={14} color="var(--text-tertiary)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  QR Code · v{stats.qrVersion} · symbol density
                </span>
              </div>
              <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>
                {stats.qrDensity.toFixed(2)}
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: 4 }}>
                  bits/u²
                </span>
              </span>
            </div>
            <div className="comparison-bar-track">
              <div
                className="comparison-bar-fill qr"
                style={{
                  width: animate ? `${(stats.qrDensity / stats.maxDensity) * 100}%` : '0%'
                }}
              />
            </div>
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Hexagon size={14} color="var(--accent)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {stats.hexLabel} · print footprint
                </span>
              </div>
              <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                {stats.hexPrintDensity.toFixed(2)}
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: 4 }}>
                  bits/u²
                </span>
              </span>
            </div>
            <div className="comparison-bar-track">
              <div
                className="comparison-bar-fill hex print"
                style={{
                  width: animate ? `${(stats.hexPrintDensity / stats.maxPrintDensity) * 100}%` : '0%'
                }}
              />
            </div>
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-sm)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
                <Grid3x3 size={14} color="var(--text-tertiary)" />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>
                  QR Code · print footprint
                </span>
              </div>
              <span className="font-mono" style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)' }}>
                {stats.qrPrintDensity.toFixed(2)}
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-tertiary)', marginLeft: 4 }}>
                  bits/u²
                </span>
              </span>
            </div>
            <div className="comparison-bar-track">
              <div
                className="comparison-bar-fill qr print"
                style={{
                  width: animate ? `${(stats.qrPrintDensity / stats.maxPrintDensity) * 100}%` : '0%'
                }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-lg)',
            marginBottom: 'var(--space-2xl)'
          }}
        >
          <div
            style={{
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-accent)',
              padding: 'var(--space-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-sm)'
            }}
          >
            <div style={{ width: '100%', maxWidth: 140 }}>
              {stats.code && hexUrl ? (
                <img
                  src={hexUrl}
                  alt={`${stats.hexLabel} preview`}
                  style={{ width: 120, height: 'auto', borderRadius: 4, display: 'block', margin: '0 auto' }}
                />
              ) : stats.encodeError ? (
                <EncodeErrorPanel error={stats.encodeError} compact />
              ) : (
                <Hexagon size={28} color="var(--accent)" strokeWidth={1.5} style={{ margin: '0 auto', display: 'block' }} />
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>{stats.hexLabel}</span>
            <span className="font-mono" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
              {stats.hexCapacity}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>
              {stats.encodeError
                ? `max ${stats.hexCapacity} bits · payload too large`
                : `${stats.breakdown.gridCells} cells · ${stats.breakdown.structuralCells} structural`}
            </span>
          </div>
          <div
            style={{
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-default)',
              padding: 'var(--space-lg)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-sm)'
            }}
          >
            {qrUrl ? (
              <img
                src={qrUrl}
                alt="QR baseline"
                style={{ width: 120, height: 120, borderRadius: 4, imageRendering: 'pixelated' }}
              />
            ) : (
              <Grid3x3 size={28} color="var(--text-tertiary)" strokeWidth={1.5} />
            )}
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)' }}>QR Code</span>
            <span className="font-mono" style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
              {stats.qrCapacity}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center' }}>
              est. data bits · {stats.qrModules}×{stats.qrModules} modules · margin {stats.density.quietMarginCells}
            </span>
          </div>
        </div>

        <table className="comparison-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Hexagon size={10} /> {stats.hexLabel}
                </span>
              </th>
              <th>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Grid3x3 size={10} /> QR Code
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map((row) => (
              <tr key={row.label}>
                <td style={{ fontWeight: 600, color: 'var(--text-tertiary)' }}>{row.label}</td>
                <td className={row.hexHighlight ? 'highlight' : ''}>{row.hex}</td>
                <td>{row.qr}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div
          style={{
            marginTop: 'var(--space-xl)',
            paddingTop: 'var(--space-lg)',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-sm)'
          }}
        >
          <Zap size={14} color="var(--text-muted)" style={{ marginTop: 1, flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6, margin: 0 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>Payload:</strong>{' '}
            {stats.hasPayload ? (
              <>
                {stats.payloadBits} bits. {stats.hexLabel} uses {stats.bitsPerCell} bits/cell at {level} levels with{' '}
                {stats.breakdown.streamOverheadBits}b header and {stats.breakdown.ecOverheadPercent.toFixed(0)}%
                {isModernFormat(stats.formatVersion) ? ' stream ECC' : ' XOR EC'} —
                leaving {stats.hexSpareBits} spare bits. QR estimate uses the same EC level (
                {stats.qrUtilization.toFixed(1)}% utilized). Symbol density divides by encoded grid area (
                {stats.breakdown.gridCells} hex cells at √3 u²/cell vs {stats.qrModules}² QR modules). Print density
                uses the same rendered footprint as the preview — hex cluster outline with a{' '}
                {stats.density.quietMarginCells}-cell quiet margin ({stats.density.hexPrintArea.toFixed(1)} u²) vs QR
                margin {stats.density.quietMarginCells} ({stats.density.qrPrintArea.toFixed(0)} u²).
              </>
            ) : (
              <>Enter a payload to compare live encode sizes. Showing minimum-grid capacity baselines.</>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}
