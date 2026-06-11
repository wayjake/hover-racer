import { useEffect, useReducer, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import Canyon from './Canyon.jsx'
import Player from './Player.jsx'
import Debris from './Debris.jsx'
import TouchControls, { useIsTouch } from './TouchControls.jsx'
import { gameState, pauseGame, resumeGame } from '../game/state.js'
import { touchInput } from '../game/touch.js'
import { SCHEMES, controlState, setScheme } from '../game/controls.js'
import { requestMouseLock, releaseMouseLock } from '../game/pointerlock.js'
import { audioState, toggleMute } from '../game/audio.js'
import { fetchTopScores, submitScore, qualifiesForBoard } from '../game/scores.js'
import './Game.css'

function formatTime(ms) {
  const total = ms / 1000
  const m = Math.floor(total / 60)
  const s = (total % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}

function PauseMenu({ onAction }) {
  const [scheme, setSchemeState] = useState(controlState.scheme)

  return (
    <div className="hud-pause">
      <div className="hud-pause-panel">
        <div className="hud-pause-title">PAUSED</div>
        <div className="hud-pause-label">CONTROLS</div>
        <div className="hud-pause-schemes">
          {SCHEMES.map((s) => (
            <button
              key={s.id}
              type="button"
              data-active={scheme === s.id || undefined}
              onClick={() => {
                setScheme(s.id)
                setSchemeState(s.id)
              }}
            >
              <b>{s.name}</b>
              <span>{s.blurb}</span>
            </button>
          ))}
        </div>
        <div className="hud-pause-actions">
          <button
            type="button"
            onClick={() => {
              resumeGame()
              if (controlState.scheme === 'mouse') requestMouseLock()
              onAction()
            }}
          >
            RESUME
          </button>
          <button
            type="button"
            onClick={() => {
              touchInput.restart = true
              resumeGame()
              if (controlState.scheme === 'mouse') requestMouseLock()
              onAction()
            }}
          >
            RESTART
          </button>
        </div>
      </div>
    </div>
  )
}

function FinishBoard() {
  const timeMs = Math.round(gameState.finishTime)
  const [board, setBoard] = useState(null) // null while loading
  const [offline, setOffline] = useState(false)
  const [initials, setInitials] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedAs, setSavedAs] = useState(null)

  useEffect(() => {
    fetchTopScores().then(setBoard).catch(() => setOffline(true))
  }, [])

  const qualifies = board != null && !savedAs && qualifiesForBoard(board, timeMs)
  const youIdx =
    board != null && savedAs
      ? board.findIndex((r) => r.initials === savedAs && r.timeMs === timeMs)
      : -1

  // free the cursor so a mouse-scheme player can click the initials form
  useEffect(() => {
    if (qualifies) releaseMouseLock()
  }, [qualifies])

  const save = async (e) => {
    e.preventDefault()
    if (!initials || saving) return
    setSaving(true)
    try {
      setBoard(await submitScore(initials, timeMs))
      setSavedAs(initials)
    } catch {
      setOffline(true)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="hud-board" onPointerDown={(e) => e.stopPropagation()}>
      <div className="hud-board-title">TOP 10</div>
      {board == null ? (
        <div className="hud-board-note">
          {offline ? 'scoreboard offline' : 'loading…'}
        </div>
      ) : (
        <>
          {board.length === 0 ? (
            <div className="hud-board-note">no times yet — be the first</div>
          ) : (
            <ol className="hud-board-list">
              {board.map((row, i) => (
                <li key={i} data-you={i === youIdx || undefined}>
                  <span className="hud-board-rank">{i + 1}</span>
                  <span className="hud-board-initials">{row.initials}</span>
                  <span className="hud-board-time">{formatTime(row.timeMs)}</span>
                </li>
              ))}
            </ol>
          )}
          {qualifies &&
            (offline ? (
              <div className="hud-board-note">couldn't save your score</div>
            ) : (
              <form className="hud-board-entry" onSubmit={save}>
                <div className="hud-board-note">
                  you made the top ten — enter your initials
                </div>
                <div className="hud-board-entry-row">
                  <input
                    value={initials}
                    onChange={(e) =>
                      setInitials(
                        e.target.value
                          .toUpperCase()
                          .replace(/[^A-Z]/g, '')
                          .slice(0, 3),
                      )
                    }
                    // keep R/M/N/Esc typed here from restarting or muting the game
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder="AAA"
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="submit" disabled={!initials || saving}>
                    {saving ? 'SAVING…' : 'SAVE'}
                  </button>
                </div>
              </form>
            ))}
        </>
      )}
    </div>
  )
}

function Hud({ isTouch }) {
  const [, tick] = useReducer((c) => c + 1, 0)
  useEffect(() => {
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (gameState.paused) {
          resumeGame()
          if (controlState.scheme === 'mouse') requestMouseLock()
        } else {
          pauseGame()
          releaseMouseLock()
        }
        tick()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const elapsed = gameState.finished
    ? gameState.finishTime
    : gameState.paused
      ? gameState.pausedAt - gameState.startTime
      : performance.now() - gameState.startTime

  const scheme = SCHEMES.find((s) => s.id === controlState.scheme) || SCHEMES[0]

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
        {/* one cell per charge; the firing burst drains its cell */}
        {[0, 1, 2].map((i) => (
          <div className="hud-boost-cell" key={i}>
            <div
              className="hud-boost-fill"
              style={{
                width: `${Math.round(
                  (i < gameState.boostCharges
                    ? 1
                    : i === gameState.boostCharges && gameState.boosting
                      ? gameState.boost
                      : 0) * 100,
                )}%`,
              }}
            />
          </div>
        ))}
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
      <div className="hud-music" onClick={toggleMute}>
        ♪ {audioState.ready
          ? audioState.muted
            ? 'muted'
            : audioState.trackName
          : isTouch
            ? 'tap for sound'
            : 'press any key for sound'}
      </div>
      {!isTouch && (
        <div className="hud-help">
          {scheme.blurb} · R restart · Esc pause · M mute · N next track
        </div>
      )}
      {!isTouch &&
        scheme.id === 'mouse' &&
        !gameState.paused &&
        !document.pointerLockElement && (
          <div className="hud-locknote">click to capture mouse</div>
        )}
      {gameState.finished && (
        <div
          className="hud-finish"
          onPointerDown={isTouch ? () => (touchInput.restart = true) : undefined}
        >
          <div className="hud-finish-title">FINISH</div>
          <div className="hud-finish-time">{formatTime(gameState.finishTime)}</div>
          <FinishBoard />
          <div className="hud-finish-hint">
            {isTouch ? 'tap to race again' : 'press R to race again'}
          </div>
        </div>
      )}
      {gameState.paused && <PauseMenu onAction={tick} />}
    </div>
  )
}

export default function Game() {
  const isTouch = useIsTouch()

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
      {isTouch && <TouchControls />}
      <Hud isTouch={isTouch} />
    </div>
  )
}
