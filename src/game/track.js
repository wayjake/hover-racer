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
export const HALF_WIDTH = 13

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
