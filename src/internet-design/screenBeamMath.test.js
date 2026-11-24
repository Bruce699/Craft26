import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { clipScreenBeamRay, screenBeamSourceUv } from './screenBeamMath.js'
import { coverVideoUv } from './screenGlowMath.js'

const options = { halfWidth: 8, halfHeight: 8, length: 30, startDepth: 5, spread: 0.2 }
const close = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`)
const withinVolume = ([x, y, z], margin = 1e-8) => z >= options.startDepth - margin
  && z <= options.length + margin
  && Math.abs(x) <= options.halfWidth + options.spread * z + margin
  && Math.abs(y) <= options.halfHeight + options.spread * z + margin

test('front and rear rays clip to finite depth caps without entering the recess', () => {
  assert.deepEqual(clipScreenBeamRay([0, 0, 50], [0, 0, -1], options), [20, 45])
  assert.deepEqual(clipScreenBeamRay([0, 0, -10], [0, 0, 1], options), [15, 40])
  assert.equal(clipScreenBeamRay([0, 0, 50], [0, 0, 1], options), null)
})

test('parallel side rays and cameras inside the volume use correct ray intervals', () => {
  assert.deepEqual(clipScreenBeamRay([20, 0, 10], [-1, 0, 0], options), [10, 30])
  assert.deepEqual(clipScreenBeamRay([0, 0, 10], [1, 0, 0], options), [0, 10])
  assert.equal(clipScreenBeamRay([0, 11, 10], [1, 0, 0], options), null)
  assert.deepEqual(clipScreenBeamRay([0, 0, 50], [0, 0, -2], options), [10, 22.5])
})

test('sloping faces admit forward divergence and reject corner misses', () => {
  assert.deepEqual(clipScreenBeamRay([8.5, 0, 0], [0, 0, 1], { ...options, startDepth: 0 }), [2.5, 30])
  assert.equal(clipScreenBeamRay([15, 15, 50], [0, 0, -1], options), null)
  assert.equal(clipScreenBeamRay([15, 15, 30], [1, 1, -1], options), null)
})

test('all reported intervals lie inside all six planes, with endpoints on the boundary', () => {
  let seed = 26, hits = 0
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (let i = 0; i < 1000; i++) {
    const origin = [random() * 60 - 30, random() * 60 - 30, random() * 80 - 20]
    const direction = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1]
    const interval = clipScreenBeamRay(origin, direction, options)
    if (!interval) continue
    hits++
    const point = (t) => origin.map((value, axis) => value + direction[axis] * t)
    assert.ok(interval[0] >= 0 && interval[1] > interval[0])
    assert.ok(withinVolume(point(interval[0])))
    assert.ok(withinVolume(point((interval[0] + interval[1]) / 2)))
    assert.ok(withinVolume(point(interval[1])))
    if (interval[0] > 1e-4) assert.ok(!withinVolume(point(interval[0] - 1e-4), 0))
    assert.ok(!withinVolume(point(interval[1] + 1e-4), 0))
  }
  assert.ok(hits > 100)
})

test('source projection preserves centered video and the same UV along diverging rays', () => {
  assert.deepEqual(screenBeamSourceUv([0, 0, 12], options), [0.5, 0.5])
  for (const z of [0, 5, 17, 30]) {
    const p = [0.6 * (8 + 0.2 * z), -0.4 * (8 + 0.2 * z), z]
    const uv = screenBeamSourceUv(p, options)
    close(uv[0], 0.8); close(uv[1], 0.3)
  }
  assert.deepEqual(screenBeamSourceUv([10, 10, 10], options), [1, 1])
})

test('displayed source UV follows the real screen reversed-U and VideoTexture matrix', () => {
  for (const videoAspect of [1, 16 / 9, 9 / 16]) {
    const cropX = Math.min(1, 1 / videoAspect), cropY = Math.min(1, videoAspect)
    const matrix = new THREE.Matrix3().setUvTransform(0, 0, cropX, -cropY, Math.PI, 0.5, 0.5)
    for (const [displayU, displayV] of [[0.1, 0.2], [0.5, 0.5], [0.9, 0.8]]) {
      const z = 17, half = 8 + options.spread * z
      const sourceUv = screenBeamSourceUv([(displayU - 0.5) * 2 * half, (displayV - 0.5) * 2 * half, z], options)
      const meshUv = [1 - sourceUv[0], sourceUv[1]]
      const actual = new THREE.Vector2(...meshUv).applyMatrix3(matrix)
      const reference = coverVideoUv(meshUv, videoAspect, 1)
      close(actual.x, reference[0]); close(actual.y, reference[1])
      close(actual.x, 0.5 + (displayU - 0.5) * cropX)
      close(actual.y, 0.5 + (displayV - 0.5) * cropY)
    }
  }
})

test('invalid dimensions and degenerate/non-finite rays are rejected', () => {
  for (const changed of [{ halfWidth: 0 }, { halfHeight: -1 }, { length: 0 }, { startDepth: 31 }, { spread: -1 }]) {
    assert.equal(clipScreenBeamRay([0, 0, 50], [0, 0, -1], { ...options, ...changed }), null)
  }
  assert.equal(clipScreenBeamRay([0, 0, 1], [0, 0, 0], options), null)
  assert.equal(clipScreenBeamRay([NaN, 0, 1], [0, 0, 1], options), null)
  assert.equal(screenBeamSourceUv([0, Infinity, 1], options), null)
})
