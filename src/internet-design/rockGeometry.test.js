import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import * as THREE from 'three'
import { createRockDeformer, ROCK_SHAPE_DEFAULTS } from './rockGeometry.js'
import { formPreset, formPresetNames } from './rockFormControls.js'
import { createVideoWindowDeformer } from './videoWindowGeometry.js'

// Decode the actual checked-in reference mesh using Three's bundled decoder.
const decoderURL = new URL('../examples/jsm/libs/draco/gltf/draco_decoder.js', import.meta.resolve('three'))
const module = { exports: {} }
vm.runInNewContext(await readFile(decoderURL, 'utf8'), {
  module, exports: module.exports, require: createRequire(decoderURL),
  __filename: fileURLToPath(decoderURL), __dirname: dirname(fileURLToPath(decoderURL)),
  process, console, Buffer, setTimeout, clearTimeout, TextDecoder, performance,
})
const draco = await module.exports()
const gltf = JSON.parse(await readFile(new URL('../../public/internet-design/marcd_stone_smooth.gltf', import.meta.url), 'utf8'))
const encoded = Buffer.from(gltf.buffers[0].uri.split(',')[1], 'base64')

function decode(primitive) {
  const descriptor = primitive.extensions.KHR_draco_mesh_compression
  const view = gltf.bufferViews[descriptor.bufferView]
  const data = encoded.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)
  const decoder = new draco.Decoder(), buffer = new draco.DecoderBuffer(), mesh = new draco.Mesh()
  buffer.Init(data, data.length)
  assert.ok(decoder.DecodeBufferToMesh(buffer, mesh).ok())
  const geometry = new THREE.BufferGeometry()
  const names = { POSITION: 'position', NORMAL: 'normal', TEXCOORD_0: 'uv' }
  for (const [name, id] of Object.entries(descriptor.attributes)) {
    const attribute = decoder.GetAttributeByUniqueId(mesh, id)
    const values = new draco.DracoFloat32Array()
    decoder.GetAttributeFloatForAllPoints(mesh, attribute, values)
    const array = new Float32Array(values.size())
    for (let i = 0; i < array.length; i++) array[i] = values.GetValue(i)
    geometry.setAttribute(names[name], new THREE.BufferAttribute(array, attribute.num_components()))
    draco.destroy(values)
  }
  const indices = new Uint32Array(mesh.num_faces() * 3), face = new draco.DracoInt32Array()
  for (let i = 0; i < mesh.num_faces(); i++) {
    decoder.GetFaceFromMesh(mesh, i, face)
    indices[i * 3] = face.GetValue(0); indices[i * 3 + 1] = face.GetValue(1); indices[i * 3 + 2] = face.GetValue(2)
  }
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  draco.destroy(face); draco.destroy(mesh); draco.destroy(buffer); draco.destroy(decoder)
  return geometry
}

const screen = decode(gltf.meshes[0].primitives[0])
const stone = decode(gltf.meshes[0].primitives[1])
const original = new Float32Array(stone.attributes.position.array)
const originalNormals = new Float32Array(stone.attributes.normal.array)
const originalUV = new Float32Array(stone.attributes.uv.array)
const extreme = {
  width: 0.8, height: 1.35, depth: 1.35, angularity: 1, asymmetry: 1,
  ridges: 1, ridgeScale: 5, dents: 1, dentScale: 5, seed: -719,
  top: -1, right: 1, bottom: 1, left: -1,
}

test('neutral settings exactly preserve source positions, normals, UVs, and source mesh', () => {
  const deformer = createRockDeformer(stone, screen)
  assert.notEqual(deformer.geometry, stone)
  deformer.apply(ROCK_SHAPE_DEFAULTS)
  assert.deepEqual(deformer.geometry.attributes.position.array, original)
  assert.deepEqual(deformer.geometry.attributes.normal.array, originalNormals)
  assert.deepEqual(deformer.geometry.attributes.uv.array, originalUV)
  deformer.apply(extreme)
  assert.deepEqual(stone.attributes.position.array, original)
  assert.deepEqual(stone.attributes.normal.array, originalNormals)
  deformer.apply()
  assert.deepEqual(deformer.geometry.attributes.position.array, original)
  deformer.dispose()
})

