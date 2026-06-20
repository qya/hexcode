use std::collections::HashMap;
use wasm_bindgen::prelude::*;

const PARITY_BY_EC: [usize; 4] = [4, 8, 12, 16];
const HL3_LEVEL: i32 = 8;
const FINDER_PATTERN_RADIUS: i32 = 2;
const CENTER_LOGO_RADIUS: i32 = 2;
const RENDER_SIZE: f64 = 10.0;
const CELL_SCALE: f64 = 1.0;
const QUIET_MARGIN: f64 = 1.0;
const BORDER_STROKE: f64 = 0.14;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Kind {
    Data,
    Finder,
    Alignment,
    Timing,
    Format,
    Quiet,
    Fiducial,
    Sync,
    Calibration,
    Metadata,
}

#[derive(Clone, Copy)]
struct Cell {
    q: i32,
    r: i32,
    kind: Kind,
    value: i32,
}

#[wasm_bindgen]
pub struct HexDecodeResult {
    text: String,
    format_version: u8,
}

#[wasm_bindgen]
impl HexDecodeResult {
    #[wasm_bindgen(getter)]
    pub fn text(&self) -> String {
        self.text.clone()
    }

    #[wasm_bindgen(getter)]
    pub fn format_version(&self) -> u8 {
        self.format_version
    }
}

fn decode_v1_fast(data: &[u8], width: usize, height: usize) -> Option<HexDecodeResult> {
    const RADIUS_PRIORITY: [i32; 41] = [
        11, 10, 9, 8, 7, 6, 5, 4,
        12, 13, 14, 15, 16, 17, 18, 19, 20,
        21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
        31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44
    ];

    let mut best_v1: Option<(String, i32)> = None;
    for &radius in &RADIUS_PRIORITY {
        let mut found_v1_for_radius = false;
        for has_center_logo in [false, true] {
            for level in [8_i32, 4, 2] {
                let template = build_v1_cells(radius, level, has_center_logo);
                let view_box = view_box_for_cells(&template, has_center_logo);
                for fit in [false, true] {
                    let align = align_for(width as f64, height as f64, view_box, fit);
                    let sampled = sample_v1_cells(data, width, height, &template, view_box, align, level);
                    if let Some((text, score)) = try_decode_v1_sampled_scored(&sampled, level) {
                        if best_v1.as_ref().map(|(_, best)| score > *best).unwrap_or(true) {
                            best_v1 = Some((text, score));
                            found_v1_for_radius = true;
                        }
                    }
                }
            }
        }
        if found_v1_for_radius {
            break;
        }
    }
    best_v1.map(|(text, _)| HexDecodeResult { text, format_version: 1 })
}

#[wasm_bindgen]
pub fn decode_hex_rgba(data: &[u8], width: usize, height: usize) -> Result<HexDecodeResult, JsValue> {
    if data.len() < width.saturating_mul(height).saturating_mul(4) {
        return Err(err("RGBA buffer is smaller than width*height*4"));
    }

    if let Some(result) = decode_hl3_fast(data, width, height) {
        return Ok(result);
    }
    if let Some(result) = decode_v1_fast(data, width, height) {
        return Ok(result);
    }
    if let Some(result) = decode_hl3_refined(data, width, height) {
        return Ok(result);
    }

    Err(err("WASM decoder could not decode hex image"))
}

#[wasm_bindgen]
pub fn decode_hl3_rgba(data: &[u8], width: usize, height: usize) -> Result<String, JsValue> {
    decode_hex_rgba(data, width, height).map(|result| result.text())
}

fn err(message: &str) -> JsValue {
    JsValue::from_str(message)
}

#[derive(Clone, Copy)]
struct ViewBox {
    min_x: f64,
    min_y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, Copy)]
struct Align {
    offset_x: f64,
    offset_y: f64,
    x_scale: f64,
    y_scale: f64,
}

