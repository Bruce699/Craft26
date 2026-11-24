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

test('spear source is its own deterministic mesh and leaves the scanned assets untouched', () => {
  const a = createSpearGeometry(screen), b = createSpearGeometry(screen)
  assert.notEqual(a, b)
  assert.deepEqual(a.attributes.position.array, b.attributes.position.array)
  assert.deepEqual(a.attributes.normal.array, b.attributes.normal.array)
  assert.deepEqual(a.index.array, b.index.array)
  assert.deepEqual(stone.attributes.position.array, original)
  assert.deepEqual(stone.attributes.normal.array, originalNormals)
  assert.deepEqual(stone.attributes.uv.array, originalUV)
  a.dispose(); b.dispose()
})

test('moving and resizing the square removes stock only inside its footprint and leaves a solid back', () => {
  const solid = createSpearGeometry(screen)
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
    for(const [a,b] of [[0,0],[cx-half-0.6,cy],[cx+half+0.6,cy],[cx,cy-half-0.6],[cx,cy+half+0.6]]) {
      if(Math.abs(a-cx)<=half && Math.abs(b-cy)<=half) continue
      assert.ok(Math.abs(distances(solid,a,b)[0]-distances(opening.geometry,a,b)[0])<1e-4, JSON.stringify({a,b,cx,cy,half,old:distances(solid,a,b),cut:distances(opening.geometry,a,b),dot:frame.u.dot(frame.normal)}))
    }
    assert.deepEqual(opening.geometry.boundingBox, solid.boundingBox)
    assert.equal(distances(solid,0,0)[0],originalFront)
  }
  opening.dispose(); solid.dispose(); material.dispose()
})

test('silhouette follows the reference point: fine tip, barbs, corner notches and a flared stem', () => {
  const spear = createSpearGeometry(screen), points = projected(spear)
  const minU = Math.min(...points.map((p) => p[0])), maxU = Math.max(...points.map((p) => p[0]))
  const minV = Math.min(...points.map((p) => p[1])), maxV = Math.max(...points.map((p) => p[1]))
  const width = maxU - minU, height = maxV - minV
  const span = (rows) => Math.max(...rows.map((p) => p[0])) - Math.min(...rows.map((p) => p[0]))
  const tipWidth = span(points.filter((p) => p[1] > 50)), lowerWidth = span(points.filter((p) => p[1] < -5))
  console.log(`spear aperture-frame extents U[${minU.toFixed(2)},${maxU.toFixed(2)}] V[${minV.toFixed(2)},${maxV.toFixed(2)}]; ${width.toFixed(2)}×${height.toFixed(2)} (${(height / width).toFixed(2)}:1), tip width ${tipWidth.toFixed(2)}`)
  assert.ok(maxV > 54.9 && minV < -28.9)
  assert.ok(height / width > 1.49 && height / width < 1.68)
  assert.ok(width > 50 && width < 56)
  assert.ok(tipWidth < 7)
  assert.ok(lowerWidth > 50)
  // A corner notch retreats on BOTH sides below the barbs, then the stem flares.
  function edgesAt(y) {
    const row = points.filter(p => Math.abs(p[1] - y) < 0.36).map(p => p[0])
    assert.ok(row.length > 0)
    return [-Math.min(...row), Math.max(...row)]
  }
  const barbs = edgesAt(-9), notches = edgesAt(-12.3), stem = edgesAt(-16)
  for (let side = 0; side < 2; side++) {
    assert.ok(barbs[side] - notches[side] > 5)
    assert.ok(stem[side] - notches[side] > 1.5)
  }
  spear.dispose()
})

test('the point is a thin biconvex blade with no central keel', () => {
  const spear = createSpearGeometry(screen), points = projected(spear)
  const front = Math.max(...points.map((p) => p[2])), back = Math.min(...points.map((p) => p[2]))
  const width = Math.max(...points.map((p) => p[0])) - Math.min(...points.map((p) => p[0]))
  // Knapped points run roughly four to six times wider than they are thick.
  assert.ok(width / (front - back) > 4 && width / (front - back) < 7)
  // Across the widest part of the blade the middle third stays near full
  // thickness: a lens, not a ridge falling away from a centre line.
  const band = points.filter((p) => p[2] > -3 && p[1] > 12 && p[1] < 16)
  const depth = (from, to) => {
    const part = band.filter((p) => p[0] >= from && p[0] < to).map((p) => p[2])
    return part.reduce((sum, value) => sum + value, 0) / part.length
  }
  const middle = depth(-2, 2)
  assert.ok(Math.abs(depth(-7, -4) - middle) < 1.6 && Math.abs(depth(4, 7) - middle) < 1.6)
  spear.dispose()
})

test('mesh is closed, finite and consistently wound', () => {
  const spear = createSpearGeometry(screen), position = spear.attributes.position.array, normals = spear.attributes.normal.array
  for (let k = 0; k < position.length; k += 3) {
    assert.ok(Number.isFinite(position[k] + position[k + 1] + position[k + 2]))
    const length = Math.hypot(normals[k], normals[k + 1], normals[k + 2])
    assert.ok(Number.isFinite(length) && length > 0.9 && length < 1.1)
  }
  // Every edge is shared by exactly two triangles, in opposite directions.
  const edges = new Map(), index = spear.index.array
  let volume = 0
  for (let i = 0; i < index.length; i += 3) {
    for (let e = 0; e < 3; e++) {
      const a = index[i + e], b = index[i + (e + 1) % 3]
      assert.notEqual(a, b)
      edges.set(`${a},${b}`, (edges.get(`${a},${b}`) ?? 0) + 1)
    }
    const [a, b, c] = [0, 1, 2].map((e) => new THREE.Vector3().fromArray(position, index[i + e] * 3))
    volume += a.dot(b.cross(c)) / 6
  }
  for (const [edge, uses] of edges) {
    assert.equal(uses, 1)
    assert.equal(edges.get(edge.split(',').reverse().join(',')), 1)
  }
  assert.ok(volume > 0)
  assert.ok(Number.isFinite(spear.boundingSphere.radius))
  spear.dispose()
})

test('spear remains an editable neutral source with a centered square player', () => {
  const spear = createSpearGeometry(screen), source = new Float32Array(spear.attributes.position.array)
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
