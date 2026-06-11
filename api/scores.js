// Public scoreboard endpoint, deployed by Vercel as a serverless function.
// GET  /api/scores -> { scores: [{ initials, timeMs }] } — the top ten
// POST /api/scores { initials, timeMs } -> 201 + updated top ten,
//   or 409 if the time doesn't make the top ten (also enforced client-side).
import { asc, count, lt } from 'drizzle-orm'
import { db } from './_lib/db.js'
import { scores } from './_lib/schema.js'

const TOP_N = 10

function topTen() {
  return db
    .select({ initials: scores.initials, timeMs: scores.timeMs })
    .from(scores)
    .orderBy(asc(scores.timeMs), asc(scores.id))
    .limit(TOP_N)
}

export async function GET() {
  return Response.json(
    { scores: await topTen() },
    { headers: { 'cache-control': 'no-store' } },
  )
}

export async function POST(request) {
  const body = await request.json().catch(() => null)
  const initials = String(body?.initials ?? '').trim().toUpperCase()
  const timeMs = Math.round(Number(body?.timeMs))

  if (!/^[A-Z]{1,3}$/.test(initials)) {
    return Response.json({ error: 'initials must be 1-3 letters' }, { status: 400 })
  }
  // a finished run is at least a few seconds; cap at an hour to keep junk out
  if (!Number.isInteger(timeMs) || timeMs < 5000 || timeMs > 3_600_000) {
    return Response.json({ error: 'invalid time' }, { status: 400 })
  }

  // top-ten gate: only insert if fewer than ten existing scores beat this one
  const [{ better }] = await db
    .select({ better: count() })
    .from(scores)
    .where(lt(scores.timeMs, timeMs))
  if (better >= TOP_N) {
    return Response.json({ error: 'not a top-ten time' }, { status: 409 })
  }

  await db.insert(scores).values({ initials, timeMs })
  return Response.json({ scores: await topTen() }, { status: 201 })
}
