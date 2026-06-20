# ⬡code (HexCode) — Hexagonal Barcode Engine

**⬡code** is a high-density 2D barcode engine built on flat-top hexagonal cells instead of classic square QR modules. The system features a modern Web UI generator, a React/TypeScript frontend, and a high-performance **Rust decoder** compiled to **WebAssembly** for fast sub-pixel raster grid sampling.

---

## Why Hexagonal?

Traditional QR codes use square grids where cells share four cardinal edges and only touch diagonally at corners. Hexagonal tiles share **six equal-length edges** with their neighbors. This geometric symmetry offers:
- **Symmetric Neighbors**: Any cell has six direct neighbors at exactly equal distance, eliminating diagonal sampling bias.
- **Denser Packing**: Hexagons form a tighter, more uniform visual layout that matches physical optics (circular lens blur circles) better than square corners.
- **Multilevel Gray Scaling**: Supported cell levels (`2`, `4`, or `8` fill levels per cell) pack `1`, `2`, or `3` bits of data per coordinate, yielding massive density gains over pure binary codes.
- **Robust Neighborhood Voting**: If a pixel sample is noisy, a weighted majority vote of its six surrounding cells can correct local errors prior to parity validation.

---

## Engine Architecture

The codebase is split between a modular TypeScript core (for generation and coordinate layout) and a high-performance Rust WASM library (for fast image decoding):

```
                               ┌────────────────────────┐
                               │     Web UI (React)     │
                               └───────────┬────────────┘
                                           │
                               ┌───────────▼────────────┐
                         ┌────►│  Web Worker (Decode)   │◄────┐
                         │     └───────────┬────────────┘     │
                         │                 │                  │
                ┌────────┴────────┐       │         ┌────────┴────────┐
                │ TypeScript Core │       │         │    Rust WASM    │
                │  (Generation)   │       │         │ (Raster Sample) │
                └─────────────────┘       ▼         └─────────────────┘
                                 [ Raster Frame Buffer ]
```

### Technical Specs

- **Profile C8 (Format v2)**: Features 8 calibrated grayscale levels per cell yielding 3 bits/cell. Includes dedicated calibration cells, metadata descriptors, and compact corner fiducials.
- **Wavefront Ordering**: Rather than standard spirals, modern v2 payloads are packed in concentric wavefront patterns, ensuring related data chunks stay localized.
- **Hybrid Decoder Pipeline**:
  1. Captures camera frames or uploaded image buffers.
  2. Spawns `decodeWorker.ts` to keep the browser main-thread responsive.
  3. Invokes the **Rust-WASM engine** (`wasm-pack`) to execute fast pixel density sampling, fit the hex grid coordinate system, and resolve axial offsets.
  4. Applies a local six-neighbor smoothing pass.
  5. Decodes format headers, validates stream parity, and reconstructs the UTF-8 payload.

---

## Directory Structure

- [src/core/](file:///Users/faistech/wwjs/hexqr/src/core/): Core TypeScript generators, format spec, axial math, and preview renderers.
- [wasm/hexqr_decoder/](file:///Users/faistech/wwjs/hexqr/wasm/hexqr_decoder/): Rust package compiling to WebAssembly (`lib.rs`).
- [tests/](file:///Users/faistech/wwjs/hexqr/tests/): Automated unit and integration test suites validating round-trips, parity validation, and WASM bindings.

---

## Running Locally

### 1. Build and Run Dev Server
Install dependencies and launch the Vite client:
```bash
npm install
npm run dev
```

### 2. Compile WebAssembly Decoder
Compile the Rust project inside `wasm/` using `wasm-pack` and target it for the Web UI:
```bash
npm run wasm:build
```

### 3. Run Verification Tests
Verify typescript and rust parity validation with Vitest:
```bash
npm test
```

---

## Development commands

- `npm run build`: Rebuilds the Rust WASM package, compiles TypeScript definitions, and creates a production-ready Vite bundle in `dist/`.
- `npm run lint`: Checks formatting and linting constraints.
- `npm run format`: Prettifies all source files.

---
## License

MIT - see [LICENSE](LICENSE).