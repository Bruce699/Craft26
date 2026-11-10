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
import { createSpearOpening } from './spearOpening.js'

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

test('moving and resizing the square removes stock only inside its footprint and leaves a solid back', () => {
  const solid = createSpearGeometry(stone, screen)
  const opening = createSpearOpening(createRockDeformer(solid, screen))
  const frame = { ...opening.frame, center: reference.frame.center }
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  const distances = (geometry, u, v) => {
    const origin = frame.center.clone().addScaledVector(frame.u, u).addScaledVector(frame.v, v).addScaledVector(frame.normal, 100)
    const hits = new THREE.Raycaster(origin, frame.normal.clone().negate()).intersectObject(new THREE.Mesh(geometry, material))
    return hits.map(hit => 100 - hit.distance)
  }
  const originalFront = distances(solid, 0, 0)[0]
  let previousX, previousY
  for (const [size, x, y] of [[1, 0, 0], [0.5, -8, -9], [1.2, 10, 18], [1.2, -10, -14]]) {
    opening.setWindow({width:size*Math.sqrt(frame.halfHeight/frame.halfWidth), height:size*Math.sqrt(frame.halfWidth/frame.halfHeight), offsetX:x, offsetY:y})
    const relative = opening.frame.center.clone().sub(frame.center)
    const cx = relative.dot(frame.u), cy = relative.dot(frame.v), bottom = relative.dot(frame.normal)
    const half = opening.window.width * frame.halfWidth
    assert.ok(Math.abs(half-opening.window.height*frame.halfHeight)<1e-7)
    if(x) { assert.ok(cx*x>0 && cy*y>0); assert.notEqual(previousX,cx); assert.notEqual(previousY,cy) }
    previousX=cx; previousY=cy
    for(const u of [-0.98,0,0.98]) for(const v of [-0.98,0,0.98]) {
      const a=cx+u*half, b=cy+v*half
      const stock=distances(solid,a,b), cut=distances(opening.geometry,a,b)
      assert.ok(stock[0]>bottom && cut.length>0 && cut[0]<bottom)
      assert.ok(Math.abs(stock.at(-1)-cut.at(-1))<1e-5)
    }
    // Check the old player location as well as points around the new edges.
    for(const [a,b] of [[0,0],[cx-half-0.2,cy],[cx+half+0.2,cy],[cx,cy-half-0.2],[cx,cy+half+0.2]]) {
      if(Math.abs(a-cx)<=half && Math.abs(b-cy)<=half) continue
      assert.ok(Math.abs(distances(solid,a,b)[0]-distances(opening.geometry,a,b)[0])<1e-4, JSON.stringify({a,b,cx,cy,half,old:distances(solid,a,b),cut:distances(opening.geometry,a,b),dot:frame.u.dot(frame.normal)}))
    }
    assert.deepEqual(opening.geometry.boundingBox, solid.boundingBox)
    assert.equal(distances(solid,0,0)[0],originalFront)
  }
  opening.dispose(); solid.dispose(); material.dispose()
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
  assert.ok(height / width > 1.49 && height / width < 1.68)
  assert.ok(width > 50 && width < 56)
  assert.ok(tipWidth < 7)
  assert.ok(lowerWidth > 40)
  // A cinch must retreat on BOTH sides, then flare out again toward the heel.
  function edgesAt(y) {
    const row = points.filter(p => Math.abs(p[1] - y) < 0.72).map(p => p[0])
    assert.ok(row.length > 0)
    return [-Math.min(...row), Math.max(...row)]
  }
  const shoulders = edgesAt(-9), notches = edgesAt(-13.4), heel = edgesAt(-19)
  for (let side = 0; side < 2; side++) {
    assert.ok(shoulders[side] - notches[side] > 3)
    assert.ok(heel[side] - notches[side] > 2)
  }
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
  const wrapper = createSpearOpening(edit)
  wrapper.setWindow({ width: Math.sqrt(frame.halfHeight / frame.halfWidth), height: Math.sqrt(frame.halfWidth / frame.halfHeight) })
  assert.ok(Math.abs(wrapper.aspect - 1) < 1e-10)
  const screenPoints = projected(wrapper.screenGeometry)
  const width = Math.max(...screenPoints.map((p) => p[0])) - Math.min(...screenPoints.map((p) => p[0]))
  const height = Math.max(...screenPoints.map((p) => p[1])) - Math.min(...screenPoints.map((p) => p[1]))
  assert.ok(Math.abs(width / height - 1) < 0.002)
  assert.equal(wrapper.screenGeometry.index.count, 6)
  wrapper.dispose(); spear.dispose()
})
