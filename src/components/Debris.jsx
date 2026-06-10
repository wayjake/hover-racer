import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Pooled debris particles (wall chips, explosion chunks). Game code calls
// emitDebris() imperatively; the component integrates and renders the pool.

const MAX = 200
const GRAVITY = 22

const pool = []
for (let i = 0; i < MAX; i++) {
  pool.push({
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    life: 0,
    maxLife: 1,
    size: 1,
    color: new THREE.Color(),
    spin: 0,
  })
}
let cursor = 0

// Spawn `count` chunks at pos, biased along dir (a unit-ish push direction).
// kind: 'rock' for dusty wall chips, 'fire' for explosion chunks.
export function emitDebris(pos, dir, count, speed, kind = 'rock') {
  for (let n = 0; n < count; n++) {
    const p = pool[cursor]
    cursor = (cursor + 1) % MAX
    p.pos.copy(pos)
    p.vel
      .set(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5)
      .multiplyScalar(speed * 0.7)
      .addScaledVector(dir, speed * (0.5 + Math.random() * 0.8))
    p.maxLife = p.life = 0.5 + Math.random() * (kind === 'fire' ? 0.9 : 0.5)
    p.size = kind === 'fire' ? 0.25 + Math.random() * 0.5 : 0.12 + Math.random() * 0.3
    p.spin = (Math.random() - 0.5) * 12
    if (kind === 'fire') {
      const t = Math.random()
      p.color.setHSL(0.05 + t * 0.06, 0.95, 0.4 + t * 0.25)
    } else {
      const t = Math.random()
      p.color.setHSL(0.07 + t * 0.02, 0.4, 0.3 + t * 0.18)
    }
  }
}

const m = new THREE.Matrix4()
const q = new THREE.Quaternion()
const axis = new THREE.Vector3(1, 0.6, 0.3).normalize()
const scale = new THREE.Vector3()

export default function Debris() {
  const ref = useRef()
  const dummyColor = useMemo(() => new THREE.Color(), [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const mesh = ref.current
    let count = 0
    for (const p of pool) {
      if (p.life <= 0) continue
      p.life -= dt
      p.vel.y -= GRAVITY * dt
      p.pos.addScaledVector(p.vel, dt)
      const k = Math.max(p.life / p.maxLife, 0)
      q.setFromAxisAngle(axis, p.life * p.spin)
      scale.setScalar(p.size * (0.3 + 0.7 * k))
      m.compose(p.pos, q, scale)
      mesh.setMatrixAt(count, m)
      mesh.setColorAt(count, dummyColor.copy(p.color).multiplyScalar(0.4 + 0.6 * k))
      count++
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[null, null, MAX]} frustumCulled={false}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  )
}
