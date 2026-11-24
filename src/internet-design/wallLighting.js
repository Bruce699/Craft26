const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

// All distances are world units. The outer radius is an exact cutoff so the
// unlit engraving can return to the same wall base without an ambient halo.
export function wallBeamFalloff(distance, radius, softness) {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) return 0
  const d = Math.max(0, distance)
  if (d >= radius) return 0
  const edge = clamp(Number.isFinite(softness) ? softness : 0.55, 0, 1)
  const core = radius * (1 - edge)
  if (d <= core) return 1
  const t = (d - core) / (radius - core)
  return 1 - t * t * (3 - 2 * t)
}

function normalized(vector) {
  const x = vector?.x ?? vector?.[0]
  const y = vector?.y ?? vector?.[1]
  const z = vector?.z ?? vector?.[2]
  if (![x, y, z].every(Number.isFinite)) return null
  const scale = Math.max(Math.abs(x), Math.abs(y), Math.abs(z))
  if (scale === 0) return null
  const a = x / scale, b = y / scale, c = z / scale
  const length = Math.hypot(a, b, c)
  return [a / length, b / length, c / length]
}

// One-sided tangent alignment, independent of the flat wall's Lambert term.
// Returns a gain in [0, 6], not radiance; multiply by beam and slope visibility.
export function carvingFacingResponse(flatN, carvedN, lightDirection, contrast = 2.2) {
  const flat = normalized(flatN), carved = normalized(carvedN), light = normalized(lightDirection)
  if (!flat || !carved || !light) return 0
  const carvedDot = carved[0] * flat[0] + carved[1] * flat[1] + carved[2] * flat[2]
  const lightDot = light[0] * flat[0] + light[1] * flat[1] + light[2] * flat[2]
  const bx = carved[0] - flat[0] * carvedDot
  const by = carved[1] - flat[1] * carvedDot
  const bz = carved[2] - flat[2] * carvedDot
  const tx = light[0] - flat[0] * lightDot
  const ty = light[1] - flat[1] * lightDot
  const tz = light[2] - flat[2] * lightDot
  const bevelLength = Math.hypot(bx, by, bz), tangentLength = Math.hypot(tx, ty, tz)
  if (bevelLength < 1e-6 || tangentLength < 1e-4) return 0
  const side = clamp((bx * tx + by * ty + bz * tz) / (bevelLength * tangentLength), 0, 1)
  const gain = clamp(Number.isFinite(contrast) ? contrast : 2.2, 0.5, 6)
  return Math.pow(side, 1.5) * gain
}
