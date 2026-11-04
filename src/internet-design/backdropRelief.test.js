import assert from 'node:assert/strict'
import test from 'node:test'
import * as THREE from 'three'
import { buildReliefPixels, loadBackdropRelief } from './backdropRelief.js'

function raster(width, height, alphaAt, colorAt = () => [24, 24, 24]) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const k = (y * width + x) * 4, color = colorAt(x, y)
    pixels[k] = color[0]; pixels[k + 1] = color[1]; pixels[k + 2] = color[2]; pixels[k + 3] = alphaAt(x, y)
  }
  return pixels
}

const rect = (x, y) => x >= 8 && x <= 24 && y >= 8 && y <= 24 ? 255 : 0

test('alpha creates a negative inset with a flat interior and outward-free background', () => {
  const result = buildReliefPixels(raster(33, 33, rect), 33, 33)
  assert.equal(result.heightField[16 * 33 + 16], Math.fround(-2.2))
  assert.equal(result.heightField[0], 0)
  assert.ok(result.heightField[16 * 33 + 8] < 0)
  assert.ok(result.heightField[16 * 33 + 8] > result.heightField[16 * 33 + 12])
  assert.deepEqual(Array.from(result.normalRGBA.subarray(0, 4)), [128, 128, 255, 255])
  assert.deepEqual(Array.from(result.normalRGBA.subarray((16 * 33 + 16) * 4, (16 * 33 + 16) * 4 + 4)), [128, 128, 255, 255])
})

test('normal tangent signs match UV-up and symmetric bevels remain unit length', () => {
  const result = buildReliefPixels(raster(33, 33, rect), 33, 33)
  const pixel = (x, y) => result.normalRGBA.subarray((y * 33 + x) * 4, (y * 33 + x) * 4 + 4)
  assert.ok(pixel(9, 16)[0] > 128)
  assert.ok(pixel(23, 16)[0] < 128)
  assert.ok(pixel(16, 9)[1] < 128)
  assert.ok(pixel(16, 23)[1] > 128)
  assert.ok(Math.abs(pixel(9, 16)[0] + pixel(23, 16)[0] - 255) <= 1)
  assert.ok(Math.abs(pixel(16, 9)[1] + pixel(16, 23)[1] - 255) <= 1)
  for (let k = 0; k < result.normalRGBA.length; k += 4) {
    const x = result.normalRGBA[k] / 255 * 2 - 1, y = result.normalRGBA[k + 1] / 255 * 2 - 1, z = result.normalRGBA[k + 2] / 255 * 2 - 1
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 0.012)
    assert.ok(z > 0)
  }
})

test('RGB lighting and color noise do not affect relief, while alpha antialiasing is exact', () => {
  const alpha = (x, y) => rect(x, y) || (x === 7 && y >= 8 && y <= 24 ? 90 : 0)
  const plain = raster(33, 33, alpha)
  const noisy = raster(33, 33, alpha, (x, y) => [(x * 17 + y * 31) % 256, (x * 83 + y * 29) % 256, (x * 41 + y * 101) % 256])
  const a = buildReliefPixels(plain, 33, 33), b = buildReliefPixels(noisy, 33, 33)
  assert.deepEqual(a.normalRGBA, b.normalRGBA)
  assert.deepEqual(a.wornNormalRGBA, b.wornNormalRGBA)
  assert.deepEqual(a.maskRGBA, b.maskRGBA)
  for (let i = 0; i < plain.length / 4; i++) for (let channel = 0; channel < 4; channel++) assert.equal(a.maskRGBA[i * 4 + channel], plain[i * 4 + 3])
  assert.equal(a.maskRGBA[(16 * 33 + 7) * 4 + 1], 90)
})

