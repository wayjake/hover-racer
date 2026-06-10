import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import {
  samples,
  tangents,
  normals,
  COUNT,
  heights,
  halfWidths,
  mulberry32,
} from '../game/track.js'

const STEP = 3 // build geometry from every 3rd track sample

// Ribbon of canyon wall along one side of the track, with a jagged
// three-row profile (base, mid ledge, leaning top).
function buildWall(side) {
  const rand = mulberry32(side > 0 ? 41 : 97)
  const positions = []
  const indices = []
  const n = Math.floor(COUNT / STEP)

  for (let i = 0; i < n; i++) {
    const idx = i * STEP
    const p = samples[idx]
    const norm = normals[idx]
    const h = heights[idx]
    const base = halfWidths[idx] + 2.5 + rand() * 3
    const height = 16 + rand() * 14
    const rows = [
      [base, -1], // sunk below the desert floor so elevated track never shows gaps
      [base + 2 + rand() * 3, h + height * 0.45],
      [base + 6 + rand() * 5, h + height],
    ]
    for (const [off, y] of rows) {
      positions.push(p.x + norm.x * off * side, y, p.z + norm.z * off * side)
    }
  }

  for (let i = 0; i < n - 1; i++) {
    for (let r = 0; r < 2; r++) {
      const a = i * 3 + r
      const b = (i + 1) * 3 + r
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  let geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo = geo.toNonIndexed()
  geo.computeVertexNormals()
  return geo
}

// Darker strip following the track's elevation and width, with sloped
// shoulders dropping toward the desert floor so hills read as solid ground
function buildTrackSurface() {
  const positions = []
  const indices = []
  const n = Math.floor(COUNT / STEP)

  for (let i = 0; i < n; i++) {
    const idx = i * STEP
    const p = samples[idx]
    const norm = normals[idx]
    const hw = halfWidths[idx]
    const h = heights[idx]
    const shoulderY = Math.max(h - 6, -0.05)
    const cols = [
      [-(hw + 3.5), shoulderY],
      [-hw, h + 0.03],
      [hw, h + 0.03],
      [hw + 3.5, shoulderY],
    ]
    for (const [off, y] of cols) {
      positions.push(p.x + norm.x * off, y, p.z + norm.z * off)
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let c = 0; c < 3; c++) {
      const a = i * 4 + c
      const b = (i + 1) * 4 + c
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function Rocks() {
  const ref = useRef()

  const placements = useMemo(() => {
    const rand = mulberry32(2026)
    const list = []
    // Jagged rocks hugging the canyon walls
    for (let i = 0; i < COUNT; i += 4) {
      for (const side of [-1, 1]) {
        if (rand() < 0.25) continue
        const off = halfWidths[i] + 5 + rand() * 22
        const p = samples[i]
        const norm = normals[i]
        list.push({
          x: p.x + norm.x * off * side,
          z: p.z + norm.z * off * side,
          sx: 2 + rand() * 5,
          sy: 5 + rand() * 22,
          sz: 2 + rand() * 5,
          rot: rand() * Math.PI * 2,
          tone: rand(),
        })
      }
    }
    // Distant mesas for depth
    for (let i = 0; i < COUNT; i += 24) {
      const side = rand() < 0.5 ? -1 : 1
      const off = 70 + rand() * 150
      const p = samples[i]
      const norm = normals[i]
      list.push({
        x: p.x + norm.x * off * side,
        z: p.z + norm.z * off * side,
        sx: 20 + rand() * 40,
        sy: 25 + rand() * 45,
        sz: 20 + rand() * 40,
        rot: rand() * Math.PI * 2,
        tone: rand(),
      })
    }
    return list
  }, [])

  useLayoutEffect(() => {
    const mesh = ref.current
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const color = new THREE.Color()
    placements.forEach((r, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.rot)
      m.compose(
        new THREE.Vector3(r.x, r.sy * 0.25, r.z),
        q,
        new THREE.Vector3(r.sx, r.sy, r.sz),
      )
      mesh.setMatrixAt(i, m)
      color.setHSL(0.07 + r.tone * 0.025, 0.45, 0.32 + r.tone * 0.2)
      mesh.setColorAt(i, color)
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor.needsUpdate = true
  }, [placements])

  return (
    <instancedMesh ref={ref} args={[null, null, placements.length]}>
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial roughness={1} flatShading />
    </instancedMesh>
  )
}

function FinishGate() {
  const idx = COUNT - 12
  const p = samples[idx]
  const t = tangents[idx]
  const hw = halfWidths[idx]
  const heading = Math.atan2(-t.x, -t.z)
  return (
    <group position={[p.x, heights[idx], p.z]} rotation={[0, heading, 0]}>
      <mesh position={[-hw, 5, 0]}>
        <boxGeometry args={[1.2, 10, 1.2]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
      <mesh position={[hw, 5, 0]}>
        <boxGeometry args={[1.2, 10, 1.2]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
      <mesh position={[0, 9.5, 0]}>
        <boxGeometry args={[hw * 2 + 1.2, 1.6, 0.6]} />
        <meshBasicMaterial color="#ffb347" />
      </mesh>
    </group>
  )
}

export default function Canyon() {
  const leftWall = useMemo(() => buildWall(1), [])
  const rightWall = useMemo(() => buildWall(-1), [])
  const surface = useMemo(() => buildTrackSurface(), [])

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[4000, 6000]} />
        <meshStandardMaterial color="#c79a63" roughness={1} />
      </mesh>
      <mesh geometry={surface}>
        <meshStandardMaterial color="#a87f4e" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={leftWall}>
        <meshStandardMaterial color="#b5824c" roughness={1} flatShading side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={rightWall}>
        <meshStandardMaterial color="#ad7a46" roughness={1} flatShading side={THREE.DoubleSide} />
      </mesh>
      <Rocks />
      <FinishGate />
    </group>
  )
}
