import {
  CatmullRomCurve3,
  DataTexture,
  FloatType,
  LinearFilter,
  RGBAFormat,
  Vector3,
} from "three";

export type LightWaypoint = { x: number; y: number; z: number };
export type RibbonField = { values: Float32Array; minY: number; maxY: number };

/**
 * Project a Catmull-Rom spine into a small GPU lookup field. A broad offset mesh
 * self-intersects inside tight bends; the implicit field has no overlapping
 * triangles or diagonal UV seams, even where the light fans out.
 */
export function createRibbonField(
  points: LightWaypoint[],
  viewportWidth: number,
) {
  const curve = new CatmullRomCurve3(
    points.map(
      (point) =>
        new Vector3(
          (point.x - 0.5) * 10,
          (-point.y / viewportWidth) * 10,
          point.z,
        ),
    ),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = 4096;
  curve.updateArcLengths();
  const length = curve.getLength();
  const samples = Array.from({ length: 4097 }, (_, index) => {
    const progress = index / 4096;
    const center = curve.getPointAt(progress);
    return { x: center.x, y: -center.y, arc: progress * length };
  }).sort((a, b) => a.y - b.y);
  const first = samples[0]!,
    last = samples[samples.length - 1]!;
  const size = 2048,
    values = new Float32Array(size * 4);
  let cursor = 0;
  for (let index = 0; index < size; index++) {
    const y = first.y + ((last.y - first.y) * index) / (size - 1);
    while (cursor < samples.length - 2 && samples[cursor + 1]!.y < y) cursor++;
    const a = samples[cursor]!,
      b = samples[cursor + 1]!;
    const mix = Math.min(
      1,
      Math.max(0, (y - a.y) / Math.max(0.0001, b.y - a.y)),
    );
    values[index * 4] = a.x + (b.x - a.x) * mix;
    values[index * 4 + 1] = a.arc + (b.arc - a.arc) * mix;
  }
  const step = (last.y - first.y) / (size - 1);
  for (let index = 0; index < size; index++) {
    const before = Math.max(0, index - 4),
      after = Math.min(size - 1, index + 4);
    const x = values[index * 4]!,
      left = values[before * 4]!,
      right = values[after * 4]!;
    const slope = (right - left) / Math.max(step, (after - before) * step);
    const curvature =
      Math.abs(right - 2 * x + left) /
      Math.pow(4 * step, 2) /
      Math.pow(1 + slope * slope, 1.5);
    const pressure = 1 - Math.exp(-curvature * 2.0);
    values[index * 4 + 2] = 2.8 - pressure * 1.7;
    values[index * 4 + 3] = pressure;
  }
  // Smooth the envelope independently of the centerline so width never snaps
  // at spline joins (Catmull-Rom has continuous tangent, not curvature).
  const envelope = values.slice();
  for (let index = 0; index < size; index++) {
    let width = 0,
      pressure = 0,
      weight = 0;
    for (let offset = -12; offset <= 12; offset++) {
      const sample = Math.min(size - 1, Math.max(0, index + offset));
      const w = 13 - Math.abs(offset);
      width += envelope[sample * 4 + 2]! * w;
      pressure += envelope[sample * 4 + 3]! * w;
      weight += w;
    }
    values[index * 4 + 2] = width / weight;
    values[index * 4 + 3] = pressure / weight;
  }
  return { values, minY: first.y, maxY: last.y };
}

/** One allocation per renderer lifetime; layout changes only upload new values. */
export function createRibbonTexture(field: RibbonField) {
  const texture = new DataTexture(field.values, field.values.length / 4, 1, RGBAFormat, FloatType);
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Interpolate both coordinates and their range, preserving the current frame at t=0. */
export function blendRibbonField(output: RibbonField, from: RibbonField, to: RibbonField, progress: number) {
  for (let index = 0; index < output.values.length; index++) {
    output.values[index] = from.values[index]! + (to.values[index]! - from.values[index]!) * progress;
  }
  output.minY = from.minY + (to.minY - from.minY) * progress;
  output.maxY = from.maxY + (to.maxY - from.maxY) * progress;
}
