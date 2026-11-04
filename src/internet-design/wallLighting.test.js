import assert from 'node:assert/strict'
import test from 'node:test'
import { wallBeamFalloff, carvingFacingResponse } from './wallLighting.js'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} differs from ${expected}`)

test('beam has a full core, smooth transition, and exact zero outside its radius', () => {
  const radius = 48, softness = 0.55, core = radius * (1 - softness)
  assert.equal(wallBeamFalloff(0, radius, softness), 1)
  assert.equal(wallBeamFalloff(core, radius, softness), 1)
  near(wallBeamFalloff((core + radius) / 2, radius, softness), 0.5)
  for (const distance of [radius, radius + 1e-9, radius * 100]) assert.equal(wallBeamFalloff(distance, radius, softness), 0)
  let previous = 1
  for (let distance = 0; distance <= radius; distance += 0.1) {
    const value = wallBeamFalloff(distance, radius, softness)
    assert.ok(value <= previous && value >= 0 && value <= 1)
    previous = value
  }
})

test('softness extremes and malformed input cannot produce a halo or NaN', () => {
  assert.equal(wallBeamFalloff(47, 48, 0), 1)
  assert.equal(wallBeamFalloff(48, 48, 0), 0)
  near(wallBeamFalloff(24, 48, 1), 0.5)
  for (const distance of [NaN, Infinity, -Infinity, 0, 20, 100]) {
    for (const radius of [NaN, Infinity, 0, -1, 48]) {
      const value = wallBeamFalloff(distance, radius, NaN)
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1)
    }
  }
})

test('one-sided tangent alignment supports the lit bevel and rejects opposite or perpendicular sides', () => {
  const flat = [0, 0, 1], carved = [1, 0, 1]
  near(carvingFacingResponse(flat, carved, [1, 0, 0], 2.2), 2.2)
  assert.equal(carvingFacingResponse(flat, carved, [-1, 0, 0], 2.2), 0)
  assert.equal(carvingFacingResponse(flat, carved, [0, 1, 0], 2.2), 0)
  near(carvingFacingResponse(flat, carved, [1, 1, 0], 2.2), Math.pow(Math.SQRT1_2, 1.5) * 2.2)
})

test('near-frontal light retains its tangent side without creating a fully frontal response', () => {
  const flat = [0, 0, 1], carved = [1, 0, 1]
  near(carvingFacingResponse(flat, carved, [0.001, 0, 1], 2.2), 2.2)
  assert.equal(carvingFacingResponse(flat, carved, [-0.001, 0, 1], 2.2), 0)
  assert.equal(carvingFacingResponse(flat, carved, [0.00001, 0, 1], 2.2), 0)
  assert.equal(carvingFacingResponse(flat, carved, [0, 0, 1], 2.2), 0)
  assert.equal(carvingFacingResponse(flat, flat, [1, 0, 1], 2.2), 0)
})

test('orientation gain is length and coordinate-frame invariant and preserves its contrast range', () => {
  near(carvingFacingResponse({ x: 0, y: 0, z: 12 }, [100, 0, 100], [2, 0, 0], 2.2), 2.2)
  near(carvingFacingResponse([1, 0, 0], [1, 1, 0], [0, 1, 0], 2.2), 2.2)
  near(carvingFacingResponse([0, 0, 1], [1, 0, 1], [1, 0, 0], 100), 6)
  near(carvingFacingResponse([0, 0, 1], [1, 0, 1], [1, 0, 0], -1), 0.5)
})

test('off-beam weights remain exactly zero even with strongly facing carved normals', () => {
  const facing = carvingFacingResponse([0, 0, 1], [1, 0, 1], [1, 0, 0], 6)
  near(facing, 6)
  for (const distance of [48, 49, 1e100]) assert.equal(wallBeamFalloff(distance, 48, 0.55) * facing, 0)
  for (const vector of [null, [], [0, 0, 0], [NaN, 0, 1], [Infinity, 0, 1]]) {
    assert.equal(carvingFacingResponse(vector, [1, 0, 1], [1, 0, 0], 2.2), 0)
  }
  assert.ok(Number.isFinite(carvingFacingResponse([0, 0, 1e300], [1e-300, 0, 1e-300], [1e300, 0, 0], 2.2)))
})
