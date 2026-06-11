// Control scheme templates. No per-key remapping yet — just presets.
// 'keyboard'  — WASD / arrows, as shipped.
// 'mouse'     — keyboard throttle/brake/boost, mouse steers and pitches.
const STORAGE_KEY = 'hover-racer-controls'

export const SCHEMES = [
  {
    id: 'keyboard',
    name: 'Keyboard',
    blurb: 'W throttle · S brake · A D steer · ← → roll · ↑ ↓ pitch · Shift / Space boost',
  },
  {
    id: 'mouse',
    name: 'Keyboard + Mouse',
    blurb: '↑ throttle · ↓ brake · mouse steers & pitches · A D roll · Shift / Space boost',
  },
]

function load() {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return SCHEMES.some((s) => s.id === v) ? v : 'keyboard'
  } catch {
    return 'keyboard'
  }
}

export const controlState = {
  scheme: load(),
}

export function setScheme(id) {
  controlState.scheme = id
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // private browsing — selection just won't persist
  }
}
