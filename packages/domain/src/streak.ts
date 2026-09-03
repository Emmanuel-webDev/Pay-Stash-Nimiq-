// Weekly savings streak — read-only, derived exclusively from confirmed
// sweeps (Pay & Stash savings transfers and Catch-up sweeps). Never from
// merchant payments, spend volume, or purchase count, and never a new
// writable table: this is a pure function over `sweeps.confirmed_at`
// timestamps, computed fresh on every request.
//
// Week = ISO calendar week, Monday 00:00 UTC start, computed in UTC
// throughout (not local time) so the server and any client-side check
// agree regardless of the user's timezone.

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

/** The Monday-00:00-UTC start of the ISO week containing `ms`. */
function isoWeekStart(ms: number): number {
  const d = new Date(ms)
  const utcDay = d.getUTCDay() // 0 (Sun) .. 6 (Sat)
  const isoDayIndex = (utcDay + 6) % 7 // 0 (Mon) .. 6 (Sun)
  const dateOnlyUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return dateOnlyUtc - isoDayIndex * MS_PER_DAY
}

/**
 * Counts consecutive weeks up to and including the most recent week that
 * has a confirmed sweep, breaking the streak only once a full week has
 * elapsed with nothing.
 *
 * Deliberately NOT "the current week must have a sweep or it's 0": that
 * rule produces exactly the wrong-number failure this feature exists to
 * avoid — a genuine 8-week streak would read as 0 every Monday morning
 * before the user has had a chance to save that week, then "come back" the
 * moment they do. That's a display bug, not a lapsed streak. Here, the
 * streak only actually breaks once an entire week has gone by with zero
 * confirmed sweeps.
 */
export function computeStreakWeeks(confirmedAtMs: readonly number[], nowMs: number = Date.now()): number {
  if (confirmedAtMs.length === 0) return 0

  const activeWeeks = new Set(confirmedAtMs.map(isoWeekStart))
  const currentWeekStart = isoWeekStart(nowMs)
  const mostRecentActiveWeek = Math.max(...activeWeeks)

  // 0 = this week, 1 = last week, 2+ = at least one full week has already
  // elapsed with nothing since the last confirmed sweep — streak is
  // genuinely broken.
  const weeksSinceActive = Math.round((currentWeekStart - mostRecentActiveWeek) / MS_PER_WEEK)
  if (weeksSinceActive >= 2) return 0

  let streak = 1
  let week = mostRecentActiveWeek - MS_PER_WEEK
  while (activeWeeks.has(week)) {
    streak += 1
    week -= MS_PER_WEEK
  }
  return streak
}
