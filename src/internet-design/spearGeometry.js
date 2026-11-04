import * as THREE from 'three'
import { createRockDeformer } from './rockGeometry.js'

const TIP = 55
const BASE = -29
const SHOULDER = -20
const HALF_SHOULDER = 23.5
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const smooth = (value) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t) }
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

function outlineHull(points) {
  points.sort((a, b) => a.x - b.x || a.y - b.y)
  const lower = [], upper = []
  for (const point of points) {
    while (lower.length > 1 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop()
    lower.push(point)
  }
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i]
    while (upper.length > 1 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop()
    upper.push(point)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

function horizontalRange(hull, y) {
  let low = Infinity, high = -Infinity
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length]
    if (y < Math.min(a.y, b.y) - 1e-7 || y > Math.max(a.y, b.y) + 1e-7) continue
    if (Math.abs(b.y - a.y) < 1e-8) { low = Math.min(low, a.x, b.x); high = Math.max(high, a.x, b.x); continue }
    const x = a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)
    low = Math.min(low, x); high = Math.max(high, x)
  }
  return [low, high]
}

/** A private knapped spear source, with the exact original player and recess.
 * Vertex/index/UV topology stays compatible with the existing editable deformer.
 */
export function createSpearGeometry(stoneGeometry, screenGeometry) {
  const guide = createRockDeformer(stoneGeometry, screenGeometry)
  const geometry = guide.geometry
  const position = geometry.attributes.position
  const source = new Float32Array(position.array)
  const sourceNormals = new Float32Array(geometry.attributes.normal.array)
  const { center, u, v, normal, halfWidth, halfHeight, collar, falloff } = guide.frame
  const count = position.count, points = [], local = new Float64Array(count * 3), protectedVertices = new Uint8Array(count)
  let minV = Infinity, maxV = -Infinity, minN = Infinity, maxN = -Infinity
  for (let i = 0; i < count; i++) {
    const k = i * 3, x = source[k] - center.x, y = source[k + 1] - center.y, z = source[k + 2] - center.z
    const a = x * u.x + y * u.y + z * u.z, b = x * v.x + y * v.y + z * v.z, d = x * normal.x + y * normal.y + z * normal.z
    local[k] = a; local[k + 1] = b; local[k + 2] = d
    points.push({ x: a, y: b })
    minV = Math.min(minV, b); maxV = Math.max(maxV, b); minN = Math.min(minN, d); maxN = Math.max(maxN, d)
    protectedVertices[i] = guide.protectionAt([source[k], source[k + 1], source[k + 2]]) === 1 ? 1 : 0
  }
  const hull = outlineHull(points), pinU = halfWidth + collar, pinV = halfHeight + collar
  const chipCenters = [-21, -11, 0, 11, 23, 36, 46]
  const flakeCenters = [-16, -4, 8, 20, 32, 43]
  for (let i = 0; i < count; i++) {
    if (protectedVertices[i]) continue
    const k = i * 3, a = local[k], b = local[k + 1], d = local[k + 2]
    let targetV = b
    if (b > pinV) targetV += (TIP - maxV) * smooth((b - pinV) / (maxV - pinV))
    else if (b < -pinV) targetV += (BASE - minV) * smooth((-b - pinV) / (-minV - pinV))

    // Keep a broad lower blade and taper both edges into a small real apex.
    let desiredHalf = targetV >= SHOULDER
      ? HALF_SHOULDER * clamp((TIP - targetV) / (TIP - SHOULDER), 0, 1)
      : THREE.MathUtils.lerp(16, HALF_SHOULDER, clamp((targetV - BASE) / (SHOULDER - BASE), 0, 1))
    desiredHalf = Math.max(0.16, desiredHalf)
    const pinAmount = 1 - smooth((Math.abs(b) - pinV) / (falloff * 3))
    const hinge = pinU * pinAmount
    const [left, right] = horizontalRange(hull, b)
    const shift = (left + right) * 0.5 * (1 - pinAmount)
    const relativeU = a - shift, side = relativeU < 0 ? -1 : 1
    let chips = 0
    for (let j = 0; j < chipCenters.length; j++) {
      const staggeredCenter = chipCenters[j] + (side > 0 ? 1.4 : -0.8)
      chips += Math.max(0, 1 - Math.abs(targetV - staggeredCenter) / (2.2 + j % 2)) * (0.35 + (j * 7 % 5) * 0.16)
    }
    desiredHalf = Math.max(hinge + (hinge > 0.1 ? 1.8 : 0.16), desiredHalf - chips)
    const sourceRadius = Math.max(0.05, side < 0 ? shift - left : right - shift)
    const magnitude = Math.abs(relativeU)
    const targetU = side * (magnitude <= hinge ? magnitude
      : hinge + (magnitude - hinge) * (desiredHalf - hinge) / Math.max(0.05, sourceRadius - hinge))

    // Lenticular blade cross section, central ridge, and broad triangular flake
    // scars. Their planar ramps create knapped facets instead of tiny noise.
    const bladeCoordinate = clamp(Math.abs(targetU) / Math.max(desiredHalf, 0.16), 0, 1)
    const tipThin = clamp((TIP - targetV) / 18, 0.12, 1)
    const thickness = (0.35 + 5.7 * (1 - bladeCoordinate)) * tipThin
    const depthFraction = clamp((d - minN) / (maxN - minN), 0, 1)
    let targetN = -3 + (depthFraction * 2 - 1) * thickness
    let flakes = 0
    for (let j = 0; j < flakeCenters.length; j++) {
      const flakeSide = j % 2 ? -1 : 1
      const centerU = flakeSide * desiredHalf * (0.46 + (j % 3) * 0.07)
      const centerV = flakeCenters[j] + (side > 0 ? 1.2 : 0)
      flakes += Math.max(0, 1 - Math.abs(targetU - centerU) / Math.max(2.4, desiredHalf * 0.5) - Math.abs(targetV - centerV) / 7.5) * (0.65 + (j % 3) * 0.22)
    }
    const flakeDepth = Math.min(flakes * 2, thickness * 0.7)
    targetN -= flakeDepth * (depthFraction * 2 - 1)
    const protection = guide.protectionAt([source[k], source[k + 1], source[k + 2]])
    const depthBlend = 1 - protection
    const da = targetU - a, db = targetV - b, dd = (targetN - d) * depthBlend
    position.array[k] = source[k] + u.x * da + v.x * db + normal.x * dd
    position.array[k + 1] = source[k + 1] + u.y * da + v.y * db + normal.y * dd
    position.array[k + 2] = source[k + 2] + u.z * da + v.z * db + normal.z * dd
  }

  geometry.computeVertexNormals()
  const normals = geometry.attributes.normal.array, groups = new Map()
  for (let i = 0; i < count; i++) {
    const k = i * 3, key = `${Math.round(source[k] * 10000)},${Math.round(source[k + 1] * 10000)},${Math.round(source[k + 2] * 10000)}`
    const group = groups.get(key)
    if (group) group.push(i)
    else groups.set(key, [i])
  }
  for (const group of groups.values()) if (group.length > 1) {
    let x = 0, y = 0, z = 0
    for (const i of group) { const k = i * 3; x += normals[k]; y += normals[k + 1]; z += normals[k + 2] }
    const inverseLength = 1 / (Math.hypot(x, y, z) || 1)
    for (const i of group) { const k = i * 3; normals[k] = x * inverseLength; normals[k + 1] = y * inverseLength; normals[k + 2] = z * inverseLength }
  }
  for (let i = 0; i < count; i++) if (protectedVertices[i]) {
    const k = i * 3; normals[k] = sourceNormals[k]; normals[k + 1] = sourceNormals[k + 1]; normals[k + 2] = sourceNormals[k + 2]
  }
  geometry.attributes.position.needsUpdate = true
  geometry.attributes.normal.needsUpdate = true
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  geometry.name = 'Knapped stone spear with protected video recess'
  geometry.userData.spear = { tip: TIP, base: BASE, shoulder: SHOULDER, protectedVertices: protectedVertices.reduce((sum, value) => sum + value, 0) }
  return geometry
}
