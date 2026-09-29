const motionSelector = [
  '.video-card',
  '.video-card-shell',
  '.nav-pill',
  '.desktop-focus-overlay',
  '.desktop-focus-labels',
  '.desktop-focus-label',
  '.mobile-focus-overlay',
  '.mobile-focus-label',
].join(', ')

/** CSS motion for cards, navigation and focus UI; page fades and tuning UI are excluded. */
export function findPageMotionAnimations(root = globalThis.document) {
  return root.getAnimations().filter((animation) => {
    const target = animation.effect?.target
    // Most engines return the originating Element for pseudo-element effects.
    const element = target?.closest ? target : target?.element
    return Boolean(element?.closest?.(motionSelector))
  })
}

function writeAnimationRate(animation, rate) {
  try {
    // Unlike assigning playbackRate, this preserves the current visual time.
    if (typeof animation.updatePlaybackRate === 'function') animation.updatePlaybackRate(rate)
    else animation.playbackRate = rate
  } catch {
    // A canceled or detached transition must not interrupt the shared clock.
  }
}

/**
 * A virtual clock for motion-related timers plus a rate bridge for CSS/WAAPI
 * animations. Timer durations are measured in original-speed milliseconds.
 * No animation frame is retained at normal speed without a pending timer.
 */
export function createMotionClock({
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (id) => cancelAnimationFrame(id),
  getAnimations = () => findPageMotionAnimations(),
} = {}) {
  let rate = 1
  let lastTime = now()
  let motionTime = 0
  let nextTimerId = 0
  let frameId = null
  let disposed = false
  const timers = new Map()
  const animationRates = new Map()

  function advance(timestamp) {
    motionTime += Math.max(0, timestamp - lastTime) * rate
    lastTime = Math.max(lastTime, timestamp)
  }

  function syncAnimations() {
    if (rate === 1) {
      for (const [animation, saved] of animationRates) {
        writeAnimationRate(animation, saved.original)
      }
      animationRates.clear()
      return
    }
    const current = new Set(getAnimations())
    for (const [animation, saved] of animationRates) {
      if (!current.has(animation)) {
        writeAnimationRate(animation, saved.original)
        animationRates.delete(animation)
      }
    }
    for (const animation of current) {
      let saved = animationRates.get(animation)
      if (!saved) {
        const original = animation.playbackRate
        if (!Number.isFinite(original)) continue
        saved = { original, applied: null }
        animationRates.set(animation, saved)
      }
      const nextRate = saved.original * rate
      if (saved.applied !== nextRate) {
        writeAnimationRate(animation, nextRate)
        saved.applied = nextRate
      }
    }
  }

  function cancelFrameIfIdle() {
    if ((disposed || (rate === 1 && timers.size === 0)) && frameId !== null) {
      cancelFrame(frameId)
      frameId = null
    }
  }

  function scheduleFrame() {
    if (!disposed && frameId === null && (rate !== 1 || timers.size > 0)) {
      frameId = requestFrame(tick)
    }
  }

  function tick(timestamp) {
    frameId = null
    if (disposed) return
    advance(timestamp)
    syncAnimations()
    const due = [...timers].filter(([, timer]) => timer.at <= motionTime)
      .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])
    try {
      for (const [id, timer] of due) {
        if (!timers.delete(id)) continue
        timer.callback()
        if (disposed) break
      }
    } finally {
      scheduleFrame()
    }
  }

  function setMotionRate(nextRate) {
    if (disposed) return
    if (!Number.isFinite(nextRate) || nextRate < 0) throw new RangeError('Motion rate must be finite and nonnegative')
    advance(now())
    rate = nextRate
    syncAnimations()
    cancelFrameIfIdle()
    scheduleFrame()
  }

  function scheduleMotionTimeout(callback, baseMs) {
    if (disposed) return () => {}
    advance(now())
    const id = ++nextTimerId
    timers.set(id, { callback, at: motionTime + Math.max(0, Number(baseMs) || 0) })
    scheduleFrame()
    return () => {
      timers.delete(id)
      cancelFrameIfIdle()
    }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    timers.clear()
    rate = 1
    syncAnimations()
    cancelFrameIfIdle()
  }

  return { setMotionRate, scheduleMotionTimeout, dispose }
}

let pageClock
const getPageClock = () => (pageClock ||= createMotionClock())

export const setMotionRate = (rate) => getPageClock().setMotionRate(rate)
export const scheduleMotionTimeout = (callback, baseMs) => getPageClock().scheduleMotionTimeout(callback, baseMs)
