import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { coverVideoUv, srgbToLinear, decodeVideoColor } from './screenGlowMath.js'

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-11, `${actual} differs from ${expected}`)

test('glow UVs match the real player texture matrix across cover crops', () => {
  for (const [videoAspect, frameAspect] of [[16 / 9, 1], [9 / 16, 1], [1, 16 / 9], [1, 1]]) {
    const texture = new THREE.Texture()
    texture.center.set(0.5, 0.5)
    texture.rotation = Math.PI
    texture.repeat.set(Math.min(1, frameAspect / videoAspect), -Math.min(1, videoAspect / frameAspect))
    texture.updateMatrix()
    for (const uv of [[0, 0], [1, 1], [0.5, 0.5], [0.2, 0.7]]) {
      const actual = coverVideoUv(uv, videoAspect, frameAspect)
      const rendered = new THREE.Vector2(...uv).applyMatrix3(texture.matrix)
      near(actual[0], rendered.x)
      near(actual[1], rendered.y)
    }
    texture.dispose()
  }
})

test('square cover samples the visible central video region with the source orientation', () => {
  assert.deepEqual(coverVideoUv([0, 0], 2, 1), [0.75, 0])
  assert.deepEqual(coverVideoUv([1, 1], 2, 1), [0.25, 1])
  assert.deepEqual(coverVideoUv([0, 0], 0.5, 1), [1, 0.25])
  assert.deepEqual(coverVideoUv([1, 1], 0.5, 1), [0, 0.75])
  assert.deepEqual(coverVideoUv([0.5, 0.5], 2, 1), [0.5, 0.5])
})

test('missing metadata and invalid UVs remain finite before a video becomes ready', () => {
  for (const aspect of [NaN, Infinity, 0, -1, undefined]) {
    assert.deepEqual(coverVideoUv([NaN, Infinity], aspect, aspect), [0.5, 0.5])
    assert.deepEqual(coverVideoUv({ x: 0, y: 1 }, aspect, 1), [1, 1])
  }
})

test('video colors decode into linear light rather than washing out the reflected color', () => {
  assert.equal(srgbToLinear(0), 0)
  assert.equal(srgbToLinear(1), 1)
  near(srgbToLinear(0.04045), 0.0031308049535603713)
  near(srgbToLinear(0.5), 0.21404114048223255)
  const decoded = decodeVideoColor({ r: 1, g: 0.5, b: 0 })
  near(decoded[0], 1)
  near(decoded[1], 0.21404114048223255)
  assert.equal(decoded[2], 0)
  assert.deepEqual(decodeVideoColor([10, NaN, -1]), [1, 0, 0])
})
