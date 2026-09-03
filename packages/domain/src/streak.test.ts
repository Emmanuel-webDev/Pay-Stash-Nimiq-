import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStreakWeeks } from './streak.js'

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

// A real Monday 00:00 UTC (2026-08-31 was a Monday) for a fixed, readable "now".
const THIS_MONDAY = Date.UTC(2026, 7, 31)

test('no confirmed sweeps ever -> streak is 0', () => {
  assert.equal(computeStreakWeeks([], THIS_MONDAY), 0)
})

test('a sweep this week -> streak of 1', () => {
  assert.equal(computeStreakWeeks([THIS_MONDAY + 2 * MS_PER_DAY], THIS_MONDAY), 1)
})

test('consecutive weeks, no gap -> counts every week', () => {
  const timestamps = [0, 1, 2, 3, 4, 5].map((weeksAgo) => THIS_MONDAY - weeksAgo * MS_PER_WEEK + MS_PER_DAY)
  assert.equal(computeStreakWeeks(timestamps, THIS_MONDAY), 6)
})

test('real gap week stops the walk-back', () => {
  // Sweeps this week, last week, and two weeks ago, but NOT three weeks
  // ago (a real gap) — a sweep four weeks ago must not be counted past it.
  const timestamps = [0, 1, 2, 4].map((weeksAgo) => THIS_MONDAY - weeksAgo * MS_PER_WEEK + MS_PER_DAY)
  assert.equal(computeStreakWeeks(timestamps, THIS_MONDAY), 3)
})

test('no sweep yet this week, but last week had one -> streak continues (no display-bug reset)', () => {
  const lastWeek = THIS_MONDAY - MS_PER_WEEK + MS_PER_DAY
  const twoWeeksAgo = THIS_MONDAY - 2 * MS_PER_WEEK + MS_PER_DAY
  assert.equal(computeStreakWeeks([lastWeek, twoWeeksAgo], THIS_MONDAY), 2)
})

test('a full week has elapsed with nothing -> streak is broken, not just paused', () => {
  const twoWeeksAgo = THIS_MONDAY - 2 * MS_PER_WEEK + MS_PER_DAY
  const threeWeeksAgo = THIS_MONDAY - 3 * MS_PER_WEEK + MS_PER_DAY
  // Nothing this week AND nothing last week -> the run that ended two
  // weeks ago is genuinely over, regardless of how long it was.
  assert.equal(computeStreakWeeks([twoWeeksAgo, threeWeeksAgo], THIS_MONDAY), 0)
})

test('duplicate sweeps within the same week only count once toward that week', () => {
  const thisWeekA = THIS_MONDAY + MS_PER_DAY
  const thisWeekB = THIS_MONDAY + 3 * MS_PER_DAY
  const lastWeek = THIS_MONDAY - MS_PER_WEEK + MS_PER_DAY
  assert.equal(computeStreakWeeks([thisWeekA, thisWeekB, lastWeek], THIS_MONDAY), 2)
})