fn align_for(image_width: f64, image_height: f64, view_box: ViewBox, fit: bool) -> Align {
    if !fit {
        return Align {
            offset_x: 0.0,
            offset_y: 0.0,
            x_scale: 1.0,
            y_scale: 1.0,
        };
    }
    let image_aspect = image_width / image_height;
    let view_aspect = view_box.width / view_box.height;
    if image_aspect > view_aspect {
        let fitted_width = image_height * view_aspect;
        Align {
            offset_x: (image_width - fitted_width) / 2.0,
            offset_y: 0.0,
            x_scale: fitted_width / image_width,
            y_scale: 1.0,
        }
    } else {
        let fitted_height = image_width / view_aspect;
        Align {
            offset_x: 0.0,
            offset_y: (image_height - fitted_height) / 2.0,
            x_scale: 1.0,
            y_scale: fitted_height / image_height,
        }
    }
}

fn build_hl3_cells(radius: i32) -> Vec<Cell> {
    let mut cells = Vec::new();
    for q in -radius..=radius {
        let min_r = (-radius).max(-q - radius);
        let max_r = radius.min(-q + radius);
        for r in min_r..=max_r {
            let kind = hl3_kind_for(q, r, radius);
            let value = hl3_structural_value(q, r, radius, kind);
            cells.push(Cell { q, r, kind, value });
        }
    }
    cells.sort_by_key(|c| (axial_distance(c.q, c.r), ring_index(c.q, c.r), c.q, c.r));
    cells
}

fn build_v1_cells(radius: i32, level: i32, has_center_logo: bool) -> Vec<Cell> {
    let patterns = build_v1_pattern_map(radius, has_center_logo);
    let mut cells = Vec::new();
    for q in -radius..=radius {
        let min_r = (-radius).max(-q - radius);
        let max_r = radius.min(-q + radius);
        for r in min_r..=max_r {
            let kind = *patterns.get(&(q, r)).unwrap_or(&Kind::Data);
            let value = v1_structural_value(q, r, radius, kind, level);
            cells.push(Cell { q, r, kind, value });
        }
    }
    cells.sort_by_key(|c| (axial_distance(c.q, c.r), c.q, c.r));
    cells
}

fn finder_centers(radius: i32) -> [(i32, i32); 3] {
    [(-radius, 0), (0, -radius), (radius, -radius)]
}

fn build_v1_pattern_map(radius: i32, has_center_logo: bool) -> HashMap<(i32, i32), Kind> {
    let mut map = HashMap::new();
    for center in finder_centers(radius - FINDER_PATTERN_RADIUS) {
        for q in -radius..=radius {
            let min_r = (-radius).max(-q - radius);
            let max_r = radius.min(-q + radius);
            for r in min_r..=max_r {
                if axial_distance_between(q, r, center.0, center.1) <= FINDER_PATTERN_RADIUS {
                    map.insert((q, r), Kind::Finder);
                }
            }
        }
    }
    if has_center_logo {
        for q in -radius..=radius {
            let min_r = (-radius).max(-q - radius);
            let max_r = radius.min(-q + radius);
            for r in min_r..=max_r {
                if axial_distance(q, r) <= CENTER_LOGO_RADIUS && !map.contains_key(&(q, r)) {
                    map.insert((q, r), Kind::Quiet);
                }
            }
        }
    }
    if radius >= 7 {
        let alignment_offset = if has_center_logo {
            CENTER_LOGO_RADIUS + 2
        } else {
            0
        };
        let center = (alignment_offset, -alignment_offset);
        if !map.contains_key(&center) {
            map.insert(center, Kind::Alignment);
        }
        for neighbor in neighbor_coords(center) {
            if !map.contains_key(&neighbor) {
                map.insert(neighbor, Kind::Alignment);
            }
        }
    }
    for q in -radius..=radius {
        let min_r = (-radius).max(-q - radius);
        let max_r = radius.min(-q + radius);
        for r in min_r..=max_r {
            if axial_distance(q, r) == 2.max(radius - 3) && !map.contains_key(&(q, r)) {
                map.insert((q, r), Kind::Timing);
            }
        }
    }
    for q in -2..=2 {
        let coord = (q, radius - 2);
        if !map.contains_key(&coord) {
            map.insert(coord, Kind::Format);
        }
    }
    map
}

