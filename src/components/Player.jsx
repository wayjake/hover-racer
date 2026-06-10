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
  heights,
  slopes,
  halfWidths,
} from '../game/track.js'
import { gameState, resetGameState } from '../game/state.js'
import { initAudio, setEngine, toggleMute, nextTrack } from '../game/audio.js'
import Hovercraft from './Hovercraft.jsx'

const MAX_SPEED = 78
const BOOST_MAX_SPEED = 118
const BOOST_DRAIN_TIME = 1.8 // seconds of boost from a full meter
const BOOST_RECHARGE_TIME = 6
const START_IDX = 5
const FINISH_IDX = COUNT - 12
const GRAVITY = 30
const HOVER_HEIGHT = 1.15
const SLOPE_ACCEL = 26 // how hard grades pull on your speed

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
    boostMeter: 1,
    boosting: false,
    y: HOVER_HEIGHT,
    vy: 0,
    airborne: false,
  })

  useEffect(() => {
    const down = (e) => {
      initAudio() // browsers require a user gesture to start audio
      keys[e.code] = true
      if (e.code.startsWith('Arrow')) e.preventDefault()
      if (e.code === 'KeyM') toggleMute()
      if (e.code === 'KeyN') nextTrack()
    }
    const up = (e) => {
      keys[e.code] = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerdown', initAudio)
    reset(sim.current)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointerdown', initAudio)
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

    // boost: Shift fires it while the meter lasts, then it recharges
    const wantBoost = keys.ShiftLeft || keys.ShiftRight
    if (s.boosting) {
      if (!wantBoost || s.boostMeter <= 0 || gameState.finished) s.boosting = false
    } else if (wantBoost && s.boostMeter > 0.25 && !gameState.finished) {
      s.boosting = true // needs a quarter charge to fire, prevents stuttering
    }

    // throttle, boost, brake, drag — jets lose bite while airborne
    if (!gameState.finished) s.speed += throttle * 40 * (s.airborne ? 0.4 : 1) * dt
    if (s.boosting) {
      s.boostMeter = Math.max(0, s.boostMeter - dt / BOOST_DRAIN_TIME)
      s.speed += 55 * dt
    } else {
      s.boostMeter = Math.min(1, s.boostMeter + dt / BOOST_RECHARGE_TIME)
    }
    s.speed -= brake * 45 * dt
    s.speed -= s.speed * (gameState.finished ? 1.4 : 0.32) * dt

    // gravity pulls along the grade — downhill builds speed, uphill bleeds it
    const slope = THREE.MathUtils.clamp(slopes[s.idx], -0.7, 0.7)
    if (!s.airborne && !gameState.finished) s.speed -= slope * SLOPE_ACCEL * dt

    // over the cap (boost ended / steep descent), bleed speed off gradually;
    // downhill grades raise the cap so descents stay fast and fluid
    const downhillBonus = !s.airborne ? Math.max(0, -slope) * 30 : 0
    const maxNow = (s.boosting ? BOOST_MAX_SPEED : MAX_SPEED) + downhillBonus
    if (s.speed > maxNow) s.speed = Math.max(maxNow, s.speed - 30 * dt)
    s.speed = THREE.MathUtils.clamp(s.speed, 0, BOOST_MAX_SPEED + 25)

    // steering scales with speed so you can't pivot in place; airborne craft
    // only get a fraction of their grip
    const speedFactor = Math.min(s.speed / MAX_SPEED, 1)
    if (s.speed > 0.5) {
      const grip = s.airborne ? 0.35 : 1
      s.heading += steer * 2.0 * grip * (0.35 + 0.65 * speedFactor) * dt
    }

    forward.set(-Math.sin(s.heading), 0, -Math.cos(s.heading))
    s.pos.addScaledVector(forward, s.speed * dt)

    // keep the craft inside the canyon (width varies — watch the squeezes)
    s.idx = nearestIndex(s.pos, s.idx)
    const sp = samples[s.idx]
    const n = normals[s.idx]
    const hw = halfWidths[s.idx]
    const lateral = (s.pos.x - sp.x) * n.x + (s.pos.z - sp.z) * n.z
    if (Math.abs(lateral) > hw) {
      const lim = Math.sign(lateral) * hw
      s.pos.x = sp.x + n.x * lim
      s.pos.z = sp.z + n.z * lim
      s.speed *= Math.max(0, 1 - 3.5 * dt) // scraping the wall bleeds speed
    }

    // vertical: hover-follow the ground until it falls away, then ballistic
    const bob = Math.sin(three.clock.elapsedTime * 7) * 0.08 +
      Math.sin(three.clock.elapsedTime * 13) * 0.04
    const rideY = heights[s.idx] + HOVER_HEIGHT + bob
    if (s.airborne) {
      s.vy -= GRAVITY * dt
      s.y += s.vy * dt
      if (s.y <= rideY) {
        s.y = rideY
        s.airborne = false
      }
    } else if (rideY < s.y - 0.8) {
      s.airborne = true // ledge — the ground dropped out from under us
      s.vy -= GRAVITY * dt
      s.y += s.vy * dt
    } else {
      const prevY = s.y
      s.y = rideY
      s.vy = dt > 0 ? (s.y - prevY) / dt : 0
    }

    if (!gameState.finished && s.idx >= FINISH_IDX) {
      gameState.finished = true
      gameState.finishTime = performance.now() - gameState.startTime
    }

    gameState.speed = s.speed
    gameState.progress = s.idx / FINISH_IDX
    gameState.boost = s.boostMeter
    gameState.boosting = s.boosting

    setEngine(s.speed / BOOST_MAX_SPEED, s.boosting)

    // craft pose
    group.current.position.set(s.pos.x, s.y, s.pos.z)
    group.current.rotation.y = s.heading

    const targetBank = steer * 0.38 * (0.3 + 0.7 * speedFactor)
    s.bank = THREE.MathUtils.lerp(s.bank, targetBank, 1 - Math.exp(-dt * 6))
    craft.current.rotation.z = s.bank
    // pitch with the grade on the ground, with vertical velocity in the air
    const targetPitch = s.airborne
      ? THREE.MathUtils.clamp(s.vy * 0.02, -0.35, 0.3)
      : Math.atan(slope) * 0.85 - throttle * 0.06 + brake * 0.05
    craft.current.rotation.x = THREE.MathUtils.lerp(
      craft.current.rotation.x,
      targetPitch,
      1 - Math.exp(-dt * 4),
    )

    // chase camera, pulls back and widens with speed (extra kick on boost)
    const camFactor = s.speed / BOOST_MAX_SPEED
    const cam = three.camera
    desiredCam
      .copy(s.pos)
      .addScaledVector(forward, -(10 + 5 * camFactor))
      .setY(s.y + 4.2)
    cam.position.lerp(desiredCam, 1 - Math.exp(-dt * 5))
    lookTarget.copy(s.pos).addScaledVector(forward, 8).setY(s.y + 1.5)
    cam.lookAt(lookTarget)
    cam.fov = 68 + camFactor * 18
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
  s.boostMeter = 1
  s.boosting = false
  s.y = heights[START_IDX] + HOVER_HEIGHT
  s.vy = 0
  s.airborne = false
  resetGameState()
}
