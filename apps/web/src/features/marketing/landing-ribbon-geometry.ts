import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Vector3,
} from "three";

export type LightWaypoint = { x: number; y: number; z: number };

/** World coordinates use ten units per viewport width, independent of device DPR. */
export function createLightRibbon(
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
  // A page-long curve needs a denser arc-length table than Three's default:
  // otherwise narrow filaments visibly kink around the section bends.
  curve.arcLengthDivisions = Math.max(2048, points.length * 128);
  curve.updateArcLengths();
  const length = curve.getLength();
  const segments = Math.min(
    6144,
    Math.max(1536, Math.ceil((length * viewportWidth) / 40)),
  );
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const progress = index / segments;
    const center = curve.getPointAt(progress);
    const tangent = curve.getTangentAt(progress);
    const normal = new Vector3(-tangent.y, tangent.x, 0).normalize();
    const width = 0.8 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(progress * 24), 2);
    for (const side of [-1, 1]) {
      positions.push(
        center.x + normal.x * side * width,
        center.y + normal.y * side * width,
        center.z,
      );
      normals.push(normal.x, normal.y, 0);
      uvs.push((side + 1) / 2, progress * length);
    }
    if (index < segments) {
      const vertex = index * 2;
      indices.push(
        vertex,
        vertex + 1,
        vertex + 2,
        vertex + 1,
        vertex + 3,
        vertex + 2,
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aAcross", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
