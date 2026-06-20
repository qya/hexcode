# ⬡code (HexCode): A High-Density Hexagonal 2D Barcode System with Multi-Level Grayscale Encoding

## Abstract

We present **⬡code** (also referred to as HexCode/HexQR), a novel 2D barcode specification that abandons traditional square matrices in favor of a flat-top hexagonal coordinate lattice. By exploiting the spatial symmetry of the six-neighbor honeycomb tiling, the format increases robustness to sampling distortion and introduces multi-level grayscale modulation (2, 4, or 8 states per cell) to achieve up to a 3× density improvement over binary codes. We detail the coordinate mechanics, layout specifications for both legacy (v1) and modern (v2) formats, the neighbor-consensus error correction mechanism, and the hybrid TypeScript/Rust-WASM engine designed for real-time raster scanning.

---

## 1. Introduction & Background

For decades, matrix barcodes such as QR Code and DataMatrix have relied on square grids. While squares simplify Cartesian indexing, they possess structural constraints:
1. **Connectivity Anisotropy**: A square cell shares edges with four cardinal neighbors but only touches its four diagonal neighbors at single points. This difference in distance ($\text{pitch}$ vs. $\sqrt{2}\cdot\text{pitch}$) distorts spatial interpolation and edge detection during off-angle optical captures.
2. **Binary Limitations**: Most commercial barcodes are strictly binary (black/white), requiring a significant spatial footprint to represent long strings.

⬡code addresses these limitations using a hexagonal lattice. Every cell shares six identical edge boundaries with its neighbors, ensuring isotropic spatial relationship. Furthermore, the format supports Multi-Level Amplitude Modulation (ML-AM), allowing each cell to carry up to 3 bits of data through 8 calibrated grayscale levels.

---

## 2. Geometric Formulation & Tiling Mechanics

### 2.1 Axial Coordinate System
We define the hexagonal grid using flat-topped hexagons under axial coordinates $(q, r)$, where $q$ is the column index and $r$ is the row index.

For a hexagon of outer radius (distance from center to vertex) $s$, the grid spacing between adjacent centers is $d = s\sqrt{3}$. The conversion from axial coordinates $(q, r)$ to Cartesian coordinates $(x, y)$ is defined as:

$$
x = s \cdot \frac{3}{2} \cdot q
$$
$$
y = s \cdot \sqrt{3} \cdot \left(r + \frac{q}{2}\right)
$$

The distance between any cell center and all six of its immediate neighbors is constant:

$$
D = \sqrt{\Delta x^2 + \Delta y^2} = s\sqrt{3}
$$

### 2.2 Tiling Density
A hexagonal lattice provides a denser tiling than a square grid. The area of a single hexagonal cell is:

$$
A_{\text{hex}} = \frac{3\sqrt{3}}{2} s^2 \approx 2.598 s^2
$$

Compared to a square module of width $w = s\sqrt{3}$ (matching the pitch), the hexagonal area is smaller, allowing more modules to be packed into the same circumscribed print area.

---

## 3. Format & Layout Specifications

### 3.1 Legacy Format (v1)
The v1 format employs a concentric spiral data ordering. Starting from the center, cells are numbered sequentially outwards. This is designed for simple, fast serialization where data localization is not a priority.

### 3.2 Modern Format (v2 / HL3)
The v2 format introduces structural regions designed for robust image-sensor acquisition:
- **Finder Patterns**: Located at three outer corners, these patterns consist of distinct concentric rings allowing the scanner to calculate perspective transformations.
- **Timing / Sync Rings**: Connect the finder patterns, allowing the decoder to calibrate the grid pitch and trace cell coordinates.
- **Calibration Cells**: Strategically placed cells containing reference grayscales (e.g., minimum, intermediate, and maximum intensities) to adjust for uneven lighting.
- **Metadata Cells**: Carry details like the format version, error correction level (L, M, Q, H), mask identifier, and total payload length.
- **Wavefront Data Path**: Rather than spiraling out, data cells are indexed using a wavefront traversal algorithm. The data flows sequentially from the finders inward, ensuring related byte clusters remain physically adjacent on the printed surface.