fn neighbor_coords((q, r): (i32, i32)) -> [(i32, i32); 6] {
    [
        (q + 1, r),
        (q + 1, r - 1),
        (q, r - 1),
        (q - 1, r),
        (q - 1, r + 1),
        (q, r + 1),
    ]
}

fn v1_structural_value(q: i32, r: i32, radius: i32, kind: Kind, level: i32) -> i32 {
    match kind {
        Kind::Finder => {
            let min_dist = finder_centers(radius - FINDER_PATTERN_RADIUS)
                .iter()
                .map(|(cq, cr)| axial_distance_between(q, r, *cq, *cr))
                .min()
                .unwrap_or(99);
            if min_dist == 0 || min_dist == FINDER_PATTERN_RADIUS {
                level - 1
            } else {
                0
            }
        }
        Kind::Alignment => level - 1,
        Kind::Timing => {
            if axial_distance(q, r) % 2 == 0 {
                level - 1
            } else {
                0
            }
        }
        Kind::Format => (q + r).abs() % 2,
        _ => 0,
    }
}

fn hl3_kind_for(q: i32, r: i32, radius: i32) -> Kind {
    for coord in fiducials(radius) {
        if (q, r) == coord {
            return Kind::Fiducial;
        }
    }
    let reserved = fiducials(radius);
    for coord in perimeter_sync(radius, &reserved) {
        if (q, r) == coord {
            return Kind::Sync;
        }
    }
    for coord in calibration_coords(radius) {
        if (q, r) == coord {
            return Kind::Calibration;
        }
    }
    for coord in metadata_coords(radius) {
        if (q, r) == coord {
            return Kind::Metadata;
        }
    }
    Kind::Data
}

fn fiducials(radius: i32) -> Vec<(i32, i32)> {
    let corners = [(-radius, 0), (radius, -radius), (radius, 0), (-radius, radius)];
    let mut out = Vec::new();
    for (q, r) in corners {
        let inward = if q != 0 {
            (q - q.signum(), r)
        } else {
            (q, r - r.signum())
        };
        let wing = if q != 0 {
            (q - q.signum(), r + r.signum())
        } else {
            (q + q.signum(), r - r.signum())
        };
        out.extend([(q, r), inward, wing]);
    }
    out
}

fn calibration_coords(radius: i32) -> Vec<(i32, i32)> {
    let d = 3.max((radius as f64 * 0.36).floor() as i32);
    vec![
        (d, 0),
        (-d, 0),
        (0, d),
        (0, -d),
        (d / 2, d / 2),
        (-d / 2, -d / 2),
    ]
}

fn metadata_coords(radius: i32) -> Vec<(i32, i32)> {
    let ring_distance = 4.max((radius as f64 * 0.45).floor() as i32);
    let ring = hex_ring(ring_distance);
    let step = 1.max(ring.len() / 8);
    ring.into_iter()
        .enumerate()
        .filter_map(|(i, c)| (i % step == 0).then_some(c))
        .take(8)
        .collect()
}

fn perimeter_sync(radius: i32, reserved: &[(i32, i32)]) -> Vec<(i32, i32)> {
    let ring: Vec<_> = hex_ring(radius)
        .into_iter()
        .filter(|coord| !reserved.contains(coord))
        .collect();
    let step = 1.max(ring.len() / 14);
    ring.into_iter()
        .enumerate()
        .filter_map(|(i, c)| (i % step == 0).then_some(c))
        .take(14)
        .collect()
}

fn hex_ring(radius: i32) -> Vec<(i32, i32)> {
    if radius == 0 {
        return vec![(0, 0)];
    }
    let dirs = [(1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)];
    let mut q = 0;
    let mut r = -radius;
    let mut out = Vec::new();
    for (dq, dr) in dirs {
        for _ in 0..radius {
            out.push((q, r));
            q += dq;
            r += dr;
        }
    }
    out
}

fn hl3_structural_value(q: i32, r: i32, radius: i32, kind: Kind) -> i32 {
    match kind {
        Kind::Fiducial => fiducial_value(q, r, radius),
        Kind::Sync => sync_value(q, r, radius),
        Kind::Calibration => {
            let anchors = [0, HL3_LEVEL - 1, 1, 2, 3, 4];
            calibration_coords(radius)
                .iter()
                .position(|coord| *coord == (q, r))
                .map(|i| anchors[i])
                .unwrap_or(0)
        }
        _ => 0,
    }
}

