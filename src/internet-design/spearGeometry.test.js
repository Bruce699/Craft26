import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import test from 'node:test'
import * as THREE from 'three'
import { createRockDeformer } from './rockGeometry.js'
import { createSpearGeometry } from './spearGeometry.js'
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
const reference = createRockDeformer(stone, screen)
const frame = reference.frame

function projected(geometry) {
  const points = []
  for (let i = 0; i < geometry.attributes.position.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(geometry.attributes.position, i).sub(frame.center)
    points.push([p.dot(frame.u), p.dot(frame.v), p.dot(frame.normal)])
  }
  return points
}

test('spear source is private, deterministic and leaves the original UV/index assets untouched', () => {
  const a = createSpearGeometry(stone, screen), b = createSpearGeometry(stone, screen)
  assert.notEqual(a, stone)
  assert.notEqual(a.attributes.position.array, original)
  assert.deepEqual(a.attributes.position.array, b.attributes.position.array)
  assert.deepEqual(a.attributes.normal.array, b.attributes.normal.array)
  assert.deepEqual(a.attributes.uv.array, originalUV)
  assert.deepEqual(a.index.array, stone.index.array)
  assert.deepEqual(stone.attributes.position.array, original)
  assert.deepEqual(stone.attributes.normal.array, originalNormals)
  a.dispose(); b.dispose()
})

test('the entire original recess and safety collar retain exact positions and normals', () => {
  const spear = createSpearGeometry(stone, screen)
  let pinned = 0, changed = 0
  for (let k = 0; k < original.length; k += 3) {
    if (reference.protectionAt(original.subarray(k, k + 3)) === 1) {
      pinned++
      assert.deepEqual(spear.attributes.position.array.subarray(k, k + 3), original.subarray(k, k + 3))
      assert.deepEqual(spear.attributes.normal.array.subarray(k, k + 3), originalNormals.subarray(k, k + 3))
    } else if (Math.hypot(spear.attributes.position.array[k] - original[k], spear.attributes.position.array[k + 1] - original[k + 1], spear.attributes.position.array[k + 2] - original[k + 2]) > 0.01) changed++
  }
  assert.ok(pinned > 1000)
  assert.ok(changed > stone.attributes.position.count * 0.4)
  assert.equal(pinned, spear.userData.spear.protectedVertices)
  spear.dispose()
})

test('silhouette is a tall pointed spear with a broad lower blade', () => {
  const spear = createSpearGeometry(stone, screen), points = projected(spear)
  const minU = Math.min(...points.map((p) => p[0])), maxU = Math.max(...points.map((p) => p[0]))
  const minV = Math.min(...points.map((p) => p[1])), maxV = Math.max(...points.map((p) => p[1]))
  const width = maxU - minU, height = maxV - minV
  const tipWidth = Math.max(...points.filter((p) => p[1] > 50).map((p) => Math.abs(p[0]))) * 2
  const lowerWidth = Math.max(...points.filter((p) => p[1] < -12).map((p) => Math.abs(p[0]))) * 2
  console.log(`spear aperture-frame extents U[${minU.toFixed(2)},${maxU.toFixed(2)}] V[${minV.toFixed(2)},${maxV.toFixed(2)}]; ${width.toFixed(2)}×${height.toFixed(2)} (${(height / width).toFixed(2)}:1), tip width ${tipWidth.toFixed(2)}`)
  assert.ok(maxV > 54.9 && minV < -28.9)
  assert.ok(height / width > 1.7 && height / width < 2.05)
  assert.ok(width > 42 && width < 50)
  assert.ok(tipWidth < 5)
  assert.ok(lowerWidth > 40)
  spear.dispose()
})

test('normals and triangles remain finite, with continuous shading across original UV seams', () => {
  const spear = createSpearGeometry(stone, screen), position = spear.attributes.position.array, normals = spear.attributes.normal.array
  const duplicates = new Map()
  for (let k = 0; k < position.length; k += 3) {
    assert.ok(Number.isFinite(position[k] + position[k + 1] + position[k + 2]))
    const length = Math.hypot(normals[k], normals[k + 1], normals[k + 2])
    assert.ok(Number.isFinite(length) && length > 0.9 && length < 1.1)
    const key = `${original[k]},${original[k + 1]},${original[k + 2]}`
    if (duplicates.has(key)) {
      const before = duplicates.get(key)
      assert.deepEqual(position.subarray(k, k + 3), position.subarray(before, before + 3))
      assert.deepEqual(normals.subarray(k, k + 3), normals.subarray(before, before + 3))
    } else duplicates.set(key, k)
  }
  let newlyCollapsed = 0
  const area = (pixels, a, b, c) => {
    const x1 = pixels[b] - pixels[a], y1 = pixels[b + 1] - pixels[a + 1], z1 = pixels[b + 2] - pixels[a + 2]
    const x2 = pixels[c] - pixels[a], y2 = pixels[c + 1] - pixels[a + 1], z2 = pixels[c + 2] - pixels[a + 2]
    return Math.hypot(y1 * z2 - z1 * y2, z1 * x2 - x1 * z2, x1 * y2 - y1 * x2)
  }
  for (let i = 0; i < spear.index.array.length; i += 3) {
    const a = spear.index.array[i] * 3, b = spear.index.array[i + 1] * 3, c = spear.index.array[i + 2] * 3
    if (area(original, a, b, c) > 1e-6 && area(position, a, b, c) <= 1e-8) newlyCollapsed++
  }
  assert.equal(newlyCollapsed, 0)
  assert.ok(Number.isFinite(spear.boundingSphere.radius))
  spear.dispose()
})

test('spear remains an editable neutral source with a centered square player', () => {
  const spear = createSpearGeometry(stone, screen), source = new Float32Array(spear.attributes.position.array)
  const edit = createRockDeformer(spear, screen)
  edit.apply()
  assert.deepEqual(edit.geometry.attributes.position.array, source)
  const wrapper = createVideoWindowDeformer(edit, screen)
  wrapper.setWindow({ width: Math.sqrt(1 / wrapper.baseAspect), height: Math.sqrt(wrapper.baseAspect) })
  assert.ok(Math.abs(wrapper.aspect - 1) < 1e-10)
  const screenPoints = projected(wrapper.screenGeometry)
  const width = Math.max(...screenPoints.map((p) => p[0])) - Math.min(...screenPoints.map((p) => p[0]))
  const height = Math.max(...screenPoints.map((p) => p[1])) - Math.min(...screenPoints.map((p) => p[1]))
  assert.ok(Math.abs(width / height - 1) < 0.002)
  assert.deepEqual(wrapper.screenGeometry.attributes.uv.array, screen.attributes.uv.array)
  wrapper.dispose(); spear.dispose()
})