test('tilted video, entire recess collar, and finite bounds survive all extreme shape controls', () => {
  const deformer = createRockDeformer(stone, screen)
  assert.ok(Math.abs(deformer.frame.normal.x) > 0.2)
  for (let i = 0; i < screen.attributes.position.count; i++) {
    assert.equal(deformer.protectionAt(new THREE.Vector3().fromBufferAttribute(screen.attributes.position, i)), 1)
  }
  for (const shape of [extreme, { ...extreme, width: 1.35, height: 0.8, depth: 0.8, top: 1, right: -1, bottom: -1, left: 1 }]) {
    deformer.apply(shape)
    const output = deformer.geometry.attributes.position.array
    let protectedCount = 0, changedCount = 0
    for (let i = 0; i < output.length; i += 3) {
      assert.ok(Number.isFinite(output[i] + output[i + 1] + output[i + 2]))
      const protectedBefore = deformer.protectionAt(original.subarray(i, i + 3)) === 1
      if (protectedBefore) {
        protectedCount++
        assert.deepEqual(output.subarray(i, i + 3), original.subarray(i, i + 3))
      } else {
        if (Math.hypot(output[i] - original[i], output[i + 1] - original[i + 1], output[i + 2] - original[i + 2]) > 1e-5) changedCount++
        // Only an immaterial Float32 rounding tolerance may approach the inner collar.
        const { center, u, v, halfWidth, halfHeight, collar } = deformer.frame
        const p = new THREE.Vector3(output[i], output[i + 1], output[i + 2]).sub(center)
        const distance = Math.hypot(Math.max(0, Math.abs(p.dot(u)) - halfWidth), Math.max(0, Math.abs(p.dot(v)) - halfHeight))
        assert.ok(distance >= collar - 2e-5)
      }
    }
    assert.ok(protectedCount > 100)
    assert.ok(changedCount > 1000)
    assert.ok(Number.isFinite(deformer.geometry.boundingSphere.radius))
    assert.deepEqual(deformer.geometry.attributes.uv.array, originalUV)
  }
  deformer.dispose()
})

test('seeded shaping is deterministic and seed changes affect non-neutral geometry', () => {
  const a = createRockDeformer(stone, screen), b = createRockDeformer(stone, screen)
  a.apply(extreme); b.apply(extreme)
  assert.deepEqual(a.geometry.attributes.position.array, b.geometry.attributes.position.array)
  b.apply({ ...extreme, seed: extreme.seed + 1 })
  assert.notDeepEqual(a.geometry.attributes.position.array, b.geometry.attributes.position.array)
  a.dispose(); b.dispose()
})

test('incremental raise/carve/smooth equals replay; seams and aperture remain closed', () => {
  const a = createRockDeformer(stone, screen), b = createRockDeformer(stone, screen)
  const selected = original.findIndex((_, i) => i % 3 === 0 && a.protectionAt(original.subarray(i, i + 3)) === 0)
  const point = Array.from(original.subarray(selected, selected + 3))
  const strokes = [
    { point, radius: 8, strength: 1.2, mode: 'raise' },
    { point, radius: 8, strength: 0.8, mode: 'carve' },
    { point, radius: 6, strength: 1.2, mode: 'smooth' },
  ]
  a.apply(extreme)
  for (const stroke of strokes) a.sculpt(stroke)
  b.apply(extreme, strokes)
  assert.deepEqual(a.geometry.attributes.position.array, b.geometry.attributes.position.array)
  assert.deepEqual(a.geometry.attributes.normal.array, b.geometry.attributes.normal.array)
  const duplicate = new Map(), output = a.geometry.attributes.position.array, normals = a.geometry.attributes.normal.array
  for (let i = 0; i < original.length; i += 3) {
    const key = `${original[i]},${original[i + 1]},${original[i + 2]}`
    if (duplicate.has(key)) {
      const previous = duplicate.get(key)
      assert.deepEqual(output.subarray(i, i + 3), output.subarray(previous, previous + 3))
      assert.deepEqual(normals.subarray(i, i + 3), normals.subarray(previous, previous + 3))
    } else duplicate.set(key, i)
    if (a.protectionAt(original.subarray(i, i + 3)) === 1) assert.deepEqual(output.subarray(i, i + 3), original.subarray(i, i + 3))
  }
  a.dispose(); b.dispose()
})

