import * as THREE from 'three'

export const ROCK_SHAPE_DEFAULTS = Object.freeze({
  width: 1, height: 1, depth: 1,
  angularity: 0, asymmetry: 0,
  ridges: 0, ridgeScale: 2,
  dents: 0, dentScale: 2,
  seed: 26, top: 0, right: 0, bottom: 0, left: 0,
  bendX: 0, bendY: 0, twist: 0, taperTop: 0, taperBottom: 0,
  skewX: 0, skewY: 0, bulge: 0,
  topRight: 0, bottomRight: 0, bottomLeft: 0, topLeft: 0,
})

const FORM_FIELDS = ['bendX', 'bendY', 'twist', 'taperTop', 'taperBottom', 'skewX', 'skewY', 'bulge', 'topRight', 'bottomRight', 'bottomLeft', 'topLeft']

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback
const smoothstep = (value) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t) }

function readShape(input) {
  const shape = { ...ROCK_SHAPE_DEFAULTS }
  for (const key of ['width', 'height']) shape[key] = clamp(finite(input[key], 1), 0.5, 2.1)
  shape.depth = clamp(finite(input.depth, 1), 0.4, 2)
  for (const key of ['angularity', 'asymmetry', 'ridges', 'dents']) shape[key] = clamp(finite(input[key], 0), 0, 1)
  for (const key of ['ridgeScale', 'dentScale']) shape[key] = clamp(finite(input[key], 2), 1, 5)
  for (const key of ['top', 'right', 'bottom', 'left']) shape[key] = clamp(finite(input[key], 0), -1, 1)
  for (const key of FORM_FIELDS) shape[key] = clamp(finite(input[key], 0), -1, 1)
  shape.seed = Math.trunc(finite(input.seed, 26)) | 0
  return shape
}

function lattice(x, y, z, seed) {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(seed, 1274126177)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295
}

// Seeded trilinear value noise: nearby vertices share one continuous field.
function noise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z)
  const fx = smoothstep(x - ix), fy = smoothstep(y - iy), fz = smoothstep(z - iz)
  const a = lattice(ix, iy, iz, seed), b = lattice(ix + 1, iy, iz, seed)
  const c = lattice(ix, iy + 1, iz, seed), d = lattice(ix + 1, iy + 1, iz, seed)
  const e = lattice(ix, iy, iz + 1, seed), f = lattice(ix + 1, iy, iz + 1, seed)
  const g = lattice(ix, iy + 1, iz + 1, seed), h = lattice(ix + 1, iy + 1, iz + 1, seed)
  const low = a + (b - a) * fx + (c + (d - c) * fx - a - (b - a) * fx) * fy
  const high = e + (f - e) * fx + (g + (h - g) * fx - e - (f - e) * fx) * fy
  return (low + (high - low) * fz) * 2 - 1
}

