// Mutable game state shared between the 3D loop and the HUD.
// The HUD polls this on an interval instead of re-rendering every frame.
export const gameState = {
  speed: 0,
  progress: 0,
  boost: 1,
  boosting: false,
  startTime: performance.now(),
  finished: false,
  finishTime: 0,
}

export function resetGameState() {
  gameState.speed = 0
  gameState.progress = 0
  gameState.boost = 1
  gameState.boosting = false
  gameState.startTime = performance.now()
  gameState.finished = false
  gameState.finishTime = 0
}