function inversionCount(output) {
  const index = stone.index.array
  let inverted = 0, valid = 0
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3
    const bx = original[b] - original[a], by = original[b + 1] - original[a + 1], bz = original[b + 2] - original[a + 2]
    const cx = original[c] - original[a], cy = original[c + 1] - original[a + 1], cz = original[c + 2] - original[a + 2]
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx
    if (nx * nx + ny * ny + nz * nz < 1e-12) continue
    const dbx = output[b] - output[a], dby = output[b + 1] - output[a + 1], dbz = output[b + 2] - output[a + 2]
    const dcx = output[c] - output[a], dcy = output[c + 1] - output[a + 1], dcz = output[c + 2] - output[a + 2]
    const dot = nx * (dby * dcz - dbz * dcy) + ny * (dbz * dcx - dbx * dcz) + nz * (dbx * dcy - dby * dcx)
    valid++
    if (dot <= 0) inverted++
  }
  return { inverted, valid, fraction: inverted / valid }
}

function minimumAreaRatio(output) {
  const index = stone.index.array
  let minimum = Infinity
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3
    const bx = original[b] - original[a], by = original[b + 1] - original[a + 1], bz = original[b + 2] - original[a + 2]
    const cx = original[c] - original[a], cy = original[c + 1] - original[a + 1], cz = original[c + 2] - original[a + 2]
    const area = (by * cz - bz * cy) ** 2 + (bz * cx - bx * cz) ** 2 + (bx * cy - by * cx) ** 2
    if (area < 1e-12) continue
    const dbx = output[b] - output[a], dby = output[b + 1] - output[a + 1], dbz = output[b + 2] - output[a + 2]
    const dcx = output[c] - output[a], dcy = output[c + 1] - output[a + 1], dcz = output[c + 2] - output[a + 2]
    const after = (dby * dcz - dbz * dcy) ** 2 + (dbz * dcx - dbx * dcz) ** 2 + (dbx * dcy - dby * dcx) ** 2
    minimum = Math.min(minimum, after / area)
  }
  return minimum
}

test('extreme shapes retain valid triangle area during guarded incremental flows', () => {
  const deformer = createRockDeformer(stone, screen)
  for (const shape of [extreme,
    { ...extreme, width: 1.35, height: 0.8, depth: 0.8, top: 1, right: -1, bottom: -1, left: 1 },
    { ...extreme, width: 0.8, height: 0.8, depth: 0.8, top: -1, right: -1, bottom: -1, left: -1 },
    { ...extreme, width: 1.35, height: 1.35, depth: 1.35, top: 1, right: 1, bottom: 1, left: 1 },
  ]) {
    deformer.apply(shape)
    assert.ok(minimumAreaRatio(deformer.geometry.attributes.position.array) >= 9e-6)
    assert.ok(deformer.flowSteps > 0)
  }
  deformer.dispose()
})

function edgeEnergy(positions) {
  let sum = 0
  const index = stone.index.array
  for (let i = 0; i < index.length; i += 3) for (let edge = 0; edge < 3; edge++) {
    const a = index[i + edge] * 3, b = index[i + (edge + 1) % 3] * 3
    sum += (positions[a] - positions[b]) ** 2 + (positions[a + 1] - positions[b + 1]) ** 2 + (positions[a + 2] - positions[b + 2]) ** 2
  }
  return sum
}

test('Smooth changes untouched geometry and reduces neighborhood edge energy', () => {
  const deformer = createRockDeformer(stone, screen)
  const selected = original.findIndex((_, i) => i % 3 === 0 && deformer.protectionAt(original.subarray(i, i + 3)) === 0)
  const point = Array.from(original.subarray(selected, selected + 3))
  const before = edgeEnergy(original)
  for (let i = 0; i < 10; i++) deformer.sculpt({ point, radius: 8, strength: 1.2, mode: 'smooth' })
  assert.notDeepEqual(deformer.geometry.attributes.position.array, original)
  assert.ok(edgeEnergy(deformer.geometry.attributes.position.array) < before)
  assert.equal(inversionCount(deformer.geometry.attributes.position.array).inverted, 0)
  deformer.dispose()
})

