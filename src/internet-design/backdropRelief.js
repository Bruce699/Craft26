import * as THREE from 'three'

const MAX_SIDE = 2048
const MAX_PIXELS = MAX_SIDE * MAX_SIDE
const DIAGONAL = Math.SQRT2
const cache = new Map()
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const smoothstep = (value) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t) }

function hash2D(a, b, seed) {
  let value = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(seed, 1274126177)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function noise2D(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = smoothstep(x - ix), fy = smoothstep(y - iy)
  const a = hash2D(ix, iy, seed), b = hash2D(ix + 1, iy, seed), c = hash2D(ix, iy + 1, seed), d = hash2D(ix + 1, iy + 1, seed)
  return a + (b - a) * fx + (c + (d - c) * fx - a - (b - a) * fx) * fy
}

function normalPixels(heightField, width, height) {
  const output = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, k = i * 4
    const dx = (heightField[y * width + Math.min(width - 1, x + 1)] - heightField[y * width + Math.max(0, x - 1)]) * 0.5
    const dy = (heightField[Math.min(height - 1, y + 1) * width + x] - heightField[Math.max(0, y - 1) * width + x]) * 0.5
    const inverseLength = 1 / Math.hypot(dx, dy, 1)
    output[k] = Math.round((-dx * inverseLength * 0.5 + 0.5) * 255)
    // Image Y points down, UV V points up: normalY = +dHeight/dImageY.
    // Runtime upload reverses pixel rows separately; never invert this sign.
    output[k + 1] = Math.round((dy * inverseLength * 0.5 + 0.5) * 255)
    output[k + 2] = Math.round((inverseLength * 0.5 + 0.5) * 255)
    output[k + 3] = 255
  }
  return output
}

function insideDistanceField(mask, width, height) {
  const distance = new Float32Array(mask.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x
    // The area beyond the raster is transparent, including letters that touch
    // an SVG boundary. This gives those edges a bevel rather than infinity.
    distance[i] = mask[i] ? Math.min(x + 1, y + 1, width - x, height - y) : 0
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x
    let value = distance[i]
    if (x > 0) value = Math.min(value, distance[i - 1] + 1)
    if (y > 0) {
      value = Math.min(value, distance[i - width] + 1)
      if (x > 0) value = Math.min(value, distance[i - width - 1] + DIAGONAL)
      if (x + 1 < width) value = Math.min(value, distance[i - width + 1] + DIAGONAL)
    }
    distance[i] = value
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x
    let value = distance[i]
    if (x + 1 < width) value = Math.min(value, distance[i + 1] + 1)
    if (y + 1 < height) {
      value = Math.min(value, distance[i + width] + 1)
      if (x + 1 < width) value = Math.min(value, distance[i + width + 1] + DIAGONAL)
      if (x > 0) value = Math.min(value, distance[i + width - 1] + DIAGONAL)
    }
    distance[i] = value
  }
  return distance
}

/** Pure alpha-to-relief conversion. RGBA outputs and heightField are top-down.
 * RGB from the SVG is deliberately ignored, including its baked inner shadows.
 */