fn fiducial_value(q: i32, r: i32, radius: i32) -> i32 {
    let patterns = [[7, 0, 7], [7, 7, 0], [0, 7, 7], [7, 0, 0]];
    let corners = [(-radius, 0), (radius, -radius), (radius, 0), (-radius, radius)];
    for (triad_index, (cq, cr)) in corners.into_iter().enumerate() {
        let inward = if cq != 0 {
            (cq - cq.signum(), cr)
        } else {
            (cq, cr - cr.signum())
        };
        let wing = if cq != 0 {
            (cq - cq.signum(), cr + cr.signum())
        } else {
            (cq + cq.signum(), cr - cr.signum())
        };
        let triad = [(cq, cr), inward, wing];
        if let Some(cell_index) = triad.iter().position(|coord| *coord == (q, r)) {
            return patterns[triad_index][cell_index];
        }
    }
    0
}

fn sync_value(q: i32, r: i32, radius: i32) -> i32 {
    let ring = hex_ring(radius);
    let index = ring.iter().position(|coord| *coord == (q, r)).unwrap_or(0);
    if gold((index + radius as usize * 5) % 127) == 1 {
        7
    } else {
        0
    }
}

fn gold(index: usize) -> u8 {
    fn mseq(length: usize, tap: u32, seed: u32) -> Vec<u8> {
        let mut register = seed & ((1 << 5) - 1);
        if register == 0 {
            register = 0x1f;
        }
        let mut out = Vec::with_capacity(length);
        for _ in 0..length {
            out.push((register & 1) as u8);
            let feedback = ((register >> tap) ^ register) & 1;
            register = (register >> 1) | (feedback << 4);
        }
        out
    }
    let a = mseq(127, 2, 0x1f);
    let b = mseq(127, 1, 0x0f);
    a[index] ^ b[index]
}

fn axial_to_pixel(q: i32, r: i32) -> (f64, f64) {
    (
        RENDER_SIZE * 1.5 * q as f64,
        RENDER_SIZE * 3.0_f64.sqrt() * (r as f64 + q as f64 / 2.0),
    )
}

fn cell_render_radius() -> f64 {
    RENDER_SIZE * CELL_SCALE * 0.82
}

fn view_box_for_cells(cells: &[Cell], has_center_logo: bool) -> ViewBox {
    let data_radius = cell_render_radius();
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    for cell in cells {
        let (x, y) = axial_to_pixel(cell.q, cell.r);
        let radius = if matches!(cell.kind, Kind::Finder | Kind::Fiducial) {
            RENDER_SIZE
        } else {
            data_radius
        };
        min_x = min_x.min(x - radius);
        max_x = max_x.max(x + radius);
        min_y = min_y.min(y - radius);
        max_y = max_y.max(y + radius);
    }
    if has_center_logo {
        let logo_radius = RENDER_SIZE * (CENTER_LOGO_RADIUS as f64 + 1.15);
        min_x = min_x.min(-logo_radius);
        max_x = max_x.max(logo_radius);
        min_y = min_y.min(-logo_radius);
        max_y = max_y.max(logo_radius);
    }
    let margin = RENDER_SIZE * QUIET_MARGIN + RENDER_SIZE * BORDER_STROKE;
    ViewBox {
        min_x: min_x - margin,
        min_y: min_y - margin,
        width: max_x - min_x + margin * 2.0,
        height: max_y - min_y + margin * 2.0,
    }
}

fn svg_to_pixel(x: f64, y: f64, view_box: ViewBox, width: f64, height: f64, align: Align) -> (f64, f64) {
    (
        ((x - view_box.min_x) / view_box.width) * width * align.x_scale + align.offset_x,
        ((y - view_box.min_y) / view_box.height) * height * align.y_scale + align.offset_y,
    )
}

