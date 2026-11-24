import * as THREE from 'three'

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const smooth = (value) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t) }
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback
const SAMPLES = 768
const TIP_FADE = 1
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

function sectionTable(hull, axis) {
  const other = axis === 'x' ? 'y' : 'x'
  let min = Infinity, max = -Infinity
  for (const point of hull) { min = Math.min(min, point[other]); max = Math.max(max, point[other]) }
  const low = new Float64Array(SAMPLES + 1), high = new Float64Array(SAMPLES + 1)
  for (let sample = 0; sample <= SAMPLES; sample++) {
    const coordinate = min + (max - min) * sample / SAMPLES
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length]
      if (coordinate < Math.min(a[other], b[other]) - 1e-9 || coordinate > Math.max(a[other], b[other]) + 1e-9) continue
      if (Math.abs(a[other] - b[other]) < 1e-12) { lo = Math.min(lo, a[axis], b[axis]); hi = Math.max(hi, a[axis], b[axis]); continue }
      const value = a[axis] + (b[axis] - a[axis]) * (coordinate - a[other]) / (b[other] - a[other])
      lo = Math.min(lo, value); hi = Math.max(hi, value)
    }
    low[sample] = lo; high[sample] = hi
  }
  return { min, max, low, high }
}

function boundsAt(table, coordinate, output) {
  if (coordinate < table.min || coordinate > table.max) return false
  const index = clamp((coordinate - table.min) / (table.max - table.min) * SAMPLES, 0, SAMPLES)
  const left = Math.min(SAMPLES - 1, Math.floor(index)), t = index - left
  output[0] = table.low[left] + (table.low[left + 1] - table.low[left]) * t
  output[1] = table.high[left] + (table.high[left + 1] - table.high[left]) * t
  return Number.isFinite(output[0] + output[1])
}

// Monotone Hermite transition: positive derivatives prevent axis foldovers.
function transition(t, from, to, span, innerSlope) {
  const secant = (to - from) / span
  let m0 = Math.min(innerSlope, secant * 2.9), m1 = Math.min(1, secant * 2.9)
  if (m0 + m1 > secant * 3) { const scale = secant * 3 / (m0 + m1); m0 *= scale; m1 *= scale }
  const t2 = t * t, t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * from + (t3 - 2 * t2 + t) * span * m0
    + (-2 * t3 + 3 * t2) * to + (t3 - t2) * span * m1
}

/**
 * A centered, reversible window warp on top of a canonical rock deformer.
 * Brush history is canonical: convert a displayed hit and radius exactly once
 * with toCanonical()/radiusToCanonical(), then pass them to sculpt()/apply().
 */
