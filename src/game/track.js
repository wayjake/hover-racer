import * as THREE from 'three'

// Deterministic RNG so the canyon is the same every run
export function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(1337)

// Winding control points heading roughly -z, with smoothed random turns
const points = []
let x = 0
let z = 0
let dir = 0
for (let i = 0; i < 36; i++) {
  points.push(new THREE.Vector3(x, 0, z))
  dir += (rand() - 0.5) * 1.3
  dir *= 0.82
  x += Math.sin(dir) * 70
  z -= Math.cos(dir) * 70
}

export const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)

export const samples = curve.getSpacedPoints(1200)
export const COUNT = samples.length
export const HALF_WIDTH = 10
const SPACING = curve.getLength() / COUNT // metres between samples (~2)

// ------------------------------------------------------------ elevation ---
// Rolling hills from layered sines, flattened near the start line.
export const heights = new Array(COUNT)
for (let i = 0; i < COUNT; i++) {
  const u = i / (COUNT - 1)
  heights[i] =
    Math.sin(u * Math.PI * 2.1 + 0.6) * 9 +
    Math.sin(u * Math.PI * 5.3 + 2.1) * 5 +
    Math.sin(u * Math.PI * 11 + 4.2) * 2
}
for (let i = 0; i < 60; i++) heights[i] *= i / 60
heights[0] = 0

// Launch ramps: height eases up over `len` samples, then drops sheer at the
// tip — carry speed in and you go airborne.
const RAMPS = [
  { at: 0.3, rise: 5, len: 26 },
  { at: 0.58, rise: 6.5, len: 30 },
  { at: 0.86, rise: 5.5, len: 28 },
]
for (const r of RAMPS) {
  const tip = Math.floor(r.at * COUNT)
  for (let i = 0; i <= r.len; i++) {
    const k = i / r.len
    heights[tip - r.len + i] += r.rise * k * k
  }
}

// Lift everything so the lowest dip clears the flat desert plane at y≈0 —
// otherwise the plane occludes the craft in valleys.
{
  const offset = 0.4 - Math.min(...heights)
  for (let i = 0; i < COUNT; i++) heights[i] += offset
}

// Backward-difference slope (dHeight/dArc) so the ramp tip reads as uphill;
// the sheer face right after it is where you're already airborne.
export const slopes = heights.map((h, i) =>
  i === 0 ? 0 : (h - heights[i - 1]) / SPACING,
)

// ---------------------------------------------------------- track width ---
// Tight squeezes where the canyon pinches in, blended with smoothstep.
export const halfWidths = new Array(COUNT).fill(HALF_WIDTH)
const NARROWS = [
  { at: 0.18, len: 55, w: 5 },
  { at: 0.47, len: 45, w: 5.5 },
  { at: 0.72, len: 65, w: 4.5 },
]
for (const nz of NARROWS) {
  const c = Math.floor(nz.at * COUNT)
  for (
    let i = Math.max(0, c - nz.len);
    i <= Math.min(COUNT - 1, c + nz.len);
    i++
  ) {
    const t = Math.abs(i - c) / nz.len
    const s = t * t * (3 - 2 * t)
    halfWidths[i] = Math.min(halfWidths[i], nz.w + (HALF_WIDTH - nz.w) * s)
  }
}

export const tangents = samples.map((_, i) => {
  const a = samples[Math.max(0, i - 1)]
  const b = samples[Math.min(COUNT - 1, i + 1)]
  return new THREE.Vector3().subVectors(b, a).normalize()
})

// Perpendicular in the xz plane, pointing "left" of travel
export const normals = tangents.map((t) => new THREE.Vector3(-t.z, 0, t.x))

// Nearest sample index to pos, searching a window around the last known index
export function nearestIndex(pos, hint) {
  const from = Math.max(0, hint - 40)
  const to = Math.min(COUNT - 1, hint + 40)
  let best = hint
  let bestD = Infinity
  for (let i = from; i <= to; i++) {
    const dx = pos.x - samples[i].x
    const dz = pos.z - samples[i].z
    const d = dx * dx + dz * dz
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}