function apertureFrame(screenGeometry) {
  const position = screenGeometry.getAttribute('position')
  const uv = screenGeometry.getAttribute('uv')
  const normals = screenGeometry.getAttribute('normal')
  if (!position || !uv) throw new Error('The video aperture needs position and UV attributes.')
  const center = new THREE.Vector3()
  const normal = new THREE.Vector3()
  let meanU = 0, meanV = 0
  for (let i = 0; i < position.count; i++) {
    center.x += position.getX(i); center.y += position.getY(i); center.z += position.getZ(i)
    meanU += uv.getX(i); meanV += uv.getY(i)
    if (normals) { normal.x += normals.getX(i); normal.y += normals.getY(i); normal.z += normals.getZ(i) }
  }
  center.divideScalar(position.count)
  meanU /= position.count; meanV /= position.count
  const pu = new THREE.Vector3(), pv = new THREE.Vector3()
  let uu = 0, vv = 0, uvCovariance = 0
  for (let i = 0; i < position.count; i++) {
    const du = uv.getX(i) - meanU, dv = uv.getY(i) - meanV
    const x = position.getX(i) - center.x, y = position.getY(i) - center.y, z = position.getZ(i) - center.z
    uu += du * du; vv += dv * dv; uvCovariance += du * dv
    pu.x += x * du; pu.y += y * du; pu.z += z * du
    pv.x += x * dv; pv.y += y * dv; pv.z += z * dv
  }
  const determinant = uu * vv - uvCovariance * uvCovariance
  if (Math.abs(determinant) < 1e-12) throw new Error('The video aperture has degenerate UVs.')
  const physicalU = pu.clone().multiplyScalar(vv).addScaledVector(pv, -uvCovariance).divideScalar(determinant)
  const physicalV = pv.clone().multiplyScalar(uu).addScaledVector(pu, -uvCovariance).divideScalar(determinant)
  center.addScaledVector(physicalU, 0.5 - meanU).addScaledVector(physicalV, 0.5 - meanV)
  if (normal.lengthSq() < 1e-12) normal.crossVectors(physicalV, physicalU)
  normal.normalize()
  const u = physicalU.clone().normalize()
  // The display's Y=PI group mirrors model X. These axes follow visible right/top.
  if (u.x > 0) u.negate()
  const v = new THREE.Vector3().crossVectors(normal, u).normalize()
  if (v.dot(physicalV) < 0) v.negate()
  let halfWidth = 0, halfHeight = 0
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) - center.x, y = position.getY(i) - center.y, z = position.getZ(i) - center.z
    halfWidth = Math.max(halfWidth, Math.abs(x * u.x + y * u.y + z * u.z))
    halfHeight = Math.max(halfHeight, Math.abs(x * v.x + y * v.y + z * v.z))
  }
  const apertureSize = Math.min(halfWidth, halfHeight) * 2
  return { center, u, v, normal, halfWidth, halfHeight, collar: apertureSize * 0.08, falloff: apertureSize * 0.12 }
}

/**
 * Deforms a private geometry in original model coordinates. The video anchor and
 * the entire tilted recess column stay fixed. apply() always rebuilds from source;
 * sculpt() adds one dab to the current result without replaying stroke history.
 */
