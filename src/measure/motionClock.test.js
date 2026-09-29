import assert from 'node:assert/strict'
import test from 'node:test'
import { createMotionClock, findPageMotionAnimations } from './motionClock.js'

function animation(playbackRate = 1) {
  return {
    playbackRate,
    currentTime: 123,
    playState: 'running',
    updates: [],
    updatePlaybackRate(rate) {
      this.playbackRate = rate
      this.updates.push(rate)
    },
  }
}

function setup(animations = []) {
  let time = 0
  let nextId = 0
  const frames = new Map()
  const clock = createMotionClock({
    now: () => time,
    requestFrame(callback) {
      frames.set(++nextId, callback)
      return nextId
    },
    cancelFrame: (id) => frames.delete(id),
    getAnimations: () => animations,
  })
  return {
    ...clock,
    animations,
    frames,
    at(timestamp) { time = timestamp },
    step(timestamp) {
      time = timestamp
      const pending = [...frames.values()]
      frames.clear()
      pending.forEach((callback) => callback(timestamp))
    },
  }
}

test('normal-speed logical timeout fires once and releases its animation frame', () => {
  const clock = setup()
  let calls = 0
  assert.equal(clock.frames.size, 0)
  clock.scheduleMotionTimeout(() => { calls += 1 }, 500)
  clock.step(499)
  assert.equal(calls, 0)
  clock.step(500)
  assert.equal(calls, 1)
  assert.equal(clock.frames.size, 0)
})

test('timers use elapsed time at the previous rate before each smooth rate change', () => {
  const clock = setup()
  let fired = false
  clock.scheduleMotionTimeout(() => { fired = true }, 500)
  clock.step(100)
  clock.at(200)
  clock.setMotionRate(0.25) // 200 logical ms have elapsed.
  clock.step(600) // 300 logical ms.
  clock.at(800)
  clock.setMotionRate(0.5) // 350 logical ms; no restart at the new rate.
  clock.step(1000) // 450 logical ms.
  assert.equal(fired, false)
  clock.at(1050)
  clock.setMotionRate(1) // 475 logical ms.
  clock.step(1074)
  assert.equal(fired, false)
  clock.step(1075)
  assert.equal(fired, true)
  assert.equal(clock.frames.size, 0)
})

test('new timers inherit slow time and canceled or disposed timers never fire', () => {
  const clock = setup()
  const calls = []
  clock.setMotionRate(0.25)
  clock.step(100)
  const cancel = clock.scheduleMotionTimeout(() => calls.push('canceled'), 10)
  clock.scheduleMotionTimeout(() => calls.push('first'), 100)
  cancel()
  clock.step(499)
  assert.deepEqual(calls, [])
  clock.step(500)
  assert.deepEqual(calls, ['first'])
  clock.scheduleMotionTimeout(() => calls.push('disposed'), 100)
  clock.dispose()
  clock.step(1000)
  assert.deepEqual(calls, ['first'])
  assert.equal(clock.frames.size, 0)
})

test('callbacks may schedule or cancel other timers without losing the shared frame', () => {
  const clock = setup()
  const calls = []
  let cancelSecond
  clock.scheduleMotionTimeout(() => {
    calls.push('first')
    cancelSecond()
    clock.scheduleMotionTimeout(() => calls.push('third'), 50)
  }, 100)
  cancelSecond = clock.scheduleMotionTimeout(() => calls.push('second'), 100)
  clock.step(100)
  assert.deepEqual(calls, ['first'])
  assert.equal(clock.frames.size, 1)
  clock.step(150)
  assert.deepEqual(calls, ['first', 'third'])
  assert.equal(clock.frames.size, 0)
})

test('WAAPI rates follow the shared rate without seeking and restore original rates', () => {
  const first = animation(1)
  const second = animation(2)
  second.playState = 'paused'
  const clock = setup([first, second])
  clock.setMotionRate(0.75)
  assert.equal(first.playbackRate, 0.75)
  assert.equal(second.playbackRate, 1.5)
  clock.setMotionRate(0.25)
  assert.equal(first.playbackRate, 0.25)
  assert.equal(second.playbackRate, 0.5)
  clock.step(100)
  assert.deepEqual(first.updates, [0.75, 0.25])
  clock.setMotionRate(1)
  assert.equal(first.playbackRate, 1)
  assert.equal(second.playbackRate, 2)
  assert.equal(first.currentTime, 123)
  assert.equal(second.playState, 'paused')
  assert.equal(clock.frames.size, 0)
})

test('animations created while slow join the rate and removed animations are restored', () => {
  const first = animation()
  const clock = setup([first])
  clock.setMotionRate(0.25)
  const late = animation(1.5)
  clock.animations.push(late)
  clock.step(16)
  assert.equal(late.playbackRate, 0.375)
  clock.animations.shift()
  clock.step(32)
  assert.equal(first.playbackRate, 1)
  clock.dispose()
  assert.equal(late.playbackRate, 1.5)
  assert.equal(clock.frames.size, 0)
  clock.setMotionRate(0.25)
  assert.equal(clock.frames.size, 0)
})

test('discovery includes card/focus descendants and pseudo effects but excludes other UI', () => {
  const card = { closest: (selector) => selector.includes('.video-card') ? {} : null }
  const focusLabel = { closest: (selector) => selector.includes('.desktop-focus-labels') ? {} : null }
  const unrelated = { closest: () => null }
  const effects = [card, focusLabel, { element: card }, unrelated, null]
    .map((target) => ({ effect: { target } }))
  assert.deepEqual(findPageMotionAnimations({ getAnimations: () => effects }), effects.slice(0, 3))
})

test('canceling the last normal-speed timer stops RAF immediately', () => {
  const clock = setup()
  const cancel = clock.scheduleMotionTimeout(() => assert.fail('canceled timer ran'), 500)
  assert.equal(clock.frames.size, 1)
  cancel()
  assert.equal(clock.frames.size, 0)
})
