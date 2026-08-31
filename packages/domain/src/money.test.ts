import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nimStringToLuna, lunaToNimString, toSdkValue, LUNA_PER_NIM } from './money.js'

test('nimStringToLuna: whole numbers', () => {
  assert.equal(nimStringToLuna('1'), 100_000n)
  assert.equal(nimStringToLuna('47'), 4_700_000n)
})

test('nimStringToLuna: fractional amounts, no float rounding drift', () => {
  assert.equal(nimStringToLuna('0.00001'), 1n)
  assert.equal(nimStringToLuna('0.1'), 10_000n)
  assert.equal(nimStringToLuna('3420.5'), 342_050_000n)
})

test('nimStringToLuna: rejects more precision than Luna supports', () => {
  assert.throws(() => nimStringToLuna('1.000001'))
})

test('nimStringToLuna: rejects non-numeric input', () => {
  assert.throws(() => nimStringToLuna('abc'))
  assert.throws(() => nimStringToLuna('-1'))
})

test('lunaToNimString round-trips through nimStringToLuna', () => {
  for (const nim of ['0', '1', '47.3', '15000', '0.00001']) {
    assert.equal(lunaToNimString(nimStringToLuna(nim)), nim)
  }
})

test('toSdkValue: converts within safe range', () => {
  assert.equal(toSdkValue(5n * LUNA_PER_NIM), 500_000)
})

test('toSdkValue: rejects amounts beyond Number.MAX_SAFE_INTEGER', () => {
  assert.throws(() => toSdkValue(BigInt(Number.MAX_SAFE_INTEGER) + 1n))
})

test('toSdkValue: rejects negative amounts', () => {
  assert.throws(() => toSdkValue(-1n))
})
