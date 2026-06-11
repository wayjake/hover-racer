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
    // base starts inside the dirt shoulder and below the surface so the
    // wall always overlaps the track — no cracks at any elevation
    const base = halfWidths[idx] + 0.8 + rand() * 1.5
    const height = 16 + rand() * 14
    const rows = [
      [base, Math.min(h - 4, -1)],
      [base + 3 + rand() * 3, h + height * 0.45],
      [base + 7 + rand() * 5, h + height],
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
    const shoulderY = Math.max(h - 6, -0.6) // dips below the desert plane
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
    // Jagged rocks hugging the canyon walls (none inside the finish citadel)
    for (let i = 0; i < COUNT - 24; i += 4) {
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

// Swallow-tailed banner with a horned sigil, drawn once to a canvas
function makeBannerTexture() {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 256
  const g = c.getContext('2d')

  g.beginPath()
  g.moveTo(8, 0)
  g.lineTo(120, 0)
  g.lineTo(120, 212)
  g.lineTo(64, 256)
  g.lineTo(8, 212)
  g.closePath()
  g.fillStyle = '#8a1414'
  g.fill()
  g.lineWidth = 8
  g.strokeStyle = '#4d0808'
  g.stroke()

  const cx = 64
  const cy = 102
  g.fillStyle = '#2b0404'
  g.beginPath()
  g.arc(cx, cy, 28, 0, Math.PI * 2)
  g.fill()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    g.beginPath()
    g.moveTo(cx + Math.cos(a - 0.14) * 26, cy + Math.sin(a - 0.14) * 26)
    g.lineTo(cx + Math.cos(a + 0.14) * 26, cy + Math.sin(a + 0.14) * 26)
    g.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44)
    g.closePath()
    g.fill()
  }
  g.fillStyle = '#ff4a30'
  for (const side of [-1, 1]) {
    g.save()
    g.translate(cx + side * 11, cy - 5)
    g.rotate(side * -0.35)
    g.fillRect(-7, -2, 14, 4)
    g.restore()
  }
  for (let i = -2; i <= 2; i++) {
    g.fillRect(cx + i * 6 - 1.5, cy + 11, 3, 9)
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

const STONE = '#43282b'
const STONE_DARK = '#371f23'
const EMBER = '#ff2a1c'

// Hooded sentinel statue holding a glowing blade, point-down at its inner hand
function Sentinel({ x, z, y = 0 }) {
  const side = Math.sign(x)
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 1, 0]}>
        <boxGeometry args={[9, 2, 9]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 9, 0]}>
        <coneGeometry args={[4.2, 14, 6]} />
        <meshStandardMaterial color="#41312f" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 16.5, 0]}>
        <coneGeometry args={[2.5, 5.5, 6]} />
        <meshStandardMaterial color="#37282a" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 15.7, 1.1]}>
        <sphereGeometry args={[1.05, 8, 6]} />
        <meshStandardMaterial color="#120c0c" roughness={1} />
      </mesh>
      {[-1, 1].map((e) => (
        <mesh key={e} position={[e * 0.42, 15.9, 2]}>
          <boxGeometry args={[0.3, 0.16, 0.1]} />
          <meshBasicMaterial color="#ff5a3c" />
        </mesh>
      ))}
      <group position={[-side * 4.6, 0, 1.8]}>
        <mesh position={[0, 11.3, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 1.8, 6]} />
          <meshStandardMaterial color="#1c1c20" roughness={0.5} />
        </mesh>
        <mesh position={[0, 5.6, 0]}>
          <boxGeometry args={[0.55, 9.8, 0.55]} />
          <meshBasicMaterial color={EMBER} />
        </mesh>
        <pointLight color="#ff3a24" intensity={90} distance={36} decay={2} position={[0, 6, 1.5]} />
      </group>
    </group>
  )
}

