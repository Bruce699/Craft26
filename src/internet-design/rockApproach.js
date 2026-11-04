export const ROCK_APPROACH_DURATION = 1200
export const EXPANDED_MAGNIFICATION = 2

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// CSS cubic-bezier(.5, 0, 0, 1): elapsed time is X, so solve for the
// curve parameter before reading Y. This curve's X is strictly increasing.
export function cubicEase(progress) {
  if (!Number.isFinite(progress)) return progress === Infinity ? 1 : 0
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  let low = 0, high = 1
  for (let step = 0; step < 40; step++) {
    const t = (low + high) / 2
    const x = 1.5 * t - 3 * t * t + 2.5 * t * t * t
    if (x < progress) low = t
    else high = t
  }
  const t = (low + high) / 2
  return 3 * t * t - 2 * t * t * t
}

/** Millisecond-clock motion. sample() returns apparent magnification, not scale. */
export function createRockApproach(initialExpanded = false) {
  let target = initialExpanded ? EXPANDED_MAGNIFICATION : 1
  let from = target
  let startedAt = 0
  let lastTime = 0

  function time(nowMs) {
    if (Number.isFinite(nowMs)) lastTime = nowMs
    return lastTime
  }

  function sample(nowMs) {
    const now = time(nowMs)
    if (from === target) return target
    const elapsed = clamp((now - startedAt) / ROCK_APPROACH_DURATION, 0, 1)
    if (elapsed === 0) return from
    if (elapsed === 1) return target
    return from + (target - from) * cubicEase(elapsed)
  }

  return {
    sample,
    setExpanded(expanded, nowMs) {
      const now = time(nowMs)
      const next = expanded ? EXPANDED_MAGNIFICATION : 1
      if (next === target) return sample(now)
      const current = sample(now)
      from = current
      target = next
      startedAt = now
      return current
    },
    snap(expanded) {
      target = expanded ? EXPANDED_MAGNIFICATION : 1
      from = target
      startedAt = lastTime
      return target
    },
  }
}

// Translating the pinned anchor this far toward a camera at +distance gives
// exactly the requested apparent magnification at the anchor's depth plane.
export function approachZ(cameraDistance, magnification) {
  const distance = Number.isFinite(cameraDistance) ? Math.max(0, cameraDistance) : 0
  const amount = Number.isFinite(magnification) ? clamp(magnification, 1, EXPANDED_MAGNIFICATION) : 1
  return distance * (1 - 1 / amount)
}