fn luma(data: &[u8], width: usize, height: usize, x: f64, y: f64) -> Option<f64> {
    let px = x.round() as isize;
    let py = y.round() as isize;
    if px < 0 || py < 0 || px >= width as isize || py >= height as isize {
        return None;
    }
    let i = (py as usize * width + px as usize) * 4;
    let r = data[i] as f64;
    let g = data[i + 1] as f64;
    let b = data[i + 2] as f64;
    let a = data[i + 3] as f64 / 255.0;

    let blended_r = r * a + 255.0 * (1.0 - a);
    let blended_g = g * a + 255.0 * (1.0 - a);
    let blended_b = b * a + 255.0 * (1.0 - a);

    Some(0.2126 * blended_r + 0.7152 * blended_g + 0.0722 * blended_b)
}

fn sample_hex(data: &[u8], width: usize, height: usize, cx: f64, cy: f64, radius: f64) -> f64 {
    let r = radius * 0.4;
    let mut samples = [0.0; 7];
    let mut count = 0;

    if let Some(v) = luma(data, width, height, cx, cy) {
        samples[count] = v;
        count += 1;
    }

    let r_half = r * 0.5;
    let r_tri = r * 0.8660254037844386;
    let offsets = [
        (r, 0.0),
        (r_half, r_tri),
        (-r_half, r_tri),
        (-r, 0.0),
        (-r_half, -r_tri),
        (r_half, -r_tri),
    ];

    for (dx, dy) in offsets {
        if let Some(v) = luma(data, width, height, cx + dx, cy + dy) {
            samples[count] = v;
            count += 1;
        }
    }

    if count == 0 {
        return 248.0;
    }

    let slice = &mut samples[..count];
    slice.sort_by(|a, b| a.partial_cmp(b).unwrap());
    slice[count / 2]
}

fn pixel_radius_for_cell(cell: &Cell, view_box: ViewBox, width: usize, height: usize, align: Align) -> f64 {
    let scale = ((width as f64 * align.x_scale) / view_box.width)
        .min((height as f64 * align.y_scale) / view_box.height);
    let svg_radius = if matches!(cell.kind, Kind::Finder | Kind::Fiducial) {
        RENDER_SIZE
    } else {
        cell_render_radius()
    };
    svg_radius * scale
}

fn sample_hl3_cells(
    data: &[u8],
    width: usize,
    height: usize,
    cells: &[Cell],
    view_box: ViewBox,
    align: Align,
) -> Vec<Cell> {
    let mut anchors = Vec::new();
    for cell in cells {
        if cell.kind == Kind::Calibration {
            let (sx, sy) = axial_to_pixel(cell.q, cell.r);
            let (px, py) = svg_to_pixel(sx, sy, view_box, width as f64, height as f64, align);
            let pixel_radius = pixel_radius_for_cell(cell, view_box, width, height, align);
            anchors.push((cell.value, sample_hex(data, width, height, px, py, pixel_radius)));
        }
    }
    anchors.sort_by_key(|(value, _)| *value);

    cells
        .iter()
        .map(|cell| {
            let (sx, sy) = axial_to_pixel(cell.q, cell.r);
            let (px, py) = svg_to_pixel(sx, sy, view_box, width as f64, height as f64, align);
            let pixel_radius = pixel_radius_for_cell(cell, view_box, width, height, align);
            let lum = sample_hex(data, width, height, px, py, pixel_radius);
            let value = if matches!(cell.kind, Kind::Data | Kind::Metadata) {
                quantize_with_anchors(lum, &anchors, HL3_LEVEL)
            } else {
                cell.value
            };
            Cell { value, ..*cell }
        })
        .collect()
}

fn sample_v1_cells(
    data: &[u8],
    width: usize,
    height: usize,
    cells: &[Cell],
    view_box: ViewBox,
    align: Align,
    level: i32,
) -> Vec<Cell> {
    cells
        .iter()
        .map(|cell| {
            let (sx, sy) = axial_to_pixel(cell.q, cell.r);
            let (px, py) = svg_to_pixel(sx, sy, view_box, width as f64, height as f64, align);
            let pixel_radius = pixel_radius_for_cell(cell, view_box, width, height, align);
            let lum = sample_hex(data, width, height, px, py, pixel_radius);
            let value = if cell.kind == Kind::Data {
                quantize_default(lum, level)
            } else {
                cell.value
            };
            Cell { value, ..*cell }
        })
        .collect()
}

