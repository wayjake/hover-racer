import { useEffect, useState } from 'react'
import { touchInput } from '../game/touch.js'
import { pauseGame } from '../game/state.js'

// true on phones/tablets (coarse pointer), tracks changes live
export function useIsTouch() {
  const [touch, setTouch] = useState(
    () => window.matchMedia('(pointer: coarse)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)')
    const onChange = (e) => setTouch(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return touch
}

function HoldButton({ name, className, children }) {
  const press = (e) => {
    e.preventDefault()
    // capture so sliding a finger off the button doesn't drop the input
    e.currentTarget.setPointerCapture(e.pointerId)
    touchInput[name] = true
  }
  const release = () => {
    touchInput[name] = false
  }
  return (
    <button
      type="button"
      className={`touch-btn ${className || ''}`}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  )
}

export default function TouchControls() {
  // clear any held inputs if the layer unmounts mid-press
  useEffect(
    () => () => {
      touchInput.throttle = false
      touchInput.brake = false
      touchInput.left = false
      touchInput.right = false
      touchInput.boost = false
    },
    [],
  )

  return (
    <div className="touch-controls">
      <div className="touch-steer">
        <HoldButton name="left">◀</HoldButton>
        <HoldButton name="right">▶</HoldButton>
      </div>
      <div className="touch-drive">
        <HoldButton name="boost" className="touch-boost">
          BOOST
        </HoldButton>
        <div className="touch-drive-row">
          <HoldButton name="brake" className="touch-brake">
            ▼
          </HoldButton>
          <HoldButton name="throttle" className="touch-gas">
            ▲
          </HoldButton>
        </div>
      </div>
      <div className="touch-top">
        <button
          type="button"
          className="touch-btn touch-small"
          onPointerDown={(e) => {
            e.preventDefault()
            pauseGame()
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          ❚❚
        </button>
        <button
          type="button"
          className="touch-btn touch-small"
          onPointerDown={(e) => {
            e.preventDefault()
            touchInput.restart = true
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          ⟳
        </button>
      </div>
    </div>
  )
}
