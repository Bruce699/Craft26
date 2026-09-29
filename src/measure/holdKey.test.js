import test from 'node:test'
import assert from 'node:assert/strict'
import { listenForHold } from './holdKey.js'

function fixture() {
  const windowTarget = new EventTarget(), documentTarget = new EventTarget()
  let callback, pressed = false, held = false, editing = false
  const dispose = listenForHold({ windowTarget, documentTarget, delay: 350,
    onChange: value => { held = value }, onPress: value => { pressed = value },
    isEditable: () => editing,
    schedule: fn => { callback = fn; return 1 }, cancel: () => { callback = undefined },
  })
  return { windowTarget, documentTarget, dispose,
    state: () => ({ pressed, held }), edit: value => { editing = value },
    tick: () => callback?.(),
    key: (type, extra = {}) => windowTarget.dispatchEvent(Object.assign(new Event(type), { key: 'a', ...extra })),
  }
}

test('press starts immediately; guides wait for hold delay; release clears both', () => {
  const f = fixture()
  f.key('keydown')
  assert.deepEqual(f.state(), { pressed: true, held: false })
  f.tick()
  assert.deepEqual(f.state(), { pressed: true, held: true })
  f.key('keyup')
  assert.deepEqual(f.state(), { pressed: false, held: false })
  f.dispose()
})

test('short taps release before showing guides; typing and shortcuts are ignored', () => {
  const f = fixture()
  f.key('keydown'); f.key('keyup'); f.tick()
  assert.deepEqual(f.state(), { pressed: false, held: false })
  f.key('keydown', { metaKey: true }); f.tick()
  assert.equal(f.state().pressed, false)
  f.edit(true); f.key('keydown'); f.tick()
  assert.equal(f.state().pressed, false)
  f.dispose()
})

test('blur and cleanup restore state and remove listeners', () => {
  const f = fixture()
  f.key('keydown'); f.tick(); f.windowTarget.dispatchEvent(new Event('blur'))
  assert.deepEqual(f.state(), { pressed: false, held: false })
  f.key('keydown'); f.tick(); f.dispose()
  f.key('keydown'); f.tick()
  assert.deepEqual(f.state(), { pressed: false, held: false })
})