fn quantize_default(sample: f64, level: i32) -> i32 {
    ((sample - 248.0) / (15.0 - 248.0) * (level - 1) as f64)
        .round()
        .clamp(0.0, (level - 1) as f64) as i32
}

fn quantize_with_anchors(sample: f64, anchors: &[(i32, f64)], level: i32) -> i32 {
    if anchors.len() < 2 {
        return quantize_default(sample, level);
    }
    let mut best = 0;
    let mut best_distance = f64::INFINITY;
    for value in 0..level {
        let expected = palette_luma(value, anchors);
        let distance = (sample - expected).abs();
        if distance < best_distance {
            best_distance = distance;
            best = value;
        }
    }
    best
}

fn palette_luma(value: i32, anchors: &[(i32, f64)]) -> f64 {
    if value <= anchors[0].0 {
        return anchors[0].1;
    }
    if value >= anchors[anchors.len() - 1].0 {
        return anchors[anchors.len() - 1].1;
    }
    for pair in anchors.windows(2) {
        let (lv, ll) = pair[0];
        let (rv, rl) = pair[1];
        if value >= lv && value <= rv {
            let t = (value - lv) as f64 / (rv - lv) as f64;
            return ll + t * (rl - ll);
        }
    }
    anchors[0].1
}

fn decode_hl3_fast(data: &[u8], width: usize, height: usize) -> Option<HexDecodeResult> {
    const RADIUS_PRIORITY: [i32; 41] = [
        11, 10, 9, 8, 7, 6, 5, 4,
        12, 13, 14, 15, 16, 17, 18, 19, 20,
        21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
        31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44
    ];
    for &radius in &RADIUS_PRIORITY {
        let template = build_hl3_cells(radius);
        let view_box = view_box_for_cells(&template, false);
        for fit in [false, true] {
            let align = align_for(width as f64, height as f64, view_box, fit);
            let sampled = sample_hl3_cells(data, width, height, &template, view_box, align);
            if let Some(text) = try_decode_hl3_sampled(&sampled) {
                return Some(HexDecodeResult { text, format_version: 2 });
            }
        }
    }
    None
}

fn decode_hl3_refined(data: &[u8], width: usize, height: usize) -> Option<HexDecodeResult> {
    const RADIUS_PRIORITY: [i32; 41] = [
        11, 10, 9, 8, 7, 6, 5, 4,
        12, 13, 14, 15, 16, 17, 18, 19, 20,
        21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
        31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44
    ];
    let mut best: Option<(String, i32)> = None;
    for &radius in &RADIUS_PRIORITY {
        let template = build_hl3_cells(radius);
        let view_box = view_box_for_cells(&template, false);
        let mut found_any = false;
        for fit in [false, true] {
            let base_align = align_for(width as f64, height as f64, view_box, fit);
            for align in alignment_variants(base_align, width) {
                let sampled = sample_hl3_cells(data, width, height, &template, view_box, align);
                if let Some((text, score)) = try_decode_hl3_sampled_scored(&sampled) {
                    if best.as_ref().map(|(_, best_score)| score > *best_score).unwrap_or(true) {
                        best = Some((text, score));
                        found_any = true;
                    }
                }
            }
        }
        if found_any {
            break;
        }
    }
    best.map(|(text, _)| HexDecodeResult { text, format_version: 2 })
}

fn try_decode_hl3_sampled(cells: &[Cell]) -> Option<String> {
    try_decode_hl3_sampled_scored(cells).map(|(text, _)| text)
}

fn alignment_variants(base: Align, width: usize) -> Vec<Align> {
    let span = if width >= 900 { 8 } else { 6 };
    let mut variants = Vec::with_capacity(((span * 2 + 1) * (span * 2 + 1)) as usize);
    for offset_y in -span..=span {
        for offset_x in -span..=span {
            variants.push(Align {
                offset_x: base.offset_x + offset_x as f64,
                offset_y: base.offset_y + offset_y as f64,
                x_scale: base.x_scale,
                y_scale: base.y_scale,
            });
        }
    }
    variants
}

