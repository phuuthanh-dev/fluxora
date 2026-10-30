import {
  CatmullRomCurve3,
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  Vector3,
} from "three";

export const SPINE_SAMPLES = 2048;
export type LightWaypoint = { x: number; y: number; z: number; pinch?: number };
export type RibbonField = { values: Float32Array; length: number };

/** Document-space spine and transported normal/turn radius; fixed-size GPU storage. */
export function createRibbonField(
  points: LightWaypoint[],
  unit = 1,
): RibbonField {
  const curve = new CatmullRomCurve3(
    points.map((p) => new Vector3(p.x, p.y, p.z)),
    false,
    "centripetal",
  );
  curve.arcLengthDivisions = 4096;
  curve.updateArcLengths();
  const length = Math.max(1, curve.getLength());
  const samples = curve.getSpacedPoints(SPINE_SAMPLES - 1);
  const angles = samples.map((_, i) => {
    const tangent = curve.getTangentAt(i / (SPINE_SAMPLES - 1));
    return Math.atan2(tangent.y, tangent.x);
  });
  const radius = angles.map((_, i) => {
    const delta =
      angles[Math.min(SPINE_SAMPLES - 1, i + 12)]! -
      angles[Math.max(0, i - 12)]!;
    const turn = Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta)));
    return Math.min(
      1e4,
      (24 * length) / (SPINE_SAMPLES - 1) / Math.max(1e-4, turn) / unit,
    );
  });
  const filter = (input: number[], reach: number, min: boolean) =>
    input.map((_, i) => {
      const start = Math.max(0, i - reach),
        end = Math.min(input.length - 1, i + reach);
      let value = min ? Infinity : 0;
      for (let j = start; j <= end; j++)
        value = min ? Math.min(value, input[j]!) : value + input[j]!;
      return min ? value : value / (end - start + 1);
    });
  const held = filter(filter(filter(radius, 28, true), 48, false), 48, false);
  const peaks = points
    .filter((p) => p.pinch)
    .map((p) => {
      let nearest = 0,
        distance = Infinity;
      samples.forEach((s, i) => {
        const d = Math.hypot(s.x - p.x, s.y - p.y);
        if (d < distance) {
          distance = d;
          nearest = i;
        }
      });
      return { index: nearest, value: p.pinch! };
    });
  const values = new Float32Array(SPINE_SAMPLES * 8);
  samples.forEach((p, i) => {
    let pinch = 0;
    for (const peak of peaks) {
      const d =
        (((i - peak.index) / (SPINE_SAMPLES - 1)) * length) / (300 * unit);
      pinch = Math.max(pinch, peak.value * Math.exp(-d * d));
    }
    values.set([p.x, p.y, p.z, pinch], i * 4);
    values.set(
      [-Math.sin(angles[i]!), Math.cos(angles[i]!), held[i]!, 0],
      (SPINE_SAMPLES + i) * 4,
    );
  });
  return { values, length };
}

export function createRibbonTexture(field: RibbonField) {
  const texture = new DataTexture(
    field.values,
    SPINE_SAMPLES,
    2,
    RGBAFormat,
    FloatType,
  );
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Retarget from the last displayed frame, including interrupted layout morphs. */
export function blendRibbonField(
  output: RibbonField,
  from: RibbonField,
  to: RibbonField,
  progress: number,
) {
  for (let i = 0; i < output.values.length; i++)
    output.values[i] =
      from.values[i]! + (to.values[i]! - from.values[i]!) * progress;
  output.length = from.length + (to.length - from.length) * progress;
}
