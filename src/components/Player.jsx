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
import {
  initAudio,
  setEngine,
  toggleMute,
  nextTrack,
  playScrape,
  playExplosion,
} from '../game/audio.js'
import { emitDebris } from './Debris.jsx'
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
const hitPoint = new THREE.Vector3()
const hitDir = new THREE.Vector3()
const partPoint = new THREE.Vector3()

// local offsets of the damageable parts (craft faces -z)
const PART_OFFSETS = {
  left: [-1.7, 0, -1.8],
  right: [1.7, 0, -1.8],
  pod: [0, 0.05, 1.8],
}

// world position of a ship part, given craft position and heading
function partWorld(s, part, out) {
  const [lx, ly, lz] = PART_OFFSETS[part]
  const cos = Math.cos(s.heading)
  const sin = Math.sin(s.heading)
  return out.set(
    s.pos.x + lx * cos + lz * sin,
    s.y + ly,
    s.pos.z - lx * sin + lz * cos,
  )
}

function updateCamera(three, s, dt) {
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
}

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
    crashT: 0,
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

    if (keys.KeyR) {
      reset(s)
      craft.current.rotation.set(0, 0, 0)
    }

    // ----- crash sequence: tumble, burn, bounce, then auto-reset -----
    if (gameState.crashed) {
      s.crashT += dt
      s.speed = Math.max(0, s.speed - 40 * dt)
      forward.set(-Math.sin(s.heading), 0, -Math.cos(s.heading))
      s.pos.addScaledVector(forward, s.speed * dt)
      s.idx = nearestIndex(s.pos, s.idx)
      const csp = samples[s.idx]
      const cn = normals[s.idx]
      const chw = halfWidths[s.idx]
      const clat = (s.pos.x - csp.x) * cn.x + (s.pos.z - csp.z) * cn.z
      if (Math.abs(clat) > chw) {
        const lim = Math.sign(clat) * chw
        s.pos.x = csp.x + cn.x * lim
        s.pos.z = csp.z + cn.z * lim
      }

      // wreck falls under gravity and skips off the ground
      s.vy -= GRAVITY * dt
      s.y += s.vy * dt
      const floorY = heights[s.idx] + 0.55
      if (s.y < floorY) {
        s.y = floorY
        if (s.vy < -4) {
          hitDir.set(0, 1, 0)
          emitDebris(s.pos, hitDir, 6, 6, 'rock')
        }
        s.vy = -s.vy * 0.35
        s.speed *= 0.8
      }

      // each part dies its own way: engines cartwheel the craft toward
      // their side, a dead pod sends it end over end
      const spin = Math.exp(-s.crashT * 0.6)
      if (gameState.crashPart === 'left') {
        s.heading += 2.6 * spin * dt
        craft.current.rotation.z += 5.5 * spin * dt
        craft.current.rotation.x -= 1.1 * spin * dt
      } else if (gameState.crashPart === 'right') {
        s.heading -= 2.6 * spin * dt
        craft.current.rotation.z -= 5.5 * spin * dt
        craft.current.rotation.x -= 1.1 * spin * dt
      } else {
        craft.current.rotation.x -= 7.5 * spin * dt
        craft.current.rotation.z += Math.sin(s.crashT * 9) * 1.4 * spin * dt
      }

      // burning trail from the destroyed part
      if (Math.random() < 0.65) {
        partWorld(s, gameState.crashPart, partPoint)
        hitDir.set(0, 1, 0)
        emitDebris(partPoint, hitDir, 2, 4.5, 'fire')
      }

      group.current.position.set(s.pos.x, s.y, s.pos.z)
      group.current.rotation.y = s.heading
      gameState.speed = s.speed
      setEngine((s.speed / BOOST_MAX_SPEED) * Math.max(0, 1 - s.crashT / 2), false)
      updateCamera(three, s, dt)
      if (s.crashT > 2.6) {
        reset(s)
        craft.current.rotation.set(0, 0, 0)
      }
      return
    }

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
      const side = Math.sign(lateral)
      const lim = side * hw
      s.pos.x = sp.x + n.x * lim
      s.pos.z = sp.z + n.z * lim

      // how squarely we're driving into the wall: 0 = parallel scrape,
      // 1 = head-on. Slowdown and damage both scale with it.
      const align = Math.abs(forward.x * n.x + forward.z * n.z)
      s.speed *= Math.max(0, 1 - (0.6 + 6 * align) * dt)
      const intensity = Math.min(1, (s.speed / MAX_SPEED) * (0.25 + align * 1.5))

      // chips fly off the wall, away from it and along our travel — but
      // only when we're actually grinding, not resting against it
      if (s.speed > 3) {
        hitPoint.set(sp.x + n.x * lim * 1.1, s.y + 0.4, sp.z + n.z * lim * 1.1)
        hitDir.set(-n.x * side + forward.x, 0.7, -n.z * side + forward.z)
        emitDebris(hitPoint, hitDir, 1 + Math.round(intensity * 4), 4 + intensity * 9, 'rock')
        playScrape(intensity)
      }

      // grind the part on the wall side; square hits also hurt the pod
      const part = side > 0 ? 'left' : 'right'
      const health = gameState.health
      health[part] = Math.max(0, health[part] - (0.05 + align * 1.7) * (s.speed / MAX_SPEED) * dt)
      if (align > 0.5) {
        health.pod = Math.max(0, health.pod - align * (s.speed / MAX_SPEED) * dt)
      }
      const dead =
        health[part] === 0 ? part : health.pod === 0 ? 'pod' : null
      if (dead && !gameState.finished) {
        gameState.crashed = true
        gameState.crashPart = dead
        s.crashT = 0
        s.vy = Math.max(s.vy, 6.5)
        playExplosion()
        partWorld(s, dead, partPoint)
        hitDir.set(0, 1, 0)
        emitDebris(partPoint, hitDir, 40, 14, 'fire')
        emitDebris(partPoint, hitDir, 14, 9, 'rock')
      }
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

    updateCamera(three, s, dt)
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