fn score_decode(text: &str, metadata_payload_len: Option<usize>) -> i32 {
    let mut score = (text.len().min(160) * 2) as i32;
    if let Some(expected) = metadata_payload_len {
        if expected > 0 {
            if text.len() == expected {
                score += 250;
            } else {
                score -= (text.len() as i32 - expected as i32).abs() * 80;
            }
        }
    }
    if text
        .chars()
        .all(|c| c.is_ascii() && (c.is_ascii_graphic() || c == ' ' || c == '\t' || c == '\n' || c == '\r'))
    {
        score += 40;
    }
    score
}

fn try_decode_hl3_sampled_scored(cells: &[Cell]) -> Option<(String, i32)> {
    let data_cells: Vec<Cell> = cells.iter().filter(|c| c.kind == Kind::Data).copied().collect();
    let metadata = read_metadata(cells);
    let mut mask_ids = vec![0, 1, 2, 3];
    let mut ec_indices = vec![0_usize, 1, 2, 3];
    if let Some(meta) = &metadata {
        if meta.format_version >= 2 {
            mask_ids.retain(|mask| *mask != meta.mask_id);
            mask_ids.insert(0, meta.mask_id);
            if (meta.ec_index as usize) < PARITY_BY_EC.len() {
                ec_indices.retain(|ec| *ec != meta.ec_index as usize);
                ec_indices.insert(0, meta.ec_index as usize);
            }
        }
    }

    let mut best: Option<(String, i32)> = None;
    for mask_id in mask_ids {
        let values: Vec<i32> = data_cells
            .iter()
            .map(|cell| unmask(cell.value, cell.q, cell.r, mask_id, HL3_LEVEL))
            .collect();
        let mut text = decode_stream(&values, HL3_LEVEL, &ec_indices, None);
        if text.is_none() {
            if let Some(meta) = &metadata {
                if meta.payload_length > 0 {
                    text = decode_stream(
                        &values,
                        HL3_LEVEL,
                        &ec_indices,
                        Some(meta.payload_length as usize),
                    );
                }
            }
        }
        if let Some(text) = text {
            let metadata_payload_len = metadata.as_ref().and_then(|meta| {
                let len = meta.payload_length as usize;
                (len > 0 && len == text.len()).then_some(len)
            });
            let score = score_decode(&text, metadata_payload_len);
            if best.as_ref().map(|(_, best_score)| score > *best_score).unwrap_or(true) {
                best = Some((text, score));
            }
        }
    }
    best
}

fn try_decode_v1_sampled_scored(cells: &[Cell], level: i32) -> Option<(String, i32)> {
    let data_cells: Vec<Cell> = cells.iter().filter(|c| c.kind == Kind::Data).copied().collect();
    let ec_indices = [1_usize, 0, 2, 3];
    let mut best: Option<(String, i32)> = None;
    for mask_id in [0, 1, 2, 3] {
        let values: Vec<i32> = data_cells
            .iter()
            .map(|cell| unmask(cell.value, cell.q, cell.r, mask_id, level))
            .collect();
        if let Some(text) = decode_stream(&values, level, &ec_indices, None) {
            let score = score_decode(&text, None);
            if best.as_ref().map(|(_, best_score)| score > *best_score).unwrap_or(true) {
                best = Some((text, score));
            }
        }
    }
    best
}

fn decode_stream(
    values: &[i32],
    level: i32,
    ec_indices: &[usize],
    metadata_payload_len: Option<usize>,
) -> Option<String> {
    let mut bytes = levels_to_bytes(values, level);
    if bytes.len() < 2 {
        return None;
    }
    let header_len = ((bytes[0] as usize) << 8) | bytes[1] as usize;
    let payload_len = if let Some(expected) = metadata_payload_len {
        if expected > 0 && header_len != expected {
            bytes[0] = (expected >> 8) as u8;
            bytes[1] = (expected & 0xff) as u8;
            expected
        } else {
            header_len
        }
    } else {
        header_len
    };
    if payload_len == 0 || payload_len > 4096 {
        return None;
    }
    let data_len = 2 + payload_len;
    for ec_index in ec_indices {
        let parity_count = PARITY_BY_EC[*ec_index];
        if bytes.len() < data_len + parity_count || !verify_parity(&bytes, data_len, parity_count) {
            continue;
        }
        let payload = &bytes[2..data_len];
        let text = std::str::from_utf8(payload).ok()?.to_string();
        if !is_plausible_text(&text) {
            continue;
        }
        return Some(text);
    }
    None
}