---

## 4. Multi-Level Gray Scale Encoding

To maximize data density, ⬡code supports three density levels ($L_{\text{cell}}$):
- **C2 Profile (1 bit/cell)**: Binary encoding (Off, On).
- **C4 Profile (2 bits/cell)**: Four grayscale steps ($0\%, 33\%, 66\%, 100\%$).
- **C8 Profile (3 bits/cell)**: Eight grayscale steps ($0\%, 14\%, 28\%, 42\%, 57\%, 71\%, 85\%, 100\%$).

During capture, the decoder uses local calibration cells to construct a luminance mapping curve, correcting for ambient lighting and print contrast variations.

---

## 5. Error Correction & Consensus Smoothing

### 5.1 Local Six-Neighbor Majority Voting
In optical scanning, high-frequency noise or localized glare can corrupt cell sampling. Since every data cell $C_{q, r}$ is bounded by six neighbors:

$$
N(C_{q, r}) = \{ C_{q+1, r}, C_{q+1, r-1}, C_{q, r-1}, C_{q-1, r}, C_{q-1, r+1}, C_{q, r+1} \}
$$

The decoder performs a weighted consensus pass. If a cell’s measured luminance falls near a decision boundary, its value is adjusted to match the weighted average of its neighbors, resolving local sampling ambiguity before parity calculations.

### 5.2 Parity Validation
Following neighborhood smoothing, the raw bits are unpacked from the coordinate sequence. Stream integrity is verified using a checksum/parity buffer tailored to the selected error correction level:
- **L (Low)**: 4 parity bytes
- **M (Medium)**: 8 parity bytes
- **Q (Quarter)**: 12 parity bytes
- **H (High)**: 16 parity bytes

---

## 6. WASM-Accelerated Decoder Engine

The decoding pipeline requires high-speed pixel processing, which is offloaded to WebAssembly.

```
[Camera/File Input] ➔ [decodeWorker.ts] ➔ [Rust WASM Engine] 
                                                  │
             ┌────────────────────────────────────┴────────────────────────────────────┐
             ▼                                    ▼                                    ▼
    [Bilinear Sampling]                [Axial Lattice Fitting]              [Consensus & Checksum]
```

### 6.1 Rust Implementation
The Rust core (`wasm/hexqr_decoder/src/lib.rs`) operates directly on raw RGBA buffers. It performs:
- **Bilinear Filtering**: Computes precise sub-pixel grayscale values.
- **Lattice Fitting**: Finds the optimal transformation matrix (rotation, translation, and scale) by matching the finder patterns and sync rings.
- **Multi-threaded Worker Interface**: Runs inside a browser web worker, ensuring the main thread remains fully responsive at 60 FPS during camera streams.

---

## 7. Benchmarks & Comparisons

Compared to a standard QR Code (binary matrix), ⬡code achieves significantly higher data density for the same print size when using the C8 (8-level) profile:

| Format / Profile | Bits per Cell | Area Efficiency vs QR | Capacity (Version 5, Level M) |
| :--- | :--- | :--- | :--- |
| **Standard QR** | 1 | 1.00× (Baseline) | ~106 Bytes |
| **⬡code C2** | 1 | ~1.15× | ~120 Bytes |
| **⬡code C4** | 2 | ~2.30× | ~240 Bytes |
| **⬡code C8** | 3 | ~3.45× | ~360 Bytes |

---

## 8. Conclusion & Future Directions

The ⬡code engine demonstrates that hexagonal lattices and multi-level grayscales are highly viable for modern web-based barcode scanners. Future work will replace the stream parity layer with full Reed-Solomon block codes to allow recovery from large visual occlusions.
