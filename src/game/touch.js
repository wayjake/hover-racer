// On-screen control state, written by TouchControls and read by the
// player sim each frame alongside the keyboard. `restart` is a one-shot
// flag: set on tap, consumed (cleared) by the sim.
export const touchInput = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
  boost: false,
  restart: false,
}