fn is_plausible_text(text: &str) -> bool {
    if text.len() < 4 {
        return false;
    }
    !text.chars().any(|c| {
        c.is_control() && c != '\n' && c != '\r' && c != '\t'
    })
}

struct Metadata {
    payload_length: u16,
    ec_index: u8,
    mask_id: i32,
    format_version: i32,
}

fn read_metadata(cells: &[Cell]) -> Option<Metadata> {
    let values: Vec<i32> = cells
        .iter()
        .filter(|c| c.kind == Kind::Metadata)
        .map(|cell| cell.value)
        .collect();
    if values.len() < 8 {
        return None;
    }
    let bits: Vec<u8> = values
        .into_iter()
        .flat_map(|value| [((value >> 2) & 1) as u8, ((value >> 1) & 1) as u8, (value & 1) as u8])
        .collect();
    let read = |start: usize, width: usize| -> i32 {
        let end = (start + width).min(bits.len());
        if start >= end {
            return 0;
        }
        bits[start..end]
            .iter()
            .fold(0, |acc, bit| (acc << 1) | *bit as i32)
    };
    Some(Metadata {
        payload_length: read(0, 16) as u16,
        ec_index: read(16, 2) as u8,
        mask_id: read(18, 2),
        format_version: read(20, 3),
    })
}

fn axial_distance(q: i32, r: i32) -> i32 {
    q.abs().max(r.abs()).max((-q - r).abs())
}

fn axial_distance_between(q1: i32, r1: i32, q2: i32, r2: i32) -> i32 {
    let ac1 = -q1 - r1;
    let ac2 = -q2 - r2;
    (q1 - q2)
        .abs()
        .max((r1 - r2).abs())
        .max((ac1 - ac2).abs())
}

fn ring_index(q: i32, r: i32) -> i32 {
    let d = axial_distance(q, r);
    if d == 0 {
        return 0;
    }
    let idx = if r == -d && q >= 0 && q < d {
        q
    } else if q == d && r >= -d && r < 0 {
        2 * d + r
    } else if q > 0 && r >= 0 && q + r == d {
        3 * d - q
    } else if r == d && q <= 0 && q > -d {
        3 * d - q
    } else if q == -d && r > 0 && r <= d {
        5 * d - r
    } else if q < 0 && r <= 0 && q + r == -d {
        6 * d + q
    } else {
        0
    };
    idx + 1
}

fn unmask(value: i32, q: i32, r: i32, mask_id: i32, level: i32) -> i32 {
    let delta = (q * 31 + r * 17 + mask_id * 13).rem_euclid(level);
    (value - delta).rem_euclid(level)
}

fn levels_to_bytes(values: &[i32], level: i32) -> Vec<u8> {
    let bits_per_cell = (level as f64).log2() as usize;
    let mut bits = Vec::new();
    for value in values {
        for bit_index in (0..bits_per_cell).rev() {
            bits.push(((value >> bit_index) & 1) as u8);
        }
    }
    bits.chunks(8)
        .filter(|chunk| chunk.len() == 8)
        .map(|chunk| chunk.iter().fold(0, |acc, bit| (acc << 1) | bit))
        .collect()
}

fn verify_parity(bytes: &[u8], data_len: usize, parity_count: usize) -> bool {
    let mut parity = vec![0_u8; parity_count];
    for (i, byte) in bytes[..data_len].iter().enumerate() {
        parity[i % parity_count] ^= *byte;
    }
    parity.as_slice() == &bytes[data_len..data_len + parity_count]
}