test('letter counters and exterior stay on the same flat wall without shadow or cutout maps', () => {
  const source = raster(41, 41, (x, y) => x >= 6 && x <= 34 && y >= 6 && y <= 34 && !(x >= 13 && x <= 27 && y >= 13 && y <= 27) ? 255 : 0)
  const result = buildReliefPixels(source, 41, 41)
  assert.equal(result.maskRGBA[(20 * 41 + 20) * 4 + 1], 0)
  assert.equal(result.heightField[20 * 41 + 20], 0)
  for (let y = 13; y <= 27; y++) for (let x = 13; x <= 27; x++) {
    assert.equal(result.cleanHeightField[y * 41 + x], 0)
    assert.equal(result.wornHeightField[y * 41 + x], 0)
  }
  for (const pixels of [result.cleanNormalRGBA, result.wornNormalRGBA]) {
    assert.deepEqual(Array.from(pixels.subarray((20 * 41 + 20) * 4, (20 * 41 + 20) * 4 + 4)), [128, 128, 255, 255])
    assert.deepEqual(Array.from(pixels.subarray(0, 4)), [128, 128, 255, 255])
  }
  assert.equal(result.shadowRGBA, undefined)
})

test('raster-boundary letters produce finite bevels and malformed masks fail clearly', () => {
  const source = raster(24, 24, (x, y) => x < 16 && y >= 3 && y < 21 ? 255 : 0)
  const result = buildReliefPixels(source, 24, 24)
  assert.ok(result.heightField[12 * 24] < 0)
  assert.ok(result.heightField[12 * 24] > result.heightField[12 * 24 + 7])
  assert.ok(result.heightField.every(Number.isFinite))
  assert.throws(() => buildReliefPixels(new Uint8Array(16), 0, 4), /dimensions/)
  assert.throws(() => buildReliefPixels(new Uint8Array(16), 4, 4), /exactly/)
  assert.throws(() => buildReliefPixels(new Uint8Array(64), 4, 4), /nonempty/)
  assert.throws(() => buildReliefPixels(new Uint8Array(64).fill(255), 4, 4), /full-frame/)
  assert.throws(() => buildReliefPixels([], 4096, 4096), /at most/)
})

test('full 2048px artwork builds within a bounded one-time CPU budget', () => {
  const width = 2048, height = 725
  const source = raster(width, height, (x, y) => {
    const row = y % 140, column = x % 110
    return row >= 20 && row < 80 && column >= 8 && column < 100 && (row < 26 || row >= 74 || column < 14 || column >= 94) ? 255 : 0
  })
  const start = performance.now(), result = buildReliefPixels(source, width, height), elapsed = performance.now() - start
  assert.equal(result.normalRGBA.length, source.length)
  assert.ok(result.coverage > 0 && result.coverage < 0.5)
  assert.ok(elapsed < 5000, `Unexpected relief build cost: ${elapsed.toFixed(0)}ms`)
  console.log(`2048×725 clean + worn relief: ${elapsed.toFixed(0)}ms; maps ${(source.length * 2 / 1048576).toFixed(1)}MiB`)
})

test('loader shares its promise and explicitly uploads bottom-up normal maps without flipY', async () => {
  const originalImage = globalThis.Image, originalDocument = globalThis.document
  let loads = 0
  const width = 2048, height = 2
  const source = raster(width, height, (x, y) => y === 0 && x < 2 ? 255 : y === 1 && x >= width - 2 ? 180 : 0)
  try {
    globalThis.Image = class {
      naturalWidth = width
      naturalHeight = height
      set src(value) { loads++; queueMicrotask(() => this.onload()) }
    }
    globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return { clearRect() {}, drawImage() {}, getImageData() { return { data: source } } } } } } }
    const a = loadBackdropRelief('/test/relief-orientation.svg'), b = loadBackdropRelief('/test/relief-orientation.svg')
    assert.equal(a, b)
    const result = await a
    assert.equal(loads, 1)
    assert.equal(result.width, width)
    assert.equal(result.aspect, width / height)
    assert.equal(result.normalMap.flipY, false)
    assert.equal(result.normalMap.colorSpace, THREE.NoColorSpace)
    const expected = buildReliefPixels(source, width, height), stride = width * 4
    for (let y = 0; y < height; y++) {
      const from = (height - y - 1) * stride
      assert.deepEqual(result.normalMap.image.data.subarray(y * stride, (y + 1) * stride), expected.cleanNormalRGBA.subarray(from, from + stride))
      assert.deepEqual(result.wornNormalMap.image.data.subarray(y * stride, (y + 1) * stride), expected.wornNormalRGBA.subarray(from, from + stride))
    }
    assert.ok([result.normalMap, result.wornNormalMap].every((texture) => texture instanceof THREE.DataTexture))
    assert.equal(result.maskMap, undefined)
    assert.equal(result.shadowMap, undefined)
    assert.equal(result.wornNormalMap.flipY, false)
    assert.equal(result.wornNormalMap.colorSpace, THREE.NoColorSpace)
  } finally {
    if (originalImage === undefined) delete globalThis.Image
    else globalThis.Image = originalImage
    if (originalDocument === undefined) delete globalThis.document
    else globalThis.document = originalDocument
  }
})

