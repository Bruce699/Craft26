import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import * as THREE from 'three'
import { createRockDeformer } from './rockGeometry.js'
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
const originalScreen = new Float32Array(screen.attributes.position.array)
const make = () => createVideoWindowDeformer(createRockDeformer(stone, screen), screen)

function projectedBounds(positions, frame) {
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity
  for (let k = 0; k < positions.length; k += 3) {
    const x = positions[k] - frame.center.x, y = positions[k + 1] - frame.center.y, z = positions[k + 2] - frame.center.z
    const a = x * frame.u.x + y * frame.u.y + z * frame.u.z, b = x * frame.v.x + y * frame.v.y + z * frame.v.z
    minU = Math.min(minU, a); maxU = Math.max(maxU, a); minV = Math.min(minV, b); maxV = Math.max(maxV, b)
  }
  return { minU, maxU, minV, maxV, width: maxU - minU, height: maxV - minV }
}

function localJacobianAudit(window, before) {
  const index = stone.index.array, { u, v } = window.frame
  const point = new THREE.Vector3(), epsilon = 0.001
  let minJacobian = Infinity
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3
    const bx = before[b] - before[a], by = before[b + 1] - before[a + 1], bz = before[b + 2] - before[a + 2]
    const cx = before[c] - before[a], cy = before[c + 1] - before[a + 1], cz = before[c + 2] - before[a + 2]
    const nx = by * cz - bz * cy, ny = bz * cx - bx * cz, nz = bx * cy - by * cx
    if (nx * nx + ny * ny + nz * nz < 1e-12) continue
    point.set((before[a] + before[b] + before[c]) / 3, (before[a + 1] + before[b + 1] + before[c + 1]) / 3, (before[a + 2] + before[b + 2] + before[c + 2]) / 3)
    const origin = window.toWindow(point)
    const du = window.toWindow(point.clone().addScaledVector(u, epsilon)).sub(origin).divideScalar(epsilon)
    const dv = window.toWindow(point.clone().addScaledVector(v, epsilon)).sub(origin).divideScalar(epsilon)
    const aa = du.dot(u), ba = du.dot(v), ab = dv.dot(u), bb = dv.dot(v), det = aa * bb - ab * ba
    minJacobian = Math.min(minJacobian, det)

  }
  return minJacobian
}

test('default window is exact identity and owns both cloned surfaces', () => {
  const window = make()
  assert.deepEqual(window.geometry.attributes.position.array, original)
  assert.deepEqual(window.screenGeometry.attributes.position.array, originalScreen)
  assert.notEqual(window.geometry, stone)
  assert.notEqual(window.screenGeometry, screen)
  assert.ok(Math.abs(window.baseAspect - 1.5397) < 0.001)
  window.dispose(); window.dispose()
})

test('window extremes retain center, requested aspect, UVs and fixed outer body', () => {
  const window = make()
  for (const [width, height] of [[0.45, 0.45], [1.3, 1.3], [0.45, 1.3], [1.3, 0.45]]) {
    window.setWindow({ width, height })
    const frame = window.frame, output = window.geometry.attributes.position.array
    const aperture = projectedBounds(window.screenGeometry.attributes.position.array, frame)
    assert.ok(Math.abs((aperture.minU + aperture.maxU) / 2) < 0.003)
    assert.ok(Math.abs((aperture.minV + aperture.maxV) / 2) < 0.003)
    assert.ok(Math.abs(aperture.width / aperture.height - window.aspect) < 0.002)
    assert.ok(Math.abs(window.aspect - window.baseAspect * width / height) < 1e-8)
    let fixed = 0, changed = 0
    for (let k = 0; k < output.length; k += 3) {
      assert.ok(Number.isFinite(output[k] + output[k + 1] + output[k + 2]))
      const distance = Math.hypot(output[k] - original[k], output[k + 1] - original[k + 1], output[k + 2] - original[k + 2])
      if (distance < 1e-6) fixed++
      else changed++
    }
    assert.ok(fixed > 500)
    assert.ok(changed > 500)
    assert.deepEqual(window.geometry.attributes.uv.array, stone.attributes.uv.array)
    assert.deepEqual(window.screenGeometry.attributes.uv.array, screen.attributes.uv.array)
    assert.ok(localJacobianAudit(window, original) > 0)
    const outline = projectedBounds(output, frame), sourceOutline = projectedBounds(original, frame)
    for (const key of ['minU', 'maxU', 'minV', 'maxV']) assert.ok(Math.abs(outline[key] - sourceOutline[key]) < 1e-5)
    assert.deepEqual(window.geometry.index.array, stone.index.array)
    assert.deepEqual(window.screenGeometry.index.array, screen.index.array)
    const screenIndex = screen.index.array, beforeA = new THREE.Vector3(), beforeB = new THREE.Vector3(), beforeC = new THREE.Vector3()
    const afterA = new THREE.Vector3(), afterB = new THREE.Vector3(), afterC = new THREE.Vector3()
    for (let i = 0; i < screenIndex.length; i += 3) {
      beforeA.fromBufferAttribute(screen.attributes.position, screenIndex[i]); beforeB.fromBufferAttribute(screen.attributes.position, screenIndex[i + 1]); beforeC.fromBufferAttribute(screen.attributes.position, screenIndex[i + 2])
      afterA.fromBufferAttribute(window.screenGeometry.attributes.position, screenIndex[i]); afterB.fromBufferAttribute(window.screenGeometry.attributes.position, screenIndex[i + 1]); afterC.fromBufferAttribute(window.screenGeometry.attributes.position, screenIndex[i + 2])
      const sourceNormal = beforeB.sub(beforeA).cross(beforeC.sub(beforeA))
      const targetNormal = afterB.sub(afterA).cross(afterC.sub(afterA))
      assert.ok(targetNormal.lengthSq() > 1e-10)
      assert.ok(sourceNormal.dot(targetNormal) > 0)
    }
  }
  assert.deepEqual(stone.attributes.position.array, original)
  assert.deepEqual(screen.attributes.position.array, originalScreen)
  window.dispose()
})

