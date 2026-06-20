import { BarChart3, Binary, Cpu, Grid3x3, Hexagon, Route, ScanLine, ShieldCheck } from 'lucide-react';

const specs = [
  {
    title: '⬡code v2 profile',
    value: 'C8',
    detail: '8 calibrated grayscale states, 3 bits per sampled hex cell.',
    icon: Hexagon
  },
  {
    title: 'Decode target',
    value: 'WASM',
    detail: 'Rust sampler path for v2 raster images.',
    icon: Cpu
  },
  {
    title: 'Legacy mode',
    value: '⬡code legacy',
    detail: 'Format v1 spiral layout for simple object round trips and regression coverage.',
    icon: Binary
  },
  {
    title: 'Protection',
    value: 'XOR',
    detail: 'Stream parity and metadata validation gate false positives.',
    icon: ShieldCheck
  }
];

const pipeline = [
  'Rasterize input in the decode worker',
  'Fit the expected hex lattice to the symbol bounds',
  'Sample calibrated cell luminance',
  'Read metadata, unmask cells, validate parity',
  'Return UTF-8 payload to the UI'
];

export function HexCodeDocs() {
  return (
    <div className="route-page docs-page animate-in">
      <section className="route-hero docs-hero">
        <div>
          <span className="eyebrow">Reference</span>
          <h1>⬡code format notes</h1>
          <p>
            The project focuses on ⬡code (format v2) for dense image decoding and keeps ⬡code legacy (format v1) as a
            small compatibility path.
          </p>
        </div>
        <div className="docs-hero-mark" aria-hidden="true">
          <Hexagon />
        </div>
      </section>

      <section className="spec-grid">
        {specs.map((spec) => {
          const Icon = spec.icon;
          return (
            <article key={spec.title} className="docs-card spec-card">
              <div className="docs-icon-wrap">
                <Icon size={20} />
              </div>
              <span>{spec.title}</span>
              <strong>{spec.value}</strong>
              <p>{spec.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="docs-split">
        <article className="panel docs-panel">
          <div className="panel-heading">
            <span className="eyebrow">Geometry</span>
            <h2>Why hex cells</h2>
          </div>
          <p>
            Flat-top axial coordinates give every cell six edge-sharing neighbors at equal distance. That keeps local
            sampling errors symmetric and makes confidence checks easier than diagonal-heavy square grids.
          </p>
          <div className="docs-metric-grid">
            <div><Grid3x3 size={16} /> 6-neighbor lattice</div>
            <div><BarChart3 size={16} /> 3 bits/cell in C8</div>
            <div><Route size={16} /> Wavefront data order</div>
          </div>
        </article>

        <article className="panel docs-panel">
          <div className="panel-heading">
            <span className="eyebrow">Pipeline</span>
            <h2>Decode stages</h2>
          </div>
          <ol className="pipeline-list">
            {pipeline.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>
      </section>

      <section className="panel docs-panel docs-wide-panel">
        <div className="panel-heading">
          <span className="eyebrow">Current Direction</span>
          <h2>Keep the format surface narrow</h2>
        </div>
        <div className="docs-two-column">
          <p>
            ⬡code v2 is the practical target for image scanning: compact fiducials, metadata cells, calibration cells,
            and C8 payload density. The scanner should optimize for that one visual grammar instead of spending time on
            ambiguous legacy candidates.
          </p>
          <p>
            ⬡code legacy (v1) remains useful for simple object round trips and regression coverage. It should not
            compete with v2 in the image decoder unless there is a specific legacy import workflow.
          </p>
        </div>
        <div className="decode-status-strip docs-strip">
          <span><ScanLine size={14} /> `/decode` for images</span>
          <span><Hexagon size={14} /> `/` for generation</span>
          <span><ShieldCheck size={14} /> `/docs` for format notes</span>
        </div>
      </section>
    </div>
  );
}