export function buildReliefPixels(rgba, width, height, options = {}) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) {
    throw new Error(`Relief dimensions must be positive integers totaling at most ${MAX_PIXELS} pixels.`)
  }
  const count = width * height
  if (!rgba || rgba.length !== count * 4) throw new Error('Relief source must contain exactly width × height RGBA pixels.')
  const bevelWidth = clamp(Number.isFinite(options.bevelWidth) ? options.bevelWidth : 2, 0.5, 12)
  const depth = clamp(Number.isFinite(options.depth) ? options.depth : 2.2, 0.05, 12)
  const wear = clamp(Number.isFinite(options.wear) ? options.wear : 0, 0, 1)
  const seed = Number.isFinite(options.seed) ? Math.trunc(options.seed) | 0 : 26
  const mask = new Uint8Array(count), maskRGBA = new Uint8Array(count * 4)
  let occupied = 0, alphaSum = 0
  for (let i = 0; i < count; i++) {
    const k = i * 4, alpha = rgba[k + 3]
    mask[i] = alpha >= 128 ? 1 : 0
    occupied += mask[i]; alphaSum += alpha
    maskRGBA[k] = alpha; maskRGBA[k + 1] = alpha; maskRGBA[k + 2] = alpha; maskRGBA[k + 3] = alpha
  }
  if (!occupied) throw new Error('The backdrop SVG has no nonempty alpha mask.')
  if (occupied === count) throw new Error('The backdrop SVG has an opaque full-frame background; a transparent letter mask is required.')

  const insideDistance = insideDistanceField(mask, width, height)
  const cleanHeightField = new Float32Array(count), wornHeightField = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    if (!mask[i]) continue
    const x = i % width, y = Math.floor(i / width)
    const edgeDistance = Math.max(0, insideDistance[i] - 0.5), alpha = rgba[i * 4 + 3] / 255
    cleanHeightField[i] = -depth * smoothstep(edgeDistance / bevelWidth) * alpha
    // Spatial fields erode only the relief, never the source alpha or layout.
    // Large patches fade portions of lettering; finer fields break and round
    // bevel edges. No raised rim, floating word shape, or outside displacement.
    const regional = noise2D(x / 68 + 17.3, y / 68 - 31.7, seed)
    const erosion = noise2D(x / 9.5 + 3.1, y / 9.5 + 29.2, seed + 71)
    const rounding = noise2D(x / 22 - 8.4, y / 22 + 11.8, seed + 137)
    const edgeWear = 1 - smoothstep(edgeDistance / (bevelWidth * 2))
    const wornDistance = Math.max(0, edgeDistance - edgeWear * (0.25 + erosion * 1.4 + rounding * 0.65))
    const wornBevel = bevelWidth * (1.15 + rounding * 0.5)
    const fadedPatch = smoothstep((regional - 0.25) / 0.55)
    const retainedDepth = 0.18 + 0.82 * (1 - fadedPatch) * (0.65 + erosion * 0.35)
    wornHeightField[i] = -depth * smoothstep(wornDistance / wornBevel) * retainedDepth * alpha
  }
  const heightField = wear === 0 ? cleanHeightField : wear === 1 ? wornHeightField : new Float32Array(count)
  if (wear > 0 && wear < 1) for (let i = 0; i < count; i++) heightField[i] = cleanHeightField[i] + (wornHeightField[i] - cleanHeightField[i]) * wear
  const cleanNormalRGBA = normalPixels(cleanHeightField, width, height)
  const wornNormalRGBA = normalPixels(wornHeightField, width, height)
  const normalRGBA = wear === 0 ? cleanNormalRGBA : wear === 1 ? wornNormalRGBA : normalPixels(heightField, width, height)
  return {
    width, height, aspect: width / height,
    normalRGBA, cleanNormalRGBA, wornNormalRGBA, maskRGBA,
    heightField, cleanHeightField, wornHeightField,
    coverage: alphaSum / (255 * count), occupiedPixels: occupied,
  }
}

function textureFromTopDown(pixels, width, height, name) {
  const bottomUp = new Uint8Array(pixels.length), stride = width * 4
  for (let y = 0; y < height; y++) bottomUp.set(pixels.subarray(y * stride, (y + 1) * stride), (height - y - 1) * stride)
  const texture = new THREE.DataTexture(bottomUp, width, height, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.name = name
  texture.flipY = false
  texture.colorSpace = THREE.NoColorSpace
  texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

function rasterize(url) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined' || typeof document === 'undefined') { reject(new Error('Backdrop relief loading requires a browser canvas.')); return }
    const image = new Image()
    image.decoding = 'async'
    image.crossOrigin = 'anonymous'
    image.onerror = () => reject(new Error(`Could not load the backdrop SVG: ${url}`))
    image.onload = () => {
      try {
        const naturalWidth = image.naturalWidth, naturalHeight = image.naturalHeight
        if (!naturalWidth || !naturalHeight) throw new Error('The backdrop SVG has no valid intrinsic dimensions.')
        const scale = MAX_SIDE / Math.max(naturalWidth, naturalHeight)
        const width = Math.max(1, Math.round(naturalWidth * scale)), height = Math.max(1, Math.round(naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('A 2D canvas could not be created for the backdrop relief.')
        context.clearRect(0, 0, width, height)
        context.drawImage(image, 0, 0, width, height)
        const pixels = buildReliefPixels(context.getImageData(0, 0, width, height).data, width, height)
        const result = {
          normalMap: textureFromTopDown(pixels.cleanNormalRGBA, width, height, 'Backdrop clean carved-letter normals'),
          wornNormalMap: textureFromTopDown(pixels.wornNormalRGBA, width, height, 'Backdrop worn carved-letter normals'),
          width, height, aspect: naturalWidth / naturalHeight,
          coverage: pixels.coverage,
        }
        canvas.width = 1; canvas.height = 1
        resolve(result)
      } catch (error) { reject(error) }
    }
    image.src = url
  })
}

/** Shared textures are cached for app lifetime; consumers must not dispose them. */
export function loadBackdropRelief(url) {
  if (typeof url !== 'string' || !url.trim()) return Promise.reject(new Error('A backdrop SVG URL is required.'))
  if (!cache.has(url)) cache.set(url, rasterize(url))
  return cache.get(url)
}
