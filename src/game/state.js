// Mutable game state shared between the 3D loop and the HUD.
// The HUD polls this on an interval instead of re-rendering every frame.
export const gameState = {
  speed: 0,
  progress: 0,
  boost: 0, // 0..1 remaining fraction of the burst that's firing
  boostCharges: 3,
  boosting: false,
  startTime: performance.now(),
  finished: false,
  finishTime: 0,
  // per-part hull integrity, 0..1; a part at 0 explodes and ends the run
  health: { left: 1, right: 1, pod: 1 },
  crashed: false,
  crashPart: null, // 'left' | 'right' | 'pod'
  paused: false,
  pausedAt: 0,
}

export function pauseGame() {
  if (gameState.paused || gameState.finished) return
  gameState.paused = true
  gameState.pausedAt = performance.now()
}

export function resumeGame() {
  if (!gameState.paused) return
  gameState.paused = false
  // don't let time spent in the menu count against the run
  gameState.startTime += performance.now() - gameState.pausedAt
}

export function resetGameState() {
  gameState.speed = 0
  gameState.progress = 0
  gameState.boost = 0
  gameState.boostCharges = 3
  gameState.boosting = false
  gameState.startTime = performance.now()
  gameState.finished = false
  gameState.finishTime = 0
  gameState.health.left = 1
  gameState.health.right = 1
  gameState.health.pod = 1
  gameState.crashed = false
  gameState.crashPart = null
  gameState.paused = false
}