test('repeated sculpt stays capped, finite, protected and oriented; benchmark real mesh', () => {
  const deformer = createRockDeformer(stone, screen)
  const selected = original.findIndex((_, i) => i % 3 === 0 && deformer.protectionAt(original.subarray(i, i + 3)) === 0)
  const point = Array.from(original.subarray(selected, selected + 3))
  let start = performance.now()
  deformer.apply(extreme)
  const applyTime = performance.now() - start, shapeSafety = deformer.lastSafetyScale, shapeAverage = deformer.lastSafetyAverage
  const shaped = new Float32Array(deformer.geometry.attributes.position.array)
  const stroke = { point, radius: 8, strength: 1.2, mode: 'raise' }
  start = performance.now(); deformer.sculpt(stroke); const sculptTime = performance.now() - start
  const strokes = Array.from({ length: 30 }, () => stroke)
  start = performance.now(); deformer.apply(extreme, strokes); const replayTime = performance.now() - start
  const positions = deformer.geometry.attributes.position.array, normals = deformer.geometry.attributes.normal.array
  for (let i = 0; i < positions.length; i += 3) {
    assert.ok(Number.isFinite(positions[i] + positions[i + 1] + positions[i + 2] + normals[i] + normals[i + 1] + normals[i + 2]))
    assert.ok(Math.hypot(positions[i] - shaped[i], positions[i + 1] - shaped[i + 1], positions[i + 2] - shaped[i + 2]) <= deformer.limits.sculptDisplacement + 1e-5)
    if (deformer.protectionAt(original.subarray(i, i + 3)) === 1) assert.deepEqual(positions.subarray(i, i + 3), original.subarray(i, i + 3))
    else {
      const { center, u, v, halfWidth, halfHeight, collar } = deformer.frame
      const p = new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]).sub(center)
      assert.ok(Math.hypot(Math.max(0, Math.abs(p.dot(u)) - halfWidth), Math.max(0, Math.abs(p.dot(v)) - halfHeight)) >= collar - 2e-5)
    }
  }
  assert.ok(minimumAreaRatio(positions) >= 9e-6)
  console.log(`mesh benchmark: apply ${applyTime.toFixed(1)}ms, one dab ${sculptTime.toFixed(1)}ms, replay30 ${replayTime.toFixed(1)}ms; extreme shape safety min ${shapeSafety.toFixed(3)} average ${shapeAverage.toFixed(3)}`)
  deformer.dispose()
})

test('local safety keeps broad silhouette controls and ordinary organic changes effective', () => {
  const deformer = createRockDeformer(stone, screen)
  for (const [label, shape] of [
    ['width max', { width: 1.35 }], ['width min', { width: 0.8 }],
    ['typical organic', { width: 1.1, height: 1.1, depth: 1.05, top: 0.3, right: -0.1, bottom: 0.2, left: 0.15, angularity: 0.45, asymmetry: 0.3, ridges: 0.4, ridgeScale: 2.5, dents: 0.4, dentScale: 3, seed: 26 }],
  ]) {
    deformer.apply(shape)
    console.log(`${label}: safety min ${deformer.lastSafetyScale.toFixed(3)} average ${deformer.lastSafetyAverage.toFixed(3)}`)
    assert.ok(minimumAreaRatio(deformer.geometry.attributes.position.array) >= 9e-6)
    assert.ok(deformer.lastSafetyAverage > 0.1)
  }
  deformer.dispose()
})

function projectedExtents(output, frame) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (let k = 0; k < output.length; k += 3) {
    const x = output[k] - frame.center.x, y = output[k + 1] - frame.center.y, z = output[k + 2] - frame.center.z
    const a = x * frame.u.x + y * frame.u.y + z * frame.u.z, b = x * frame.v.x + y * frame.v.y + z * frame.v.z
    minU = Math.min(minU, a); maxU = Math.max(maxU, a); minV = Math.min(minV, b); maxV = Math.max(maxV, b)
  }
  return [minU, maxU, minV, maxV]
}

function assertProtectedAndFinite(deformer) {
  const output = deformer.geometry.attributes.position.array, normals = deformer.geometry.attributes.normal.array
  for (let k = 0; k < output.length; k += 3) {
    assert.ok(Number.isFinite(output[k] + output[k + 1] + output[k + 2] + normals[k] + normals[k + 1] + normals[k + 2]))
    if (deformer.protectionAt(original.subarray(k, k + 3)) === 1) assert.deepEqual(output.subarray(k, k + 3), original.subarray(k, k + 3))
  }
  assert.deepEqual(deformer.geometry.attributes.uv.array, originalUV)
  assert.ok(minimumAreaRatio(output) >= 9e-6)
}