export function createRockDeformer(stoneGeometry, screenGeometry) {
  if (!stoneGeometry.getAttribute('position')) throw new Error('The stone needs a position attribute.')
  const geometry = stoneGeometry.clone()
  const position = geometry.getAttribute('position')
  position.setUsage(THREE.DynamicDrawUsage)
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const base = new Float32Array(position.array)
  const originalNormals = new Float32Array(geometry.getAttribute('normal').array)
  const shapedBase = new Float32Array(base)
  const safetyOrigin = new Float32Array(base.length), safetyTarget = new Float32Array(base.length)
  const count = position.count
  const frame = apertureFrame(screenGeometry)
  const { center, u, v, normal, halfWidth, halfHeight, collar, falloff } = frame
  const protection = new Float32Array(count)
  const localU = new Float32Array(count), localV = new Float32Array(count), localN = new Float32Array(count)
  let extentU = 0, extentV = 0, extentN = 0
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  const distanceOutsideAperture = (x, y, z) => {
    const dx = x - center.x, dy = y - center.y, dz = z - center.z
    const a = Math.max(0, Math.abs(dx * u.x + dy * u.y + dz * u.z) - halfWidth)
    const b = Math.max(0, Math.abs(dx * v.x + dy * v.y + dz * v.z) - halfHeight)
    return Math.hypot(a, b)
  }
  const protectionXYZ = (x, y, z) => 1 - smoothstep((distanceOutsideAperture(x, y, z) - collar) / falloff)
  const protectionAt = (point) => protectionXYZ(point.x ?? point[0], point.y ?? point[1], point.z ?? point[2])

  for (let i = 0; i < count; i++) {
    const k = i * 3, x = base[k], y = base[k + 1], z = base[k + 2]
    const dx = x - center.x, dy = y - center.y, dz = z - center.z
    localU[i] = dx * u.x + dy * u.y + dz * u.z
    localV[i] = dx * v.x + dy * v.y + dz * v.z
    localN[i] = dx * normal.x + dy * normal.y + dz * normal.z
    extentU = Math.max(extentU, Math.abs(localU[i])); extentV = Math.max(extentV, Math.abs(localV[i])); extentN = Math.max(extentN, Math.abs(localN[i]))
    protection[i] = protectionXYZ(x, y, z)
    minX = Math.min(minX, x); minY = Math.min(minY, y); minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); maxZ = Math.max(maxZ, z)
  }
  const unit = Math.min(maxX - minX, maxY - minY, maxZ - minZ)
  const shapeCap = unit * 0.32, sculptCap = Math.max(12, unit * 0.48)
  const indices = geometry.index?.array
  const triangleCount = Math.floor((indices?.length ?? count) / 3)
  const faceDirections = new Float64Array(triangleCount * 4)
  let lastSafetyScale = 1, lastSafetyAverage = 1
  for (let face = 0; face < triangleCount; face++) {
    const t = face * 3
    const a = (indices ? indices[t] : t) * 3, b = (indices ? indices[t + 1] : t + 1) * 3, c = (indices ? indices[t + 2] : t + 2) * 3
    const bx = base[b] - base[a], by = base[b + 1] - base[a + 1], bz = base[b + 2] - base[a + 2]
    const cx = base[c] - base[a], cy = base[c + 1] - base[a + 1], cz = base[c + 2] - base[a + 2]
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx, k = face * 4
    faceDirections[k] = nx; faceDirections[k + 1] = ny; faceDirections[k + 2] = nz; faceDirections[k + 3] = nx * nx + ny * ny + nz * nz
  }
  const originalFaceDirections = new Float64Array(faceDirections)
  let expressive = false, gestureId = null, gestureMode = null, flowSteps = 0
  const gestureWeights = new Float32Array(count)

  function referenceDirections(from) {
    for (let face = 0; face < triangleCount; face++) {
      const t = face * 3, k = face * 4
      const a = (indices ? indices[t] : t) * 3, b = (indices ? indices[t + 1] : t + 1) * 3, c = (indices ? indices[t + 2] : t + 2) * 3
      const bx = from[b] - from[a], by = from[b + 1] - from[a + 1], bz = from[b + 2] - from[a + 2]
      const cx = from[c] - from[a], cy = from[c + 1] - from[a + 1], cz = from[c + 2] - from[a + 2]
      const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx
      faceDirections[k] = nx; faceDirections[k + 1] = ny; faceDirections[k + 2] = nz; faceDirections[k + 3] = nx * nx + ny * ny + nz * nz
    }
  }

  function trianglesRemainOriented(markFailures = false) {
    const output = position.array
    let safe = true
    for (let face = 0; face < triangleCount; face++) {
      const k = face * 4
      if (faceDirections[k + 3] < 1e-12) continue
      const t = face * 3
      const a = (indices ? indices[t] : t) * 3, b = (indices ? indices[t + 1] : t + 1) * 3, c = (indices ? indices[t + 2] : t + 2) * 3
      const bx = output[b] - output[a], by = output[b + 1] - output[a + 1], bz = output[b + 2] - output[a + 2]
      const cx = output[c] - output[a], cy = output[c + 1] - output[a + 1], cz = output[c + 2] - output[a + 2]
      const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx
      const dot = faceDirections[k] * nx + faceDirections[k + 1] * ny + faceDirections[k + 2] * nz
      if (dot < faceDirections[k + 3] * 0.015 || nx * nx + ny * ny + nz * nz < originalFaceDirections[k + 3] * 1e-5) {
        if (!markFailures) return false
        safe = false
        unsafeGroups[weldIndex[a / 3]] = 1
        unsafeGroups[weldIndex[b / 3]] = 1
        unsafeGroups[weldIndex[c / 3]] = 1
      }
    }
    return safe
  }

  function guardTriangles(from) {
    lastSafetyScale = 1; lastSafetyAverage = 1
    if (trianglesRemainOriented()) return
    safetyTarget.set(position.array)
    groupSafety.fill(1)
    // Restrict only folded faces and their immediate neighbors. One tiny face
    // cannot suppress a width change across the entire rock.
    for (let pass = 0; pass < 18; pass++) {
      unsafeGroups.fill(0)
      if (trianglesRemainOriented(true)) break
      nextGroupSafety.set(groupSafety)
      for (let group = 0; group < weldGroups.length; group++) if (unsafeGroups[group]) {
        nextGroupSafety[group] = groupSafety[group] * 0.5
      }
      for (let group = 0; group < weldGroups.length; group++) if (unsafeGroups[group]) {
        const neighborCap = Math.min(1, nextGroupSafety[group] + 0.25)
        for (let j = neighborOffsets[group]; j < neighborOffsets[group + 1]; j++) {
          const neighbor = weldIndex[neighbors[j]]
          nextGroupSafety[neighbor] = Math.min(nextGroupSafety[neighbor], neighborCap)
        }
      }
      groupSafety.set(nextGroupSafety)
      for (let i = 0; i < count; i++) {
        const amount = groupSafety[weldIndex[i]], k = i * 3
        position.array[k] = from[k] + (safetyTarget[k] - from[k]) * amount
        position.array[k + 1] = from[k + 1] + (safetyTarget[k + 1] - from[k + 1]) * amount
        position.array[k + 2] = from[k + 2] + (safetyTarget[k + 2] - from[k + 2]) * amount
      }
    }
    let total = 0
    for (let i = 0; i < count; i++) { const amount = groupSafety[weldIndex[i]]; total += amount; lastSafetyScale = Math.min(lastSafetyScale, amount) }
    lastSafetyAverage = total / count
    if (trianglesRemainOriented()) return
    // A final conservative fallback keeps pathological input safe as well.
    safetyTarget.set(position.array)
    let low = 0, high = 1
    for (let step = 0; step < 14; step++) {
      const amount = (low + high) / 2
      for (let i = 0; i < base.length; i++) position.array[i] = from[i] + (safetyTarget[i] - from[i]) * amount
      if (trianglesRemainOriented()) low = amount
      else high = amount
    }
    lastSafetyScale *= low; lastSafetyAverage *= low
    for (let i = 0; i < base.length; i++) position.array[i] = from[i] + (safetyTarget[i] - from[i]) * low
  }

  // Average normals at UV seam duplicates without merging the atlas topology.
  const groups = new Map()
  for (let i = 0; i < count; i++) {
    const k = i * 3
    const key = `${Math.round(base[k] * 10000)},${Math.round(base[k + 1] * 10000)},${Math.round(base[k + 2] * 10000)}`
    const group = groups.get(key)
    if (group) group.push(i)
    else groups.set(key, [i])
  }
  const weldGroups = [...groups.values()]
  const seamGroups = weldGroups.filter((group) => group.length > 1)
  const weldIndex = new Uint32Array(count)
  for (let group = 0; group < weldGroups.length; group++) for (const i of weldGroups[group]) weldIndex[i] = group
  const neighborSets = weldGroups.map(() => new Set())
  for (let face = 0; face < triangleCount; face++) {
    const t = face * 3
    const a = weldIndex[indices ? indices[t] : t], b = weldIndex[indices ? indices[t + 1] : t + 1], c = weldIndex[indices ? indices[t + 2] : t + 2]
    if (a !== b) { neighborSets[a].add(b); neighborSets[b].add(a) }
    if (b !== c) { neighborSets[b].add(c); neighborSets[c].add(b) }
    if (c !== a) { neighborSets[c].add(a); neighborSets[a].add(c) }
  }
  const neighborOffsets = new Uint32Array(weldGroups.length + 1)
  for (let i = 0; i < weldGroups.length; i++) neighborOffsets[i + 1] = neighborOffsets[i] + neighborSets[i].size
  const neighbors = new Uint32Array(neighborOffsets[weldGroups.length])
  for (let i = 0; i < weldGroups.length; i++) {
    let cursor = neighborOffsets[i]
    for (const group of neighborSets[i]) neighbors[cursor++] = weldGroups[group][0]
  }
  const groupSafety = new Float32Array(weldGroups.length), nextGroupSafety = new Float32Array(weldGroups.length)
  const unsafeGroups = new Uint8Array(weldGroups.length)

  function finish(preserveOriginalNormals = false, updateBounds = true) {
    position.needsUpdate = true
    if (preserveOriginalNormals) geometry.getAttribute('normal').array.set(originalNormals)
    else {
      geometry.computeVertexNormals()
      const normals = geometry.getAttribute('normal').array
      for (const group of seamGroups) {
        let x = 0, y = 0, z = 0
        for (const i of group) { const k = i * 3; x += normals[k]; y += normals[k + 1]; z += normals[k + 2] }
        const inverseLength = 1 / (Math.hypot(x, y, z) || 1)
        x *= inverseLength; y *= inverseLength; z *= inverseLength
        for (const i of group) { const k = i * 3; normals[k] = x; normals[k + 1] = y; normals[k + 2] = z }
      }
      // Collar normals are part of the protected recess finish as well.
      for (let i = 0; i < count; i++) if (protection[i] === 1) {
        const k = i * 3; normals[k] = originalNormals[k]; normals[k + 1] = originalNormals[k + 1]; normals[k + 2] = originalNormals[k + 2]
      }
    }
    geometry.getAttribute('normal').needsUpdate = true
    if (updateBounds) { geometry.computeBoundingBox(); geometry.computeBoundingSphere() }
    return geometry
  }

  function writeSafe(i, fromX, fromY, fromZ, toX, toY, toZ) {
    const k = i * 3
    if (protection[i] === 1) { position.array[k] = base[k]; position.array[k + 1] = base[k + 1]; position.array[k + 2] = base[k + 2]; return }
    // A contraction or brush stroke must never drag an outer vertex into the hole.
    if (distanceOutsideAperture(toX, toY, toZ) < collar) {
      let low = 0, high = 1
      for (let step = 0; step < 16; step++) {
        const t = (low + high) / 2
        const distance = distanceOutsideAperture(fromX + (toX - fromX) * t, fromY + (toY - fromY) * t, fromZ + (toZ - fromZ) * t)
        if (distance >= collar) low = t
        else high = t
      }
      toX = fromX + (toX - fromX) * low; toY = fromY + (toY - fromY) * low; toZ = fromZ + (toZ - fromZ) * low
    }
    position.array[k] = toX; position.array[k + 1] = toY; position.array[k + 2] = toZ
  }

  const flowVector = new Float64Array(3)

  function integrateFlow(velocity, distance, capSculpt = false) {
    const steps = clamp(Math.ceil(distance / 0.85), 1, 40), dt = 1 / steps
    expressive = true
    for (let step = 0; step < steps; step++) {
      safetyOrigin.set(position.array)
      // A large organic bend may legitimately rotate normals beyond 90 degrees.
      // Compare each small flow step to its immediate predecessor instead.
      referenceDirections(safetyOrigin)
      for (let i = 0; i < count; i++) {
        if (protection[i] === 1) continue
        const k = i * 3, x = safetyOrigin[k], y = safetyOrigin[k + 1], z = safetyOrigin[k + 2]
        velocity(i, x, y, z, flowVector)
        const influence = (1 - protection[i]) * (1 - protectionXYZ(x, y, z))
        let dx = flowVector[0] * dt * influence, dy = flowVector[1] * dt * influence, dz = flowVector[2] * dt * influence
        const length = Math.hypot(dx, dy, dz)
        if (length > 0.65) { const factor = 0.65 / length; dx *= factor; dy *= factor; dz *= factor }
        let tx = x + dx, ty = y + dy, tz = z + dz
        if (capSculpt) {
          const ox = tx - shapedBase[k], oy = ty - shapedBase[k + 1], oz = tz - shapedBase[k + 2]
          const offset = Math.hypot(ox, oy, oz), cap = sculptCap * (1 - protection[i])
          if (offset > cap) { const factor = cap / offset; tx = shapedBase[k] + ox * factor; ty = shapedBase[k + 1] + oy * factor; tz = shapedBase[k + 2] + oz * factor }
        }
        writeSafe(i, x, y, z, tx, ty, tz)
      }
      guardTriangles(safetyOrigin)
      flowSteps++
    }
  }

  function applyFormFlow(shape) {
    const logW = Math.log(shape.width / clamp(shape.width, 0.8, 1.35))
    const logH = Math.log(shape.height / clamp(shape.height, 0.8, 1.35))
    const logD = Math.log(shape.depth / clamp(shape.depth, 0.8, 1.35))
    const sectors = [shape.right, shape.topRight, shape.top, shape.topLeft, shape.left, shape.bottomLeft, shape.bottom, shape.bottomRight]
    const directions = [[1, 0], [Math.SQRT1_2, Math.SQRT1_2], [0, 1], [-Math.SQRT1_2, Math.SQRT1_2], [-1, 0], [-Math.SQRT1_2, -Math.SQRT1_2], [0, -1], [Math.SQRT1_2, -Math.SQRT1_2]]
    const activity = Math.abs(logW) + Math.abs(logH) + Math.abs(logD)
      + FORM_FIELDS.reduce((sum, key) => sum + Math.abs(shape[key]), 0)
      + Math.abs(shape.top) + Math.abs(shape.right) + Math.abs(shape.bottom) + Math.abs(shape.left)
    if (activity < 1e-12) return
    integrateFlow((i, x, y, z, output) => {
      const px = x - center.x, py = y - center.y, pz = z - center.z
      const a = px * u.x + py * u.y + pz * u.z, b = px * v.x + py * v.y + pz * v.z, c = px * normal.x + py * normal.y + pz * normal.z
      let du = a * logW + shape.bendX * unit * 0.65 * (b / extentV) ** 2 + shape.skewX * b * 0.6 - shape.twist * b * 1.35
      let dv = b * logH + shape.bendY * unit * 0.55 * (a / extentU) ** 2 + shape.skewY * a * 0.6 + shape.twist * a * 1.35
      let dn = c * logD
      const taper = shape.taperTop * smoothstep(b / extentV) + shape.taperBottom * smoothstep(-b / extentV)
      du += a * (shape.bulge * 0.42 - taper * 0.85)
      dv += b * shape.bulge * 0.24
      dn += c * (shape.bulge * 0.65 - taper * 0.45)
      const radius = Math.hypot(a, b) || 1
      for (let sector = 0; sector < 8; sector++) if (sectors[sector]) {
        const [sx, sy] = directions[sector]
        const weight = Math.max(0, (a * sx + b * sy) / radius) ** 6
        const amount = sectors[sector] * unit * 0.65 * weight
        du += sx * amount; dv += sy * amount
      }
      output[0] = u.x * du + v.x * dv + normal.x * dn
      output[1] = u.y * du + v.y * dv + normal.y * dn
      output[2] = u.z * du + v.z * dv + normal.z * dn
    }, Math.min(unit * 1.25, activity * unit * 0.6))
  }

  function sculptFlow(stroke, px, py, pz, radius, strength, mode) {
    const delta = stroke.delta
    const dx = finite(delta?.[0] ?? delta?.x, 0), dy = finite(delta?.[1] ?? delta?.y, 0), dz = finite(delta?.[2] ?? delta?.z, 0)
    if ((mode === 'grab' || mode === 'stretch') && Math.hypot(dx, dy, dz) < 1e-10) return
    const newGesture = mode === 'push' || stroke.gestureId == null || gestureId !== stroke.gestureId || gestureMode !== mode
    if (newGesture) {
      gestureId = stroke.gestureId; gestureMode = mode
      for (let i = 0; i < count; i++) {
        const k = i * 3, distance = Math.hypot(position.array[k] - px, position.array[k + 1] - py, position.array[k + 2] - pz) / radius
        gestureWeights[i] = distance >= 1 ? 0 : Math.exp(-distance * distance * 2) * smoothstep(1 - distance)
      }
    }
    const normals = geometry.attributes.normal.array, dragLength = Math.hypot(dx, dy, dz) || 1
    const gain = 0.5 + strength
    let pushX = 0, pushY = 0, pushZ = 0
    if (mode === 'push') {
      // One coherent brush normal avoids crumpling neighboring concave vertices
      // along divergent per-vertex normals during a deep push.
      for (let i = 0; i < count; i++) {
        const k = i * 3, weight = gestureWeights[i] ** 2
        pushX += normals[k] * weight; pushY += normals[k + 1] * weight; pushZ += normals[k + 2] * weight
      }
      const length = Math.hypot(pushX, pushY, pushZ) || 1
      pushX /= length; pushY /= length; pushZ /= length
    }
    integrateFlow((i, x, y, z, output) => {
      const k = i * 3, weight = gestureWeights[i]
      if (mode === 'push') {
        output[0] = -pushX * strength * 4 * weight; output[1] = -pushY * strength * 4 * weight; output[2] = -pushZ * strength * 4 * weight
      } else {
        const stretch = mode === 'stretch' ? 0.8 + clamp(((x - px) * dx + (y - py) * dy + (z - pz) * dz) / (dragLength * radius), -1, 1) * 0.7 : 1
        output[0] = dx * gain * weight * stretch; output[1] = dy * gain * weight * stretch; output[2] = dz * gain * weight * stretch
      }
    }, mode === 'push' ? strength * 4 : dragLength * gain * (mode === 'stretch' ? 1.5 : 1), true)
  }

  function sculptInternal(stroke) {
    const point = stroke?.point
    if (!point) return
    const px = finite(point.x ?? point[0], NaN), py = finite(point.y ?? point[1], NaN), pz = finite(point.z ?? point[2], NaN)
    if (!Number.isFinite(px + py + pz)) return
    const radius = clamp(finite(stroke.radius, 8), 1, 18)
    const strength = clamp(finite(stroke.strength, 0.35), 0.05, 1.2)
    const mode = ['raise', 'carve', 'smooth', 'grab', 'stretch', 'push'].includes(stroke.mode) ? stroke.mode : 'raise'
    if (mode === 'grab' || mode === 'stretch' || mode === 'push') { sculptFlow(stroke, px, py, pz, radius, strength, mode); return }
    const normals = geometry.getAttribute('normal').array
    safetyOrigin.set(position.array)
    for (let i = 0; i < count; i++) {
      if (protection[i] === 1) continue
      const k = i * 3, x = position.array[k], y = position.array[k + 1], z = position.array[k + 2]
      const distance = Math.hypot(x - px, y - py, z - pz)
      if (distance >= radius) continue
      const influence = smoothstep(1 - distance / radius) * (1 - protection[i])
      let toX, toY, toZ
      if (mode === 'smooth') {
        const group = weldIndex[i], start = neighborOffsets[group], end = neighborOffsets[group + 1]
        if (start === end) continue
        let averageX = 0, averageY = 0, averageZ = 0
        for (let j = start; j < end; j++) {
          const neighbor = neighbors[j] * 3
          averageX += safetyOrigin[neighbor]; averageY += safetyOrigin[neighbor + 1]; averageZ += safetyOrigin[neighbor + 2]
        }
        const inverseCount = 1 / (end - start || 1)
        const amount = Math.min(0.45, strength * 0.35) * influence
        toX = x + (averageX * inverseCount - x) * amount
        toY = y + (averageY * inverseCount - y) * amount
        toZ = z + (averageZ * inverseCount - z) * amount
      } else {
        const amount = strength * influence * (mode === 'carve' ? -1 : 1)
        toX = x + normals[k] * amount; toY = y + normals[k + 1] * amount; toZ = z + normals[k + 2] * amount
      }
      let dx = toX - shapedBase[k], dy = toY - shapedBase[k + 1], dz = toZ - shapedBase[k + 2]
      const length = Math.hypot(dx, dy, dz), cap = sculptCap * (1 - protection[i])
      if (length > cap) { const scale = cap / length; dx *= scale; dy *= scale; dz *= scale; toX = shapedBase[k] + dx; toY = shapedBase[k + 1] + dy; toZ = shapedBase[k + 2] + dz }
      writeSafe(i, x, y, z, toX, toY, toZ)
    }
    if (expressive) referenceDirections(safetyOrigin)
    guardTriangles(safetyOrigin)
  }

  function apply(input = {}, sculptStrokes = []) {
    gestureId = null; gestureMode = null; expressive = false; flowSteps = 0
    faceDirections.set(originalFaceDirections)
    const shape = readShape(input)
    const neutral = shape.width === 1 && shape.height === 1 && shape.depth === 1
      && !shape.angularity && !shape.asymmetry && !shape.ridges && !shape.dents
      && !shape.top && !shape.right && !shape.bottom && !shape.left
    position.array.set(base)
    if (!neutral) for (let i = 0; i < count; i++) {
      if (protection[i] === 1) continue
      const k = i * 3, a = localU[i], b = localV[i], c = localN[i]
      const x = a / unit, y = b / unit, z = c / unit
      const coarse = noise(x * 2.1 + 3.7, y * 2.1 - 1.3, z * 2.1 + 5.1, shape.seed)
      const angular = Math.tanh(coarse * 2) / Math.tanh(2)
      const ridgeNoise = noise(x * shape.ridgeScale * 2 + 8.1, y * shape.ridgeScale * 2, z * shape.ridgeScale * 2 - 4.3, shape.seed + 17)
      const ridge = Math.exp(-ridgeNoise * ridgeNoise * 8) - 0.35
      const dent = Math.pow(Math.max(0, noise(x * shape.dentScale * 2 - 2.8, y * shape.dentScale * 2 + 9.2, z * shape.dentScale * 2, shape.seed + 47)), 2)
      const relief = unit * (shape.angularity * angular * 0.07 + shape.asymmetry * coarse * 0.11 + shape.ridges * ridge * 0.07 - shape.dents * dent * 0.12)
      let du = a * (clamp(shape.width, 0.8, 1.35) - 1), dv = b * (clamp(shape.height, 0.8, 1.35) - 1), dn = c * (clamp(shape.depth, 0.8, 1.35) - 1)
      du += unit * 0.15 * (shape.right * smoothstep(a / extentU) ** 2 - shape.left * smoothstep(-a / extentU) ** 2)
      dv += unit * 0.15 * (shape.top * smoothstep(b / extentV) ** 2 - shape.bottom * smoothstep(-b / extentV) ** 2)
      const radialLength = Math.hypot(base[k] - center.x, base[k + 1] - center.y, base[k + 2] - center.z) || 1
      let dx = u.x * du + v.x * dv + normal.x * dn + (base[k] - center.x) / radialLength * relief
      let dy = u.y * du + v.y * dv + normal.y * dn + (base[k + 1] - center.y) / radialLength * relief
      let dz = u.z * du + v.z * dv + normal.z * dn + (base[k + 2] - center.z) / radialLength * relief
      const influence = 1 - protection[i], length = Math.hypot(dx, dy, dz)
      const amount = influence * Math.min(1, shapeCap / (length || 1))
      dx *= amount; dy *= amount; dz *= amount
      writeSafe(i, base[k], base[k + 1], base[k + 2], base[k] + dx, base[k + 1] + dy, base[k + 2] + dz)
    }
    if (!neutral) guardTriangles(base)
    applyFormFlow(shape)
    shapedBase.set(position.array)
    // Rebuild normals between dabs too: replay and incremental sculpt use identical normals.
    finish(neutral && !expressive, sculptStrokes.length === 0)
    for (let i = 0; i < sculptStrokes.length; i++) { sculptInternal(sculptStrokes[i]); finish(false, i === sculptStrokes.length - 1) }
    return geometry
  }

  finish(true)
  return {
    geometry, frame, anchor: center.clone(), protectionAt, apply,
    get lastSafetyScale() { return lastSafetyScale },
    get lastSafetyAverage() { return lastSafetyAverage },
    get flowSteps() { return flowSteps },
    sculpt(stroke) { sculptInternal(stroke); return finish() },
    dispose() { geometry.dispose() },
    limits: Object.freeze({ shapeDisplacement: shapeCap, sculptDisplacement: sculptCap, radius: [1, 18], strength: [0.05, 1.2] }),
  }
}
