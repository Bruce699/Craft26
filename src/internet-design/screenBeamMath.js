// CPU reference for the GPU haze volume. Coordinates are in the aperture frame:
// X=frame.u, Y=frame.v, Z=frame.normal (positive Z points toward the viewer).
// `length` is the far Z measured from the screen, not from startDepth.
const vector = (value) => [value?.x ?? value?.[0], value?.y ?? value?.[1], value?.z ?? value?.[2]]
const finiteVector = (value) => value.every(Number.isFinite)

function dimensions(options = {}) {
  const halfWidth = options.halfWidth
  const halfHeight = options.halfHeight
  const length = options.length
  const startDepth = options.startDepth ?? 0
  const spread = options.spread ?? 0.2
  if (![halfWidth, halfHeight, length, startDepth, spread].every(Number.isFinite)
    || halfWidth <= 0 || halfHeight <= 0 || length <= 0
    || startDepth < 0 || startDepth >= length || spread < 0) return null
  return { halfWidth, halfHeight, length, startDepth, spread }
}

/** Clip a ray against a finite, expanding rectangular pyramid; return t>=0.
 * Direction need not be normalized: the returned interval uses its parameter.
 * Parallel rays, cameras inside the volume, and rays pointing away are handled.
 */
export function clipScreenBeamRay(origin, direction, options) {
  const o = vector(origin), d = vector(direction), bounds = dimensions(options)
  if (!bounds || !finiteVector(o) || !finiteVector(d)
    || Math.hypot(...d) < 1e-12) return null
  const { halfWidth, halfHeight, length, startDepth, spread } = bounds
  let near = 0, far = Infinity
  // Every plane has the form dot(n, point) <= offset. Clipping each interval
  // also works when the ray enters via a sloping side rather than a Z cap.
  const clip = (nx, ny, nz, offset) => {
    const distance = offset - (nx * o[0] + ny * o[1] + nz * o[2])
    const denominator = nx * d[0] + ny * d[1] + nz * d[2]
    if (Math.abs(denominator) < 1e-12) return distance >= 0
    const t = distance / denominator
    if (denominator > 0) far = Math.min(far, t)
    else near = Math.max(near, t)
    return far >= near
  }
  if (!clip(1, 0, -spread, halfWidth) || !clip(-1, 0, -spread, halfWidth)
    || !clip(0, 1, -spread, halfHeight) || !clip(0, -1, -spread, halfHeight)
    || !clip(0, 0, -1, -startDepth) || !clip(0, 0, 1, length)
    || !Number.isFinite(far) || far - near < 1e-10) return null
  return [near, far]
}

// Back-project one expanding cross-section onto the displayed video. This is
// displayed-video UV, not the original model's reversed-X screen-mesh UV.
// The caller applies the player's crop/rotation matrix after converting mesh U.
// Deliberately not clamped: values outside [0,1] identify points outside the beam.
export function screenBeamSourceUv(point, options) {
  const p = vector(point), bounds = dimensions(options)
  if (!bounds || !finiteVector(p)) return null
  const halfWidth = bounds.halfWidth + bounds.spread * p[2]
  const halfHeight = bounds.halfHeight + bounds.spread * p[2]
  if (halfWidth <= 0 || halfHeight <= 0) return null
  return [0.5 + p[0] / (2 * halfWidth), 0.5 + p[1] / (2 * halfHeight)]
}
