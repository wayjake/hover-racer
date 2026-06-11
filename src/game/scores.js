// Client for the public scoreboard API (api/scores.js).

const TOP_N = 10

export async function fetchTopScores() {
  const res = await fetch('/api/scores')
  if (!res.ok) throw new Error('failed to load scores')
  return (await res.json()).scores
}

export async function submitScore(initials, timeMs) {
  const res = await fetch('/api/scores', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ initials, timeMs }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'failed to save score')
  return data.scores
}

// Mirrors the server's gate: in if the board isn't full, or if the time
// beats (or ties) the current tenth place.
export function qualifiesForBoard(board, timeMs) {
  return board.length < TOP_N || timeMs <= board[board.length - 1].timeMs
}
