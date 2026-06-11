// Pointer-lock helpers for the 'mouse' control scheme. Lock is requested
// from a user gesture (click / menu button) and the browser releases it
// on Esc — lock loss while racing is treated as a pause upstream.
export function requestMouseLock() {
  if (document.pointerLockElement) return
  try {
    const p = document.body.requestPointerLock()
    // Chrome rejects if the user exited lock via Esc moments ago
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {
    // unsupported — absolute mouse position still works as a fallback
  }
}

export function releaseMouseLock() {
  if (document.pointerLockElement) document.exitPointerLock()
}
