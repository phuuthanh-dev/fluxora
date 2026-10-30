import { BufferGeometry, Float32BufferAttribute } from "three";

export const STREAM_BUDGET = {
  points: 36000,
  strands: 44,
  segments: 1400,
} as const;
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded independent particles, not screen-space noise; stable across layout changes. */
export function createStreamParticles() {
  const rand = random(0x5eed1e);
  const count = STREAM_BUDGET.points;
  const position = new Float32Array(count * 3),
    off = new Float32Array(count * 2);
  const u = new Float32Array(count),
    seed = new Float32Array(count),
    size = new Float32Array(count),
    kind = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const k = rand();
    kind[i] = k < 0.79 ? 0 : k < 0.93 ? 1 : k < 0.96 ? 2 : 3;
    u[i] = rand();
    seed[i] = rand();
    off[i * 2] = (rand() + rand() + rand() + rand() - 2) * 0.5;
    off[i * 2 + 1] = (rand() + rand() + rand() + rand() - 2) * 0.5;
    size[i] =
      kind[i] === 0
        ? 0.35 + rand() ** 4 * 2.4
        : kind[i] === 1
          ? 0.3 + rand() * 0.6
          : kind[i] === 2
            ? 1.2 + rand() * 1.6
            : 0.25 + rand() * 0.4;
    position[i * 3 + 2] =
      kind[i] === 2 ? 1 + rand() * 1.4 : kind[i] === 3 ? -1.2 + rand() : 0;
  }
  const geometry = new BufferGeometry();
  for (const [name, array, itemSize] of [
    ["position", position, 3],
    ["aOff", off, 2],
    ["aU", u, 1],
    ["aSeed", seed, 1],
    ["aSize", size, 1],
    ["aKind", kind, 1],
  ] as const)
    geometry.setAttribute(name, new Float32BufferAttribute(array, itemSize));
  return geometry;
}

export function createStreamFilaments(
  segments: number = STREAM_BUDGET.segments,
) {
  const rand = random(0xf11a);
  const { strands } = STREAM_BUDGET;
  const count = strands * (segments + 1);
  const u = new Float32Array(count),
    strand = new Float32Array(count * 4),
    indices = [];
  for (let n = 0; n < strands; n++) {
    const data = [
      (rand() - 0.5) * 2,
      (rand() - 0.5) * 1.2,
      rand() * Math.PI * 2,
      0.93 + rand() * 0.07,
    ];
    for (let i = 0; i <= segments; i++) {
      const index = n * (segments + 1) + i;
      u[index] = i / segments;
      strand.set(data, index * 4);
      if (i < segments) indices.push(index, index + 1);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(new Float32Array(count * 3), 3),
  );
  geometry.setAttribute("aU", new Float32BufferAttribute(u, 1));
  geometry.setAttribute("aStrand", new Float32BufferAttribute(strand, 4));
  geometry.setIndex(indices);
  return geometry;
}
