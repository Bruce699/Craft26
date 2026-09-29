const smoothstep = (value) => value * value * (3 - 2 * value)

// Mux forwards playbackRate to its native video. Do not also capture a slotted
// native child, which would otherwise save an already modified original rate.
export function findPageVideos(root) {
  return [...root.querySelectorAll('mux-video, video')].filter(
    (media) => media.localName !== 'video' || !media.closest('mux-video'),
  )
}

function watchMedia(root, onChange) {
  const observer = new MutationObserver(onChange)
  observer.observe(root, { childList: true, subtree: true })
  root.addEventListener('loadedmetadata', onChange, true)
  root.addEventListener('loadstart', onChange, true)
  return () => {
    observer.disconnect()
    root.removeEventListener('loadedmetadata', onChange, true)
    root.removeEventListener('loadstart', onChange, true)
  }
}

function readRate(media) {
  try {
    const rate = media.playbackRate
    return Number.isFinite(rate) && rate > 0 ? rate : null
  } catch {
    return null
  }
}

function writeRate(media, rate) {
  try {
    if (media.playbackRate !== rate) media.playbackRate = rate
  } catch {
    // A removed or unavailable player must not interrupt the other videos.
  }
}

/**
 * Shared easing for page video speeds and a background fade. Never calls play
 * or pause. setActive reverses from the current progress; reset restores every
 * captured rate immediately (including when RAF is throttled in a hidden tab).
 * dispose additionally removes observers. Options are fixed for this instance.
 * Scheduler/discovery hooks allow deterministic tests without a browser.
 */
export function createMediaTransition({
  root = globalThis.document,
  slowRate = 0.25,
  enterDuration = 500,
  exitDuration = 400,
  onProgress = () => {},
  now = () => performance.now(),
  requestFrame = (callback) => requestAnimationFrame(callback),
  cancelFrame = (id) => cancelAnimationFrame(id),
  getMedia = () => findPageVideos(root),
  observeMedia = (callback) => watchMedia(root, callback),
} = {}) {
  const originalRates = new Map()
  let active = false
  let progress = 0
  let transition = null
  let frameId = null
  let disposed = false

  function syncMedia() {
    const current = new Set(getMedia())
    for (const [media, rate] of originalRates) {
      if (!current.has(media)) {
        writeRate(media, rate)
        originalRates.delete(media)
      }
    }
    for (const media of current) {
      if (originalRates.has(media)) continue
      const rate = readRate(media)
      if (rate !== null) originalRates.set(media, rate)
    }
  }

  function advance(timestamp) {
    if (transition) {
      const elapsed = Math.max(0, timestamp - transition.startedAt)
      const fraction = transition.duration > 0
        ? Math.min(1, elapsed / transition.duration)
        : 1
      progress = transition.from + (transition.to - transition.from) * smoothstep(fraction)
      if (fraction === 1) transition = null
    }
    syncMedia()
    for (const [media, originalRate] of originalRates) {
      writeRate(media, originalRate + (slowRate - originalRate) * progress)
    }
    onProgress(progress)
    if (!active && !transition && progress === 0) originalRates.clear()
  }

  function schedule() {
    if (transition && frameId === null && !disposed) frameId = requestFrame(tick)
  }

  function tick(timestamp) {
    frameId = null
    if (disposed) return
    advance(timestamp)
    schedule()
  }

  const stopWatching = observeMedia(() => {
    if (disposed || (!active && progress === 0 && !transition)) return
    advance(now())
    schedule()
  })

  function cancel() {
    if (frameId !== null) cancelFrame(frameId)
    frameId = null
  }

  function setActive(nextActive) {
    if (disposed || active === Boolean(nextActive)) return
    const timestamp = now()
    if (transition) advance(timestamp)
    active = Boolean(nextActive)
    const target = active ? 1 : 0
    transition = progress === target ? null : {
      from: progress,
      to: target,
      startedAt: timestamp,
      duration: active ? enterDuration : exitDuration,
    }
    cancel()
    advance(timestamp)
    schedule()
  }

  function reset() {
    if (disposed) return
    cancel()
    active = false
    transition = null
    progress = 0
    for (const [media, rate] of originalRates) writeRate(media, rate)
    originalRates.clear()
    onProgress(0)
  }

  function dispose() {
    if (disposed) return
    reset()
    disposed = true
    stopWatching()
  }

  return { setActive, reset, dispose }
}