test('five organic families produce visibly different broad silhouettes with pinned aperture', () => {
  const deformer = createRockDeformer(stone, screen)
  const baseline = projectedExtents(original, deformer.frame)
  const signatures = []
  for (const name of formPresetNames) {
    const preset = formPreset(name), shape = { ...preset, ...preset.outline, ...preset.surface, ...preset.form }
    const start = performance.now(); deformer.apply(shape); const elapsed = performance.now() - start
    assertProtectedAndFinite(deformer)
    const extent = projectedExtents(deformer.geometry.attributes.position.array, deformer.frame)
    const widthRatio = (extent[1] - extent[0]) / (baseline[1] - baseline[0]), heightRatio = (extent[3] - extent[2]) / (baseline[3] - baseline[2])
    console.log(`form ${name}: width ${widthRatio.toFixed(2)}x height ${heightRatio.toFixed(2)}x; ${elapsed.toFixed(0)}ms`)
    assert.ok(Math.max(Math.abs(widthRatio - 1), Math.abs(heightRatio - 1)) > 0.2)
    signatures.push(`${widthRatio.toFixed(2)},${heightRatio.toFixed(2)}`)
  }
  assert.equal(new Set(signatures).size, formPresetNames.length)
  deformer.dispose()
})

test('all eight outline sectors can move a broad part of the silhouette', () => {
  const deformer = createRockDeformer(stone, screen)
  const baseline = projectedExtents(original, deformer.frame)
  for (const field of ['top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']) {
    deformer.apply({ [field]: 1 })
    assertProtectedAndFinite(deformer)
    const extent = projectedExtents(deformer.geometry.attributes.position.array, deformer.frame)
    const change = Math.max(...extent.map((value, i) => Math.abs(value - baseline[i])))
    assert.ok(change > 4, `${field} changed outline by only ${change}`)
  }
  deformer.dispose()
})

test('strong grab/stretch/push keep gesture selection attached and replay deterministically', () => {
  const a = createRockDeformer(stone, screen), b = createRockDeformer(stone, screen)
  let chosen = 0, maximum = -Infinity
  for (let i = 0; i < original.length / 3; i++) {
    const k = i * 3, value = original[k] * a.frame.u.x + original[k + 1] * a.frame.u.y + original[k + 2] * a.frame.u.z
    if (value > maximum) { maximum = value; chosen = i }
  }
  const point = Array.from(original.subarray(chosen * 3, chosen * 3 + 3))
  for (const mode of ['grab', 'stretch', 'push']) {
    a.apply(); b.apply()
    const strokes = Array.from({ length: 4 }, () => ({ point, radius: 18, strength: 0.5, mode, gestureId: 51, delta: a.frame.u.clone().multiplyScalar(2.5).toArray() }))
    const start = performance.now()
    for (const stroke of strokes) a.sculpt(stroke)
    console.log(`drag ${mode}: ${((performance.now() - start) / strokes.length).toFixed(1)}ms/dab`)
    b.apply({}, strokes)
    assert.deepEqual(a.geometry.attributes.position.array, b.geometry.attributes.position.array)
    const output = a.geometry.attributes.position.array, k = chosen * 3
    const movement = Math.hypot(output[k] - original[k], output[k + 1] - original[k + 1], output[k + 2] - original[k + 2])
    assert.ok(movement > 3, `${mode} moved selected point only ${movement}`)
    assert.ok(movement <= a.limits.sculptDisplacement + 1e-4)
    assertProtectedAndFinite(a)
  }
  a.dispose(); b.dispose()
})

test('all five macro families retain the centered physical square video window', () => {
  const wrapper = createVideoWindowDeformer(createRockDeformer(stone, screen), screen)
  wrapper.setWindow({ width: 1 / wrapper.baseAspect, height: 1 })
  for (const name of formPresetNames) {
    const preset = formPreset(name)
    wrapper.apply({ ...preset, ...preset.outline, ...preset.surface, ...preset.form })
    assert.ok(Math.abs(wrapper.aspect - 1) < 1e-10)
    const extent = projectedExtents(wrapper.screenGeometry.attributes.position.array, wrapper.frame)
    console.log(`square family ${name}: measured ${((extent[1] - extent[0]) / (extent[3] - extent[2])).toFixed(5)}, settings`, wrapper.window)
    assert.ok(Math.abs((extent[1] - extent[0]) / (extent[3] - extent[2]) - 1) < 0.002)
    assert.ok(Math.abs(extent[0] + extent[1]) < 0.004)
    assert.ok(Math.abs(extent[2] + extent[3]) < 0.004)
    assert.deepEqual(wrapper.screenGeometry.attributes.uv.array, screen.attributes.uv.array)
  }
  wrapper.dispose()
})