// Towering citadel silhouette behind the gate — fills the skyline on approach.
// Everything reaches down to local y=-25 so bases sit below the desert floor.
function Backdrop() {
  const spires = useMemo(() => {
    const rand = mulberry32(7)
    const list = []
    for (let x = -110; x <= 110; x += 22) {
      if (Math.abs(x) < 18) continue // keep the central keep clear
      list.push({
        x: x + (rand() - 0.5) * 10,
        z: -128 - rand() * 30,
        r: 10 + rand() * 9,
        h: 55 + rand() * 60,
      })
    }
    return list
  }, [])

  return (
    <group>
      {/* dusky red haze behind everything */}
      <mesh position={[0, 60, -175]}>
        <planeGeometry args={[440, 250]} />
        <meshBasicMaterial color="#6b1212" />
      </mesh>

      {/* jagged ridge of rear spires */}
      {spires.map((s, i) => (
        <group key={i}>
          <mesh position={[s.x, -25 + s.h / 2, s.z]}>
            <coneGeometry args={[s.r, s.h, 5]} />
            <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
          </mesh>
          <mesh position={[s.x, -25 + s.h + 1.5, s.z]}>
            <coneGeometry args={[1.2, 4, 4]} />
            <meshBasicMaterial color={EMBER} />
          </mesh>
        </group>
      ))}

      {/* curtain wall */}
      <mesh position={[0, 18, -98]}>
        <boxGeometry args={[150, 86, 10]} />
        <meshStandardMaterial color={STONE} roughness={1} flatShading />
      </mesh>

      {/* flanking towers */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 34, 27.5, -105]}>
            <boxGeometry args={[16, 105, 16]} />
            <meshStandardMaterial color={STONE} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * 34, 91, -105]}>
            <coneGeometry args={[11, 22, 4]} />
            <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * 34, 104, -105]}>
            <coneGeometry args={[1.3, 4, 4]} />
            <meshBasicMaterial color={EMBER} />
          </mesh>
          <mesh position={[s * 62, 19, -98]}>
            <boxGeometry args={[14, 88, 14]} />
            <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * 62, 73, -98]}>
            <coneGeometry args={[9.5, 20, 4]} />
            <meshStandardMaterial color={STONE} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * 62, 85, -98]}>
            <coneGeometry args={[1.1, 3.5, 4]} />
            <meshBasicMaterial color={EMBER} />
          </mesh>
        </group>
      ))}

      {/* central keep, rising far above the gate facade */}
      <mesh position={[0, 40, -112]}>
        <boxGeometry args={[44, 130, 18]} />
        <meshStandardMaterial color={STONE} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 118, -112]}>
        <boxGeometry args={[26, 34, 14]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 150, -112]}>
        <coneGeometry args={[9, 30, 4]} />
        <meshStandardMaterial color={STONE} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 167, -112]}>
        <coneGeometry args={[1.5, 5, 4]} />
        <meshBasicMaterial color={EMBER} />
      </mesh>
    </group>
  )
}

// Walled plaza past the finish line — the craft coasts to a halt inside it
function Courtyard({ banner }) {
  return (
    <group>
      {/* raised stone aprons beside the last stretch of track, then the plaza */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 27.5, -12.7, -13.5]}>
          <boxGeometry args={[34, 28, 25]} />
          <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
        </mesh>
      ))}
      <mesh position={[0, -12.7, -55.5]}>
        <boxGeometry args={[92, 28, 61]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
      </mesh>

      {/* glowing sigil ring where the craft comes to rest */}
      <mesh position={[0, 1.42, -42]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[7, 8.4, 24]} />
        <meshBasicMaterial color={EMBER} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 1.42, -42]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.4, 12]} />
        <meshBasicMaterial color={EMBER} />
      </mesh>

      {/* colonnade walls enclosing the courtyard */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * 42, 10.3, -44]}>
            <boxGeometry args={[6, 18, 84]} />
            <meshStandardMaterial color={STONE} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * 42, 20.4, -44]}>
            <boxGeometry args={[7, 2.5, 86]} />
            <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
          </mesh>
          {[-8, -20, -32, -44, -56, -68, -80].map((z) => (
            <mesh key={z} position={[s * 39, 8.8, z]}>
              <boxGeometry args={[3, 15, 3]} />
              <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
            </mesh>
          ))}
          {[-30, -64].map((z) => (
            <mesh key={z} position={[s * 38.4, 11, z]} rotation={[0, (s * Math.PI) / 2, 0]}>
              <planeGeometry args={[7, 14]} />
              <meshStandardMaterial
                map={banner}
                transparent
                alphaTest={0.5}
                roughness={1}
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      ))}

      {/* ember pylons lining the plaza */}
      {[-32, -46, -60, -74].map((z) =>
        [-1, 1].map((s) => (
          <group key={`${s}:${z}`} position={[s * 17, 0, z]}>
            <mesh position={[0, 5.3, 0]}>
              <boxGeometry args={[1.8, 8, 1.8]} />
              <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
            </mesh>
            <mesh position={[0, 10.4, 0]}>
              <coneGeometry args={[1, 2.4, 4]} />
              <meshBasicMaterial color={EMBER} />
            </mesh>
          </group>
        )),
      )}
      <pointLight color="#ff3020" intensity={120} distance={48} decay={2} position={[0, 9, -44]} />
      <pointLight color="#ff3020" intensity={120} distance={48} decay={2} position={[0, 9, -72]} />

      {/* back wall with banners, dais and obelisk closing the courtyard */}
      <mesh position={[0, 1, -90]}>
        <boxGeometry args={[96, 50, 8]} />
        <meshStandardMaterial color={STONE} roughness={1} flatShading />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 20, 16, -85.9]}>
          <planeGeometry args={[9, 18]} />
          <meshStandardMaterial
            map={banner}
            transparent
            alphaTest={0.5}
            roughness={1}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      <mesh position={[0, 2.3, -74]}>
        <boxGeometry args={[34, 2.4, 16]} />
        <meshStandardMaterial color={STONE} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 4.4, -77]}>
        <boxGeometry args={[26, 2.4, 12]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 21.6, -81]}>
        <boxGeometry args={[5, 32, 5]} />
        <meshStandardMaterial color={STONE} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 39.8, -81]}>
        <coneGeometry args={[1.7, 4.5, 4]} />
        <meshBasicMaterial color={EMBER} />
      </mesh>
      <pointLight color="#ff3020" intensity={100} distance={40} decay={2} position={[0, 10, -78]} />
      <Sentinel x={15} z={-70} y={1.3} />
      <Sentinel x={-15} z={-70} y={1.3} />
    </group>
  )
}

