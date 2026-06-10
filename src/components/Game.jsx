import { useEffect, useReducer } from 'react'
import { Canvas } from '@react-three/fiber'
import Canyon from './Canyon.jsx'
import Player from './Player.jsx'
import Debris from './Debris.jsx'
import { gameState } from '../game/state.js'
import { audioState } from '../game/audio.js'
import './Game.css'

function formatTime(ms) {
  const total = ms / 1000
  const m = Math.floor(total / 60)
  const s = (total % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function Hud() {
  const [, tick] = useReducer((c) => c + 1, 0)
  useEffect(() => {
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [])

  const elapsed = gameState.finished
    ? gameState.finishTime
    : performance.now() - gameState.startTime

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-time">{formatTime(elapsed)}</div>
        <div className="hud-progress">
          {Math.min(100, Math.round(gameState.progress * 100))}%
        </div>
      </div>
      <div className="hud-speed">
        {Math.round(gameState.speed * 4)}
        <span> km/h</span>
      </div>
      <div className="hud-boost" data-boosting={gameState.boosting || undefined}>
        <div
          className="hud-boost-fill"
          style={{ width: `${Math.round(gameState.boost * 100)}%` }}
        />
      </div>
      <div className="hud-health">
        {[
          ['left', 'L ENG'],
          ['pod', 'POD'],
          ['right', 'R ENG'],
        ].map(([part, label]) => (
          <div className="hud-health-part" key={part}>
            <div className="hud-health-bar">
              <div
                className="hud-health-fill"
                data-low={gameState.health[part] < 0.35 || undefined}
                style={{ width: `${Math.round(gameState.health[part] * 100)}%` }}
              />
            </div>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {gameState.crashed && (
        <div className="hud-crash">
          {gameState.crashPart === 'pod'
            ? 'POD DESTROYED'
            : `${gameState.crashPart === 'left' ? 'LEFT' : 'RIGHT'} ENGINE DESTROYED`}
        </div>
      )}
      <div className="hud-music">
        ♪ {audioState.ready
          ? audioState.muted
            ? 'muted'
            : audioState.trackName
          : 'press any key for sound'}
      </div>
      <div className="hud-help">
        W / ↑ throttle · A D / ← → steer · Shift boost · R restart · M mute · N next track
      </div>
      {gameState.finished && (
        <div className="hud-finish">
          <div className="hud-finish-title">FINISH</div>
          <div className="hud-finish-time">{formatTime(gameState.finishTime)}</div>
          <div className="hud-finish-hint">press R to race again</div>
        </div>
      )}
    </div>
  )
}

export default function Game() {
  return (
    <div className="game">
      <Canvas
        dpr={[1, 1.5]}
        camera={{ fov: 70, near: 0.1, far: 700, position: [0, 5, 12] }}
      >
        <color attach="background" args={['#e6c08c']} />
        <fog attach="fog" args={['#dcb27e', 60, 440]} />
        <ambientLight intensity={0.65} color="#ffe8c8" />
        <directionalLight position={[60, 90, 30]} intensity={1.4} color="#fff2dd" />
        <Canyon />
        <Player />
        <Debris />
      </Canvas>
      <Hud />
    </div>
  )
}
