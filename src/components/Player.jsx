import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import {
  samples,
  tangents,
  normals,
  nearestIndex,
  COUNT,
  HALF_WIDTH,
} from '../game/track.js'
import { gameState, resetGameState } from '../game/state.js'
import Hovercraft from './Hovercraft.jsx'

const MAX_SPEED = 62
const START_IDX = 5
const FINISH_IDX = COUNT - 12

const keys = {}

// scratch vectors, reused every frame
const forward = new THREE.Vector3()
const desiredCam = new THREE.Vector3()
const lookTarget = new THREE.Vector3()

export default function Player() {
  const group = useRef()
  const craft = useRef()
  const sim = useRef({
    pos: new THREE.Vector3(),
    heading: 0,
    speed: 0,
    idx: START_IDX,
    bank: 0,
  })

  useEffect(() => {
    const down = (e) => {
      keys[e.code] = true
      if (e.code.startsWith('Arrow')) e.preventDefault()
    }
    const up = (e) => {
      keys[e.code] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    reset(sim.current)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  useFrame((three, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = sim.current

    if (keys.KeyR) reset(s)

    const throttle = keys.KeyW || keys.ArrowUp ? 1 : 0
    const brake = keys.KeyS || keys.ArrowDown ? 1 : 0
    const steer =
      (keys.KeyA || keys.ArrowLeft ? 1 : 0) -
      (keys.KeyD || keys.ArrowRight ? 1 : 0)

    // throttle, brake, drag
    if (!gameState.finished) s.speed += throttle * 32 * dt
    s.speed -= brake * 45 * dt
    s.speed -= s.speed * (gameState.finished ? 1.4 : 0.32) * dt
    s.speed = THREE.MathUtils.clamp(s.speed, 0, MAX_SPEED)

    // steering scales with speed so you can't pivot in place
    const speedFactor = s.speed / MAX_SPEED
    if (s.speed > 0.5) {
      s.heading += steer * 1.7 * (0.35 + 0.65 * speedFactor) * dt
    }

    forward.set(-Math.sin(s.heading), 0, -Math.cos(s.heading))
    s.pos.addScaledVector(forward, s.speed * dt)

    // keep the craft inside the canyon
    s.idx = nearestIndex(s.pos, s.idx)
    const sp = samples[s.idx]
    const n = normals[s.idx]
    const lateral = (s.pos.x - sp.x) * n.x + (s.pos.z - sp.z) * n.z
    if (Math.abs(lateral) > HALF_WIDTH) {
      const lim = Math.sign(lateral) * HALF_WIDTH
      s.pos.x = sp.x + n.x * lim
      s.pos.z = sp.z + n.z * lim
      s.speed *= Math.max(0, 1 - 3.5 * dt) // scraping the wall bleeds speed
    }

    if (!gameState.finished && s.idx >= FINISH_IDX) {
      gameState.finished = true
      gameState.finishTime = performance.now() - gameState.startTime
    }

    gameState.speed = s.speed
    gameState.progress = s.idx / FINISH_IDX

    // hover bob + craft pose
    const t = three.clock.elapsedTime
    const hoverY = 1.15 + Math.sin(t * 7) * 0.08 + Math.sin(t * 13) * 0.04
    group.current.position.set(s.pos.x, hoverY, s.pos.z)
    group.current.rotation.y = s.heading

    const targetBank = steer * 0.38 * (0.3 + 0.7 * speedFactor)
    s.bank = THREE.MathUtils.lerp(s.bank, targetBank, 1 - Math.exp(-dt * 6))
    craft.current.rotation.z = s.bank
    craft.current.rotation.x = THREE.MathUtils.lerp(
      craft.current.rotation.x,
      -throttle * 0.06 + brake * 0.05,
      1 - Math.exp(-dt * 4),
    )

    // chase camera, pulls back and widens with speed
    const cam = three.camera
    desiredCam
      .copy(s.pos)
      .addScaledVector(forward, -(10 + 4 * speedFactor))
      .setY(hoverY + 4.2)
    cam.position.lerp(desiredCam, 1 - Math.exp(-dt * 5))
    lookTarget.copy(s.pos).addScaledVector(forward, 8).setY(hoverY + 1.5)
    cam.lookAt(lookTarget)
    cam.fov = 68 + speedFactor * 14
    cam.updateProjectionMatrix()
  })

  return (
    <group ref={group}>
      <group ref={craft}>
        <Hovercraft />
      </group>
      {/* dust kicked up around the craft */}
      <Sparkles
        count={70}
        scale={[7, 2.5, 12]}
        position={[0, -0.4, 3]}
        size={7}
        speed={1.2}
        opacity={0.3}
        color="#dcb27e"
      />
    </group>
  )
}

function reset(s) {
  s.pos.copy(samples[START_IDX])
  s.pos.y = 0
  const t = tangents[START_IDX]
  s.heading = Math.atan2(-t.x, -t.z)
  s.speed = 0
  s.idx = START_IDX
  s.bank = 0
  resetGameState()
}