// Sith-stronghold finish: a dark fortress facade spanning the canyon, spires
// with ember tips, a sigil banner over the gate, and blade-bearing sentinels
function FinishGate() {
  const idx = COUNT - 12
  const p = samples[idx]
  const t = tangents[idx]
  const hw = halfWidths[idx]
  const heading = Math.atan2(-t.x, -t.z)
  const banner = useMemo(() => makeBannerTexture(), [])

  return (
    <group position={[p.x, heights[idx], p.z]} rotation={[0, heading, 0]}>
      {/* flanking walls with stepped parapets and corner towers */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[s * (hw + 13), 15, 0]}>
            <boxGeometry args={[24, 30, 7]} />
            <meshStandardMaterial color={STONE} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * (hw + 13), 34, 0]}>
            <boxGeometry args={[15, 8, 6]} />
            <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * (hw + 26), 22, 0]}>
            <boxGeometry args={[8, 44, 8]} />
            <meshStandardMaterial color={STONE} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * (hw + 26), 49, 0]}>
            <coneGeometry args={[5.2, 10, 4]} />
            <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * (hw + 26), 55.5, 0]}>
            <coneGeometry args={[0.9, 3, 4]} />
            <meshBasicMaterial color={EMBER} />
          </mesh>
          <mesh position={[s * 9, 39, 0]}>
            <coneGeometry args={[2.2, 9, 4]} />
            <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
          </mesh>
          {/* outer wing walls stretching toward the canyon sides */}
          <mesh position={[s * (hw + 42), -3, 0]}>
            <boxGeometry args={[24, 50, 6]} />
            <meshStandardMaterial color={STONE} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * (hw + 52), 10, 0]}>
            <boxGeometry args={[6, 64, 7]} />
            <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * (hw + 52), 45.5, 0]}>
            <coneGeometry args={[4, 7, 4]} />
            <meshStandardMaterial color={STONE} roughness={1} flatShading />
          </mesh>
          <mesh position={[s * (hw + 52), 50.5, 0]}>
            <coneGeometry args={[0.8, 2.5, 4]} />
            <meshBasicMaterial color={EMBER} />
          </mesh>
        </group>
      ))}

      {/* gatehouse over the opening, central keep and spire */}
      <mesh position={[0, 22, 0]}>
        <boxGeometry args={[hw * 2 + 8, 18, 7]} />
        <meshStandardMaterial color={STONE} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 36, 0]}>
        <boxGeometry args={[14, 12, 6]} />
        <meshStandardMaterial color={STONE_DARK} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 49, 0]}>
        <coneGeometry args={[4.4, 14, 4]} />
        <meshStandardMaterial color={STONE} roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 57.5, 0]}>
        <coneGeometry args={[1, 3.5, 4]} />
        <meshBasicMaterial color={EMBER} />
      </mesh>

      {/* glowing lintel strip — the finish line proper, plus its ground echo */}
      <mesh position={[0, 13.3, 3.6]}>
        <boxGeometry args={[hw * 2 + 8, 0.6, 0.4]} />
        <meshBasicMaterial color={EMBER} />
      </mesh>
      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[hw * 2, 1.6]} />
        <meshBasicMaterial color={EMBER} />
      </mesh>
      <pointLight color="#ff3020" intensity={110} distance={42} decay={2} position={[0, 8, 0]} />

      {/* sigil banner hanging over the gate */}
      <mesh position={[0, 24.5, 3.8]}>
        <planeGeometry args={[11, 22]} />
        <meshStandardMaterial
          map={banner}
          transparent
          alphaTest={0.5}
          roughness={1}
          side={THREE.DoubleSide}
        />
      </mesh>

      <Sentinel x={hw + 10} z={8} />
      <Sentinel x={-(hw + 10)} z={8} />

      <Courtyard banner={banner} />
      <Backdrop />
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
