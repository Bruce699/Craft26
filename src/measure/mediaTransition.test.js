import assert from 'node:assert/strict'
import test from 'node:test'
import { createMediaTransition, findPageVideos } from './mediaTransition.js'

function setup(rates = [1]) {
  let timestamp = 0
  let id = 0
  const frames = new Map()
  const media = rates.map((playbackRate) => ({ playbackRate, paused: true }))
  let notifyMutation
  let disconnected = false
  let progress = 0
  const controller = createMediaTransition({
    getMedia: () => media,
    observeMedia: (callback) => {
      notifyMutation = callback
      return () => { disconnected = true }
    },
    now: () => timestamp,
    requestFrame: (callback) => {
      frames.set(++id, callback)
      return id
    },
    cancelFrame: (frameId) => frames.delete(frameId),
    onProgress: (value) => { progress = value },
  })
  return {
    controller,
    media,
    frames,
    get progress() { return progress },
    get disconnected() { return disconnected },
    mutate: () => notifyMutation(),
    step(time) {
      timestamp = time
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((callback) => callback(time))
    },
    clock(time) { timestamp = time },
  }
}

test('eases through intermediate rates to 0.25 in 500ms, then restores in 400ms', () => {
  const scene = setup([1, 1.5])
  scene.controller.setActive(true)
  assert.equal(scene.media[0].playbackRate, 1)
  scene.step(125)
  assert.equal(scene.progress, 0.15625)
  assert.equal(scene.media[0].playbackRate, 0.8828125)
  scene.step(250)
  assert.equal(scene.progress, 0.5)
  assert.equal(scene.media[0].playbackRate, 0.625)
  scene.step(500)
  assert.equal(scene.progress, 1)
  assert.deepEqual(scene.media.map((item) => item.playbackRate), [0.25, 0.25])
  assert.equal(scene.frames.size, 0)
  scene.controller.setActive(false)
  scene.step(700)
  assert.equal(scene.progress, 0.5)
  assert.equal(scene.media[0].playbackRate, 0.625)
  scene.step(900)
  assert.equal(scene.progress, 0)
  assert.deepEqual(scene.media.map((item) => item.playbackRate), [1, 1.5])
  assert.ok(scene.media.every((item) => item.paused))
  assert.equal(scene.frames.size, 0)
})

test('releasing and pressing again mid-transition never snaps or recaptures slowed rates', () => {
  const scene = setup()
  scene.controller.setActive(true)
  scene.step(250)
  scene.controller.setActive(false)
  assert.equal(scene.media[0].playbackRate, 0.625)
  scene.step(450)
  assert.equal(scene.media[0].playbackRate, 0.8125)
  scene.controller.setActive(true)
  assert.equal(scene.media[0].playbackRate, 0.8125)
  scene.step(950)
  assert.equal(scene.media[0].playbackRate, 0.25)
  scene.controller.setActive(false)
  scene.step(1350)
  assert.equal(scene.media[0].playbackRate, 1)
})

test('repeat activation does not restart the transition and reversal samples between frames', () => {
  const scene = setup()
  scene.controller.setActive(true)
  scene.step(100)
  scene.controller.setActive(true)
  scene.clock(250)
  scene.controller.setActive(false)
  assert.equal(scene.progress, 0.5)
  assert.equal(scene.media[0].playbackRate, 0.625)
  scene.step(650)
  assert.equal(scene.media[0].playbackRate, 1)
})

test('new videos join current progress, removed videos restore, and loaded players reapply rates', () => {
  const scene = setup()
  scene.controller.setActive(true)
  scene.step(250)
  const added = { playbackRate: 2 }
  scene.media.push(added)
  scene.mutate()
  assert.equal(added.playbackRate, 1.125)
  const removed = scene.media.shift()
  scene.mutate()
  assert.equal(removed.playbackRate, 1)
  scene.step(500)
  added.playbackRate = 1
  scene.mutate()
  assert.equal(added.playbackRate, 0.25)
  const late = { playbackRate: 1.25 }
  scene.media.push(late)
  scene.mutate()
  assert.equal(late.playbackRate, 0.25)
  scene.controller.setActive(false)
  scene.step(900)
  assert.equal(added.playbackRate, 2)
  assert.equal(late.playbackRate, 1.25)
})

test('reset works without a frame and disposal restores rates and stops observation', () => {
  const scene = setup([1.5])
  scene.controller.setActive(true)
  scene.step(200)
  scene.controller.reset()
  assert.equal(scene.media[0].playbackRate, 1.5)
  assert.equal(scene.progress, 0)
  assert.equal(scene.frames.size, 0)
  scene.media[0].playbackRate = 2
  scene.controller.setActive(true)
  scene.step(700)
  scene.controller.dispose()
  assert.equal(scene.media[0].playbackRate, 2)
  assert.equal(scene.progress, 0)
  assert.equal(scene.disconnected, true)
  scene.controller.setActive(true)
  scene.mutate()
  assert.equal(scene.frames.size, 0)
  assert.equal(scene.media[0].playbackRate, 2)
})

test('discovery controls each Mux player once and includes standalone videos', () => {
  const mux = { localName: 'mux-video' }
  const nativeChild = { localName: 'video', closest: () => mux }
  const video = { localName: 'video', closest: () => null }
  const root = { querySelectorAll: () => [mux, nativeChild, video] }
  assert.deepEqual(findPageVideos(root), [mux, video])
})