export function createVideoWindowDeformer(baseDeformer, originalScreenGeometry) {
  const geometry = baseDeformer.geometry.clone()
  const screenGeometry = originalScreenGeometry.clone()
  const sourceScreen = new Float32Array(originalScreenGeometry.attributes.position.array)
  const { center, u, v, halfWidth, halfHeight } = baseDeformer.frame
  const baseAspect = halfWidth / halfHeight
  const count = geometry.attributes.position.count
  const points = Array.from({ length: count }, (_, index) => ({ index, x: 0, y: 0 }))
  // Strong body forms may narrow their inset hull around the pinned window.
  // Reserve its source collar so resizing still has a valid linear core; these
  // support points never become mesh vertices or alter the canonical rock.
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    points.push({ index: -1, x: x * (halfWidth + TIP_FADE + 0.12), y: y * (halfHeight + TIP_FADE + 0.12) })
  }
  const bounds = new Float64Array(2), coordinates = new Float64Array(2)
  let tableU, tableV, hull = []
  let requestedWidth = 1, requestedHeight = 1, width = 1, height = 1

  const groups = new Map()
  const initial = geometry.attributes.position.array
  for (let i = 0; i < count; i++) {
    const k = i * 3, key = `${Math.round(initial[k] * 10000)},${Math.round(initial[k + 1] * 10000)},${Math.round(initial[k + 2] * 10000)}`
    const group = groups.get(key)
    if (group) group.push(i)
    else groups.set(key, [i])
  }
  const seams = [...groups.values()].filter((group) => group.length > 1)

  function rebuildBoundary() {
    const source = baseDeformer.geometry.attributes.position.array
    for (const point of points) {
      if (point.index < 0) continue
      const k = point.index * 3, x = source[k] - center.x, y = source[k + 1] - center.y, z = source[k + 2] - center.z
      // An inset hull leaves an unchanged band around the complete outer contour.
      point.x = (x * u.x + y * u.y + z * u.z) * 0.94
      point.y = (x * v.x + y * v.y + z * v.z) * 0.94
    }
    // Reusing the previous sort order makes local sculpt updates nearly sorted.
    points.sort((a, b) => a.x - b.x || a.y - b.y)
    const lower = [], upper = []
    for (const point of points) { while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop(); lower.push(point) }
    for (let i = points.length - 1; i >= 0; i--) { const point = points[i]; while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop(); upper.push(point) }
    hull = lower.slice(0, -1).concat(upper.slice(0, -1))
    tableU = sectionTable(hull, 'x'); tableV = sectionTable(hull, 'y')
    fitWindow()
  }

  function contains(a, b, margin = 0.08) {
    if (!boundsAt(tableU, b, bounds)) return false
    return a > bounds[0] + margin && a < bounds[1] - margin
  }

  function fits(w, h) {
    // Test both the intermediate horizontal warp and the final rectangle.
    for (const x of [-1, 1]) for (const y of [-1, 1]) {
      if (!contains(x * Math.max(halfWidth, halfWidth * w), y * halfHeight, TIP_FADE + 0.08)) return false
      // Both source and target intervals need a full collar transition, including
      // a contraction whose target is smaller than its source interval.
      if (!boundsAt(tableV, x * halfWidth * w, bounds)) return false
      if (-bounds[0] < Math.max(halfHeight, halfHeight * h) + TIP_FADE + 0.08
        || bounds[1] < Math.max(halfHeight, halfHeight * h) + TIP_FADE + 0.08) return false
    }
    return true
  }

  function fitWindow() {
    width = requestedWidth; height = requestedHeight
    if (fits(width, height)) return
    // An enlarged rectangle must fit the existing stone. Uniform fitting retains
    // the requested aspect rather than pushing its corners through the outline.
    let low = 0.05, high = 1
    for (let i = 0; i < 20; i++) {
      const scale = (low + high) / 2
      if (fits(requestedWidth * scale, requestedHeight * scale)) low = scale
      else high = scale
    }
    width = requestedWidth * low; height = requestedHeight * low
  }

  function axis(value, other, table, core, scale, inverse = false) {
    if (Math.abs(scale - 1) < 1e-12 || !boundsAt(table, other, bounds) || bounds[0] >= 0 || bounds[1] <= 0 || value <= bounds[0] || value >= bounds[1]) return value
    const sign = value < 0 ? -1 : 1, radius = Math.abs(value), boundary = sign < 0 ? -bounds[0] : bounds[1]
    if (boundary <= core + 1e-8) return value
    // Fade to identity near the support polygon's tips, where a full window-width
    // interval does not fit; every actual screen row/column retains full scaling.
    const available = Math.min(-bounds[0], bounds[1])
    const blend = smooth((available - core * Math.max(1, scale)) / TIP_FADE)
    const localScale = 1 + (scale - 1) * blend
    if (Math.abs(localScale - 1) < 1e-12) return value
    const target = core * localScale
    if (inverse) {
      if (radius <= target) return value / localScale
      let low = 0, high = 1
      for (let i = 0; i < 22; i++) {
        const t = (low + high) / 2
        if (transition(t, target, boundary, boundary - core, localScale) < radius) low = t
        else high = t
      }
      return sign * (core + (boundary - core) * (low + high) / 2)
    }
    if (radius <= core) return value * localScale
    return sign * transition((radius - core) / (boundary - core), target, boundary, boundary - core, localScale)
  }

  function map(a, b, inverse = false) {
    if (inverse) {
      const originalB = axis(b, a, tableV, halfHeight, height, true)
      coordinates[0] = axis(a, originalB, tableU, halfWidth, width, true)
      coordinates[1] = originalB
    } else {
      const nextA = axis(a, b, tableU, halfWidth, width)
      coordinates[0] = nextA
      coordinates[1] = axis(b, nextA, tableV, halfHeight, height)
    }
  }

  function transformPoint(point, inverse) {
    const x = point.x ?? point[0], y = point.y ?? point[1], z = point.z ?? point[2]
    const dx = x - center.x, dy = y - center.y, dz = z - center.z
    const a = dx * u.x + dy * u.y + dz * u.z, b = dx * v.x + dy * v.y + dz * v.z
    map(a, b, inverse)
    return new THREE.Vector3(x, y, z).addScaledVector(u, coordinates[0] - a).addScaledVector(v, coordinates[1] - b)
  }

  function warpPositions(source, output) {
    for (let k = 0; k < source.length; k += 3) {
      const x = source[k] - center.x, y = source[k + 1] - center.y, z = source[k + 2] - center.z
      const a = x * u.x + y * u.y + z * u.z, b = x * v.x + y * v.y + z * v.z
      map(a, b)
      const da = coordinates[0] - a, db = coordinates[1] - b
      output[k] = source[k] + u.x * da + v.x * db
      output[k + 1] = source[k + 1] + u.y * da + v.y * db
      output[k + 2] = source[k + 2] + u.z * da + v.z * db
    }
  }

  function refresh() {
    const identity = Math.abs(width - 1) < 1e-12 && Math.abs(height - 1) < 1e-12
    if (identity) {
      geometry.attributes.position.array.set(baseDeformer.geometry.attributes.position.array)
      geometry.attributes.normal.array.set(baseDeformer.geometry.attributes.normal.array)
      screenGeometry.attributes.position.array.set(sourceScreen)
      screenGeometry.attributes.normal.array.set(originalScreenGeometry.attributes.normal.array)
    } else {
      warpPositions(baseDeformer.geometry.attributes.position.array, geometry.attributes.position.array)
      warpPositions(sourceScreen, screenGeometry.attributes.position.array)
      geometry.computeVertexNormals(); screenGeometry.computeVertexNormals()
      const normals = geometry.attributes.normal.array
      for (const group of seams) {
        let x = 0, y = 0, z = 0
        for (const i of group) { const k = i * 3; x += normals[k]; y += normals[k + 1]; z += normals[k + 2] }
        const inverseLength = 1 / (Math.hypot(x, y, z) || 1)
        for (const i of group) { const k = i * 3; normals[k] = x * inverseLength; normals[k + 1] = y * inverseLength; normals[k + 2] = z * inverseLength }
      }
    }
    for (const target of [geometry, screenGeometry]) {
      target.attributes.position.needsUpdate = true; target.attributes.normal.needsUpdate = true
      target.computeBoundingBox(); target.computeBoundingSphere()
    }
    return geometry
  }

  rebuildBoundary(); refresh()
  return {
    geometry, screenGeometry,
    get frame() { return baseDeformer.frame },
    get anchor() { return baseDeformer.anchor },
    get baseAspect() { return baseAspect },
    get aspect() { return baseAspect * width / height },
    get window() { return { width, height, requestedWidth, requestedHeight } },
    setWindow(settings = {}) {
      requestedWidth = clamp(finite(settings.width, requestedWidth), 0.45, 1.3)
      requestedHeight = clamp(finite(settings.height, requestedHeight), 0.45, 1.3)
      fitWindow(); return refresh()
    },
    apply(shape, canonicalStrokes) { baseDeformer.apply(shape, canonicalStrokes); rebuildBoundary(); return refresh() },
    sculpt(canonicalStroke) { baseDeformer.sculpt(canonicalStroke); rebuildBoundary(); return refresh() },
    toCanonical(point) { return transformPoint(point, true) },
    toWindow(point) { return transformPoint(point, false) },
    radiusToCanonical(radius, atPoint) {
      const point = new THREE.Vector3(atPoint.x ?? atPoint[0], atPoint.y ?? atPoint[1], atPoint.z ?? atPoint[2])
      const origin = transformPoint(point, true), epsilon = 0.01
      const a = transformPoint(point.clone().addScaledVector(u, epsilon), true).distanceTo(origin) / epsilon
      const b = transformPoint(point.clone().addScaledVector(v, epsilon), true).distanceTo(origin) / epsilon
      return radius * Math.sqrt(a * b)
    },
    protectionAt(point) { return baseDeformer.protectionAt(transformPoint(point, true)) },
    dispose() { geometry.dispose(); screenGeometry.dispose(); baseDeformer.dispose() },
  }
}
