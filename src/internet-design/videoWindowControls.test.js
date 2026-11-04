import assert from 'node:assert/strict'
import test from 'node:test'
import { REFERENCE_WINDOW_ASPECT, windowForAspect, syncVideoWindow } from './videoWindowControls.js'

// These tests exercise the neutral geometry math independently of the saved UI preset.
const neutralWindow = { width: 1, height: 1, aspectRatio: REFERENCE_WINDOW_ASPECT }

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} differs from ${expected}`)
function bounded(window) {
  for (const value of Object.values(window)) assert.ok(Number.isFinite(value))
  assert.ok(window.width >= 0.45 && window.width <= 1.3)
  assert.ok(window.height >= 0.45 && window.height <= 1.3)
  near(window.aspectRatio, REFERENCE_WINDOW_ASPECT * window.width / window.height)
}

test('common proportions preserve area when possible and fit portrait within the limits', () => {
  for (const aspect of [1, 16 / 9]) {
    const window = windowForAspect(aspect, neutralWindow)
    bounded(window)
    near(window.aspectRatio, aspect)
    near(window.width * window.height, 1)
  }
  const portrait = windowForAspect(9 / 16, neutralWindow)
  bounded(portrait)
  near(portrait.aspectRatio, 9 / 16)
  near(portrait.height, 1.3)
})

test('unreachable proportions clamp to exact reachable edges and invalid values remain finite', () => {
  const narrow = windowForAspect(-1e100, neutralWindow)
  const wide = windowForAspect(1e100, neutralWindow)
  assert.equal(narrow.width, 0.45)
  assert.equal(narrow.height, 1.3)
  assert.equal(wide.width, 1.3)
  assert.equal(wide.height, 0.45)
  for (const aspect of [NaN, Infinity, -Infinity, 0, -10, 0.01, 100]) {
    bounded(windowForAspect(aspect, { width: NaN, height: Infinity }))
    bounded(syncVideoWindow({ width: Infinity, height: NaN, aspectRatio: aspect }, null))
  }
})

test('synchronization distinguishes ratio intent from direct dimension edits', () => {
  const ratioEdit = syncVideoWindow({ ...neutralWindow, aspectRatio: 16 / 9 }, neutralWindow)
  near(ratioEdit.aspectRatio, 16 / 9)
  near(ratioEdit.width * ratioEdit.height, 1)
  const widthEdit = syncVideoWindow({ ...neutralWindow, width: 1.2 }, neutralWindow)
  near(widthEdit.width, 1.2)
  near(widthEdit.height, 1)
  near(widthEdit.aspectRatio, REFERENCE_WINDOW_ASPECT * 1.2)
  const combinedEdit = syncVideoWindow({ width: 0.8, height: 1.2, aspectRatio: 16 / 9 }, neutralWindow)
  near(combinedEdit.aspectRatio, REFERENCE_WINDOW_ASPECT * 0.8 / 1.2)
})

test('feasible aspect round trips retain size and settled controls do not drift', () => {
  const resized = windowForAspect(REFERENCE_WINDOW_ASPECT * 1.2, neutralWindow)
  const restored = windowForAspect(REFERENCE_WINDOW_ASPECT, resized)
  near(restored.width, 1)
  near(restored.height, 1)
  let settled = syncVideoWindow(resized, neutralWindow)
  const first = { ...settled }
  for (let i = 0; i < 1000; i++) settled = syncVideoWindow(settled, settled)
  assert.deepEqual(settled, first)
  assert.deepEqual(syncVideoWindow({ ...neutralWindow, aspectRatio: REFERENCE_WINDOW_ASPECT + 1e-10 }, neutralWindow), neutralWindow)
})