test('wear rounds and erodes carved depth while retaining source alpha, layout and flat exterior', () => {
  const width = 256, height = 96
  const source = raster(width, height, (x, y) => x % 32 >= 7 && x % 32 <= 24 && y >= 10 && y <= 85 ? 255 : 0)
  const copy = new Uint8ClampedArray(source)
  const clean = buildReliefPixels(source, width, height)
  const partial = buildReliefPixels(source, width, height, { wear: 0.6 })
  const worn = buildReliefPixels(source, width, height, { wear: 1 })
  let changed = 0, eroded = 0
  for (let i = 0; i < width * height; i++) {
    const a = clean.heightField[i], b = partial.heightField[i], c = worn.heightField[i]
    assert.ok(Number.isFinite(a + b + c))
    assert.ok(c <= 0 && c >= a - 1e-6)
    assert.ok(b >= a - 1e-6 && b <= c + 1e-6)
    assert.ok(Math.abs(b - (a + (c - a) * 0.6)) < 1e-6)
    if (source[i * 4 + 3] === 0) assert.equal(c, 0)
    else {
      if (Math.abs(c - a) > 0.01) changed++
      if (a < 0 && c === 0) eroded++
    }
  }
  assert.ok(changed > clean.occupiedPixels * 0.5)
  assert.ok(eroded > 100)
  const centers = Array.from({ length: 8 }, (_, i) => worn.heightField[48 * width + i * 32 + 15])
  assert.ok(centers.every((height) => height < -0.05), 'Wear must retain part of every letter, rather than delete whole words.')
  assert.ok(Math.max(...centers) - Math.min(...centers) > 0.2, 'Wear should fade regional portions by visibly different amounts.')
  assert.deepEqual(source, copy)
  assert.deepEqual(clean.maskRGBA, partial.maskRGBA)
  assert.deepEqual(clean.maskRGBA, worn.maskRGBA)
  assert.deepEqual(Array.from(worn.normalRGBA.subarray(0, 4)), [128, 128, 255, 255])
})

test('wear is deterministic, seedable and encoded into finite unit tangent normals', () => {
  const source = raster(96, 80, (x, y) => x >= 8 && x < 88 && y >= 8 && y < 72 ? 255 : 0)
  const a = buildReliefPixels(source, 96, 80, { wear: 0.6, seed: 26 })
  const b = buildReliefPixels(source, 96, 80, { wear: 0.6, seed: 26 })
  const c = buildReliefPixels(source, 96, 80, { wear: 0.6, seed: 27 })
  assert.deepEqual(a.wornHeightField, b.wornHeightField)
  assert.deepEqual(a.wornNormalRGBA, b.wornNormalRGBA)
  assert.deepEqual(a.normalRGBA, b.normalRGBA)
  assert.notDeepEqual(a.wornNormalRGBA, c.wornNormalRGBA)
  assert.deepEqual(a.cleanNormalRGBA, c.cleanNormalRGBA)
  for (const pixels of [a.normalRGBA, a.wornNormalRGBA]) for (let k = 0; k < pixels.length; k += 4) {
    const x = pixels[k] / 255 * 2 - 1, y = pixels[k + 1] / 255 * 2 - 1, z = pixels[k + 2] / 255 * 2 - 1
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 0.012)
    assert.ok(z > 0)
    assert.equal(pixels[k + 3], 255)
  }
})
