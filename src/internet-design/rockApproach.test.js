import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { ROCK_APPROACH_DURATION, EXPANDED_MAGNIFICATION, cubicEase, createRockApproach, approachZ } from './rockApproach.js'

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`)

test('Bezier timing reads Y at the solved X rather than using elapsed time as its parameter', () => {
  // Independently evaluated curve points (X, Y) at parameters .2, .5, .8, .9.
  for (const [x, y] of [[0.2, 0.104], [0.3125, 0.5], [0.56, 0.896], [0.7425, 0.972]]) near(cubicEase(x), y)
  assert.equal(cubicEase(0), 0)
  assert.equal(cubicEase(1), 1)
  assert.equal(cubicEase(-1), 0)
  assert.equal(cubicEase(2), 1)
})

test('approach uses an exact 1200ms interval with exact endpoints and the requested curve', () => {
  const motion = createRockApproach()
  assert.equal(ROCK_APPROACH_DURATION, 1200)
  assert.equal(EXPANDED_MAGNIFICATION, 2)
  assert.equal(motion.setExpanded(true, 100), 1)
  assert.equal(motion.sample(99), 1)
  near(motion.sample(340), 1.104)
  near(motion.sample(475), 1.5)
  near(motion.sample(772), 1.896)
  assert.ok(motion.sample(1299) < 2)
  assert.equal(motion.sample(1300), 2)
  assert.equal(motion.sample(5000), 2)
})

test('repeated requests for the existing target do not restart the transition', () => {
  const motion = createRockApproach()
  motion.setExpanded(true, 0)
  motion.setExpanded(true, 200)
  motion.setExpanded(true, 600)
  assert.equal(motion.sample(1200), 2)
  motion.setExpanded(true, 1300)
  assert.equal(motion.sample(1400), 2)
})

test('mid-flight reversal starts continuously from the current magnification', () => {
  const motion = createRockApproach()
  motion.setExpanded(true, 0)
  const before = motion.sample(375)
  near(before, 1.5)
  assert.equal(motion.setExpanded(false, 375), before)
  assert.equal(motion.sample(375), before)
  near(motion.sample(750), 1.25)
  assert.equal(motion.sample(1575), 1)
  motion.setExpanded(true, 1800)
  assert.equal(motion.sample(1800), 1)
  assert.equal(motion.sample(3000), 2)
})

test('snap and arbitrary clocks always yield a finite bounded magnification', () => {
  const motion = createRockApproach(true)
  assert.equal(motion.sample(0), 2)
  motion.setExpanded(false, 0)
  motion.sample(150)
  assert.equal(motion.snap(true), 2)
  assert.equal(motion.sample(160), 2)
  assert.equal(motion.snap(false), 1)
  motion.setExpanded(true, 200)
  for (const now of [NaN, Infinity, -Infinity, undefined, -1e100, 1e100]) {
    const value = motion.sample(now)
    assert.ok(Number.isFinite(value) && value >= 1 && value <= 2)
  }
  for (const distance of [NaN, Infinity, -10, 0, 100]) {
    for (const amount of [NaN, Infinity, -1, 0, 1, 2, 100]) assert.ok(Number.isFinite(approachZ(distance, amount)))
  }
})

test('physical approach doubles the anchor-plane image without changing the camera or its center', () => {
  for (const aspect of [16 / 9, 9 / 16]) {
    const camera = new THREE.PerspectiveCamera(24, aspect, 0.1, 2000)
    camera.position.z = 130
    camera.updateMatrixWorld()
    const point = new THREE.Vector3(5, 3, 0)
    const collapsed = point.clone().project(camera)
    const offset = approachZ(camera.position.z, 2)
    const expanded = point.clone().add(new THREE.Vector3(0, 0, offset)).project(camera)
    near(expanded.x / collapsed.x, 2)
    near(expanded.y / collapsed.y, 2)
    assert.equal(camera.position.z, 130)
    assert.equal(camera.zoom, 1)
    const center = new THREE.Vector3(0, 0, offset).project(camera)
    assert.equal(center.x, 0)
    assert.equal(center.y, 0)
  }
})