test('forward/inverse mapping preserves canonical brush points across every window', () => {
  const window = make()
  for (const settings of [{ width: 0.45, height: 1.3 }, { width: 1.3, height: 0.45 }, { width: 1.3, height: 1.3 }]) {
    window.setWindow(settings)
    for (let i = 0; i < stone.attributes.position.count; i += 113) {
      const canonical = new THREE.Vector3().fromBufferAttribute(stone.attributes.position, i)
      const display = window.toWindow(canonical)
      assert.ok(window.toCanonical(display).distanceTo(canonical) < 1e-4)
      assert.ok(Number.isFinite(window.radiusToCanonical(4, display)))
      assert.ok(Math.abs(window.protectionAt(display) - createProtection(canonical)) < 2e-5)
    }
  }
  window.dispose()
})

const protectionReference = createRockDeformer(stone, screen)
const createProtection = (point) => protectionReference.protectionAt(point)

test('canonical sculpt history survives window changes, Undo and deterministic replay', () => {
  const a = make(), b = make()
  const shape = { asymmetry: 0.25, ridges: 0.3, ridgeScale: 2.5, seed: 26 }
  a.apply(shape); b.apply(shape)
  a.setWindow({ width: 0.65, height: 1.15 })
  let index = 0
  while (protectionReference.protectionAt(original.subarray(index * 3, index * 3 + 3)) > 0.2) index++
  const canonical = new THREE.Vector3().fromBufferAttribute(a.geometry.attributes.position, index)
  const stroke = { point: a.toCanonical(canonical).toArray(), radius: a.radiusToCanonical(5, canonical), strength: 0.5, mode: 'raise' }
  a.sculpt(stroke)
  a.setWindow({ width: 1.25, height: 0.8 })
  b.apply(shape, [stroke]); b.setWindow({ width: 1.25, height: 0.8 })
  assert.deepEqual(a.geometry.attributes.position.array, b.geometry.attributes.position.array)
  assert.deepEqual(a.screenGeometry.attributes.position.array, b.screenGeometry.attributes.position.array)
  a.apply(shape, []); b.apply(shape, [])
  assert.deepEqual(a.geometry.attributes.position.array, b.geometry.attributes.position.array)
  a.dispose(); b.dispose()
})

test('actual mesh window and sculpt refresh remain interactive', () => {
  const window = make()
  let start = performance.now(); window.setWindow({ width: 0.6, height: 1.2 }); const setting = performance.now() - start
  let index = 0
  while (protectionReference.protectionAt(original.subarray(index * 3, index * 3 + 3)) > 0) index++
  const point = Array.from(original.subarray(index * 3, index * 3 + 3))
  start = performance.now(); window.sculpt({ point, radius: 5, strength: 0.3, mode: 'raise' }); const sculpt = performance.now() - start
  console.log(`window benchmark: setWindow ${setting.toFixed(1)}ms; sculpt + warp ${sculpt.toFixed(1)}ms`)
  window.dispose()
})
