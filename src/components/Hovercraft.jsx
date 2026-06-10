import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gameState } from '../game/state.js'

const glowColor = new THREE.Color()

// Twin forward engines linked by an energy binder, cockpit pod trailing
// behind — podracer-inspired, craft faces -z.
export default function Hovercraft() {
  const leftGlow = useRef()
  const rightGlow = useRef()
  const binder = useRef()

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    const flicker = 0.85 + Math.sin(t * 37) * 0.1 + Math.sin(t * 53) * 0.05
    // exhaust swells and shifts blue-white while boosting
    const boosting = gameState.boosting
    glowColor.set(boosting ? '#bfe6ff' : '#ffae5e')
    const k = 1 - Math.exp(-dt * 8)
    for (const ref of [leftGlow, rightGlow]) {
      const mesh = ref.current
      mesh.material.opacity = flicker
      mesh.material.color.lerp(glowColor, k)
      const s = THREE.MathUtils.lerp(mesh.scale.x, boosting ? 1.8 : 1, k)
      mesh.scale.setScalar(s)
    }
    binder.current.material.opacity = 0.55 + Math.sin(t * 21) * 0.2 + (boosting ? 0.25 : 0)
  })

  return (
    <group>
      {/* engines */}
      {[-1.7, 1.7].map((x) => (
        <group key={x} position={[x, 0, -1.8]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.45, 0.52, 2.8, 12]} />
            <meshStandardMaterial color="#8d7a5e" metalness={0.5} roughness={0.45} />
          </mesh>
          {/* intake cone */}
          <mesh position={[0, 0, -1.7]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.45, 0.7, 12]} />
            <meshStandardMaterial color="#6e5d44" metalness={0.5} roughness={0.5} />
          </mesh>
          {/* fins */}
          <mesh position={[0, 0.55, 0.4]}>
            <boxGeometry args={[0.08, 0.6, 1.4]} />
            <meshStandardMaterial color="#7a6347" roughness={0.7} />
          </mesh>
          {/* exhaust glow */}
          <mesh
            ref={x < 0 ? leftGlow : rightGlow}
            position={[0, 0, 1.45]}
          >
            <circleGeometry args={[0.4, 16]} />
            <meshBasicMaterial color="#ffae5e" transparent />
          </mesh>
        </group>
      ))}

      {/* energy binder between the engines */}
      <mesh ref={binder} position={[0, 0.1, -2.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.05, 0.05, 3.4, 6]} />
        <meshBasicMaterial color="#c77dff" transparent />
      </mesh>

      {/* cables from pod to engines */}
      <mesh position={[-1.05, 0, 0.3]} rotation={[0, 0.62, 0]}>
        <boxGeometry args={[0.07, 0.07, 2.3]} />
        <meshStandardMaterial color="#3d342a" />
      </mesh>
      <mesh position={[1.05, 0, 0.3]} rotation={[0, -0.62, 0]}>
        <boxGeometry args={[0.07, 0.07, 2.3]} />
        <meshStandardMaterial color="#3d342a" />
      </mesh>

      {/* cockpit pod */}
      <group position={[0, 0.05, 1.8]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <capsuleGeometry args={[0.55, 1.1, 6, 12]} />
          <meshStandardMaterial color="#a3754a" metalness={0.35} roughness={0.55} />
        </mesh>
        <mesh position={[0, 0.42, -0.25]} scale={[0.42, 0.3, 0.6]}>
          <sphereGeometry args={[1, 12, 10]} />
          <meshStandardMaterial color="#2b2418" roughness={0.2} metalness={0.6} />
        </mesh>
        {/* tail fin */}
        <mesh position={[0, 0.45, 0.8]}>
          <boxGeometry args={[0.07, 0.7, 0.8]} />
          <meshStandardMaterial color="#7a6347" roughness={0.7} />
        </mesh>
      </group>

      {/* repulsor underglow */}
      <mesh position={[0, -0.55, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.9, 20]} />
        <meshBasicMaterial color="#7fd4ff" transparent opacity={0.18} />
      </mesh>
    </group>
  )
}
