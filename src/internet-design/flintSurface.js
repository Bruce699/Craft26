// A knapped flint point, modelled the way one is made: a lens-shaped blank is
// reduced by a sequence of flake removals. Every removal is a shallow dished
// fracture surface struck from the margin; the stone keeps the lowest surface.
// Arrises, the wandering midline and the bevelled edge all fall out of that.
//
// Blade space: u = visible right, v = up (tip), heights are outward from the
// mid-plane. The same field drives the mesh (blurred) and the shading (rest).

export const TIP = 55
export const BASE = -29

// Left/right margins traced from the reference photograph, tip to heel, at
// equal height steps. The axis passes through the player, not the tip.
const OUTLINE = [
  [2.17,2.37], [0.79,3.16], [0.2,3.55], [-0.1,3.95], [-0.39,4.24], [-0.89,4.84],
  [-1.28,4.74], [-1.58,4.84], [-1.97,5.23], [-2.37,5.43], [-2.76,5.63], [-3.06,6.32],
  [-3.45,6.42], [-3.95,6.51], [-4.24,6.71], [-4.74,6.91], [-5.13,7.3], [-5.63,7.6],
  [-6.02,8], [-6.42,8.69], [-6.71,8.98], [-6.91,9.08], [-7.21,9.18], [-7.6,9.87],
  [-8.09,10.66], [-8.29,10.96], [-8.78,10.96], [-9.08,11.06], [-9.28,11.15], [-9.57,11.35],
  [-9.87,11.84], [-10.17,12.73], [-10.27,13.23], [-10.46,13.52], [-10.66,13.82], [-10.86,14.02],
  [-11.35,14.21], [-11.65,14.41], [-12.04,14.71], [-12.44,15], [-12.83,15.69], [-13.33,15.89],
  [-13.62,16.19], [-13.92,16.58], [-14.31,16.98], [-15.1,17.27], [-15.69,17.67], [-15.99,17.87],
  [-16.19,17.96], [-16.48,18.16], [-16.88,18.46], [-17.27,18.66], [-17.27,18.85], [-17.77,19.15],
  [-18.36,19.25], [-18.66,19.54], [-18.85,20.04], [-19.05,20.24], [-19.64,20.33], [-19.94,20.43],
  [-20.33,20.43], [-20.53,20.53], [-21.02,20.83], [-21.32,21.32], [-21.62,21.62], [-21.81,22.11],
  [-22.01,22.51], [-22.21,22.8], [-22.51,22.8], [-22.8,23], [-23.1,23.39], [-23.39,23.69],
  [-23.89,23.99], [-24.38,24.38], [-24.58,24.68], [-24.68,24.97], [-24.97,25.27], [-25.57,25.66],
  [-25.96,25.66], [-26.35,25.66], [-26.65,25.86], [-26.85,26.16], [-27.05,26.45], [-27.24,26.75],
  [-27.54,26.95], [-27.64,27.34], [-27.74,27.34], [-27.84,27.14], [-27.74,26.85], [-19.15,19.25],
  [-19.84,19.45], [-22.01,19.64], [-22.31,21.42], [-22.6,23.49], [-22.7,24.38], [-22.9,25.07],
  [-22.9,25.37], [-22.51,25.76], [-22.31,25.86], [-22.01,25.86], [-21.91,25.27], [-21.72,24.97],
  [-21.22,24.87], [-20.24,24.28], [-18.95,23.49], [-18.36,22.7], [-17.47,21.12], [-16.19,18.95],
  [-14.41,17.67], [-13.23,14.31], [-10.66,12.24], [-6.51,9.67], [-4.15,-3.16],

]

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const smooth = (value) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t) }

/** Signed left and right margin of the point at height v. */
export function bladeEdges(v) {
  const t = clamp((TIP - v) / (TIP - BASE), 0, 1) * (OUTLINE.length - 1)
  const i = Math.min(OUTLINE.length - 2, Math.floor(t)), f = t - i
  const a = OUTLINE[i], b = OUTLINE[i + 1]
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
}

// A little clear of the outline on every side, for filtering at the margin.
export const SURFACE_BOUNDS = Object.freeze({ u: -30, v: -31, width: 60, height: 88 })
// Slopes are stored as sign(e) * e^2 * GRADIENT_RANGE, which keeps 8 bits fine
// on the near-flat scars while still reaching the steep bevel at the margin.
export const GRADIENT_RANGE = 1.8

function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Fully mixed integer hash: a weaker one leaves diagonal streaks in the grain.
function lattice(x, y, seed) {
  let h = Math.imul(x, 0x27D4EB2D) ^ Math.imul(y + 0x165667B1 | 0, 0x9E3779B1) ^ Math.imul(seed, 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B)
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y)
  let fx = x - ix, fy = y - iy
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy)
  const a = lattice(ix, iy, seed), b = lattice(ix + 1, iy, seed)
  const c = lattice(ix, iy + 1, seed), d = lattice(ix + 1, iy + 1, seed)
  return (a + (b - a) * fx + (c + (d - c) * fx - a - (b - a) * fx) * fy) * 2 - 1
}

// Exact Euclidean distance to the nearest texel outside the outline.
function distanceInside(inside, cols, rows) {
  const INF = 1e20, size = Math.max(cols, rows)
  const f = new Float64Array(size), d = new Float64Array(size), z = new Float64Array(size + 1)
  const v = new Int32Array(size), out = new Float32Array(cols * rows)
  function pass(n) {
    let k = 0
    v[0] = 0; z[0] = -INF; z[1] = INF
    for (let q = 1; q < n; q++) {
      let s
      do {
        const p = v[k]
        s = ((f[q] + q * q) - (f[p] + p * p)) / (2 * q - 2 * p)
      } while (s <= z[k] && --k >= 0)
      k++
      v[k] = q; z[k] = s; z[k + 1] = INF
    }
    k = 0
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++
      const p = v[k]
      d[q] = (q - p) * (q - p) + f[p]
    }
  }
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) f[y] = inside[y * cols + x] ? INF : 0
    pass(rows)
    for (let y = 0; y < rows; y++) out[y * cols + x] = d[y]
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) f[x] = out[y * cols + x]
    pass(cols)
    for (let x = 0; x < cols; x++) out[y * cols + x] = Math.sqrt(d[x])
  }
  return out
}

function blur(source, cols, rows, radius, passes = 3) {
  let a = Float32Array.from(source), b = new Float32Array(source.length)
  const span = radius * 2 + 1
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < rows; y++) {
      const row = y * cols
      let sum = a[row] * (radius + 1)
      for (let x = 1; x <= radius; x++) sum += a[row + Math.min(cols - 1, x)]
      for (let x = 0; x < cols; x++) {
        b[row + x] = sum / span
        sum += a[row + Math.min(cols - 1, x + radius + 1)] - a[row + Math.max(0, x - radius)]
      }
    }
    for (let x = 0; x < cols; x++) {
      let sum = b[x] * (radius + 1)
      for (let y = 1; y <= radius; y++) sum += b[Math.min(rows - 1, y) * cols + x]
      for (let y = 0; y < rows; y++) {
        a[y * cols + x] = sum / span
        sum += b[Math.min(rows - 1, y + radius + 1) * cols + x] - b[Math.max(0, y - radius) * cols + x]
      }
    }
  }
  return a
}

// The removal sequence. Thinning flakes run from a margin to or past the
// midline; the later pressure retouch is short, steep and closely spaced.
function removals(rand) {
  const list = []
  const strike = (side, v, spec) => {
    const edge = bladeEdges(v)[side], above = bladeEdges(v + 4)[side], below = bladeEdges(v - 4)[side]
    // Inward normal of the general margin, ignoring serrations and the notch.
    let nx = 8, ny = -clamp(above - below, -6, 6)
    if (side === 1) { nx = -nx; ny = -ny }
    const length = Math.hypot(nx, ny), turn = spec.turn
    nx /= length; ny /= length
    list.push({
      ...spec, u: edge, v,
      dx: nx * Math.cos(turn) - ny * Math.sin(turn), dy: nx * Math.sin(turn) + ny * Math.cos(turn),
    })
  }
  const thinning = []
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < 9; k++) {
      const v = -7 + (k + 0.15 + rand() * 0.7) * 6.3
      const [left, right] = bladeEdges(v), half = (right - left) / 2
      thinning.push([side, v, {
        length: half * (0.8 + rand() * 0.6), half: clamp(half * 0.2 + 1.3, 1.8, 5.4) * (0.8 + rand() * 0.45),
        cup: 0.5 + rand() * 0.35, start: 0.14 + rand() * 0.2, cut: 0.25 + rand() * 0.5,
        bulb: 0.14 + rand() * 0.16, ripple: 0.004 + rand() * 0.007, wave: 1.5 + rand() * 1.1,
        turn: (rand() - 0.55) * 0.75,
      }])
    }
    // Stem margins below the notches.
    for (const v of [-17.5 - rand() * 1.5, -23 - rand() * 1.5]) thinning.push([side, v, {
      length: 8 + rand() * 5, half: 2.6 + rand() * 1.2, cup: 0.5 + rand() * 0.3, start: 0.15 + rand() * 0.15,
      cut: 0.25 + rand() * 0.35, bulb: 0.15, ripple: 0.006, wave: 1.6 + rand(), turn: (rand() - 0.5) * 0.6,
    }])
  }
  for (let i = thinning.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1)); [thinning[i], thinning[j]] = [thinning[j], thinning[i]]
  }
  for (const [side, v, spec] of thinning) strike(side, v, spec)
  // Basal thinning, struck upward from the heel.
  for (const along of [0.24, 0.5, 0.76]) {
    const v = BASE + 2.2, [left, right] = bladeEdges(v), turn = (rand() - 0.5) * 0.5
    list.push({
      u: left + (right - left) * (along + (rand() - 0.5) * 0.1), v: BASE + 0.6, dx: Math.sin(turn), dy: Math.cos(turn),
      length: 8 + rand() * 9, half: 3 + rand() * 1.8, cup: 0.28 + rand() * 0.2, start: 0.18, cut: 0.2 + rand() * 0.3,
      bulb: 0.16, ripple: 0.006, wave: 1.7 + rand(), turn,
    })
  }
  for (let side = 0; side < 2; side++) {
    for (let v = BASE + 1.5 + rand(); v < TIP - 1.5; v += 1.7 + rand() * 1.1) {
      const [left, right] = bladeEdges(v), half = (right - left) / 2
      strike(side, v, {
        // Retouch skims a thin chip off whatever face is already there.
        skim: 0.1 + rand() * 0.22, length: Math.min(half * 0.9, 2.2 + rand() * 2.6), half: 1.1 + rand() * 0.9,
        cup: 0, start: 0, cut: 0, bulb: 0,
        ripple: 0.003, wave: 0.9 + rand() * 0.5, turn: (rand() - 0.5) * 0.4,
      })
    }
  }
  return list
}

const DENSITY = 12

/**
 * The bake itself: pure typed-array work with no DOM, so it can run in a
 * worker. `field` is the mesh-scale half thickness in blade units; `relief`
 * packs the full-detail face as (dH/du, dH/dv, tone, roughness).
 */
export function bakeFlintSurface(density = DENSITY) {
  const cols = SURFACE_BOUNDS.width * density, rows = SURFACE_BOUNDS.height * density, count = cols * rows
  const step = 1 / density, originU = SURFACE_BOUNDS.u + step / 2, originV = SURFACE_BOUNDS.v + step / 2
  const inside = new Uint8Array(count)
  for (let y = 0; y < rows; y++) {
    const v = originV + y * step
    if (v < BASE || v > TIP) continue
    const [left, right] = bladeEdges(v)
    const from = Math.max(0, Math.ceil((left - originU) / step)), to = Math.min(cols - 1, Math.floor((right - originU) / step))
    for (let x = from; x <= to; x++) inside[y * cols + x] = 1
  }
  const distance = distanceInside(inside, cols, rows)
  // Biconvex blank: roughly a fifth as thick as it is wide, with no keel.
  const blank = new Float32Array(count), height = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    if (!inside[i]) continue
    const reach = 1 - Math.min(1, distance[i] * step / 15)
    blank[i] = height[i] = 6.4 * Math.pow(1 - reach * reach, 0.72)
  }
  const at = (u, v) => {
    const x = clamp(Math.round((u - originU) / step), 0, cols - 1), y = clamp(Math.round((v - originV) / step), 0, rows - 1)
    return y * cols + x
  }
  const rand = random(4301)
  for (const flake of removals(rand)) {
    let { length } = flake
    // A flake cannot run out through the far margin.
    while (length > 1.5 && distance[at(flake.u + flake.dx * length, flake.v + flake.dy * length)] * step < 1.6) length *= 0.86
    const rise = Math.max(0.18, height[at(flake.u + flake.dx * length, flake.v + flake.dy * length)] - flake.cut - flake.start)
    const far = flake.skim ? length : length * 1.4, wide = flake.half * (flake.skim ? 1.25 : 4)
    const corners = [[-2, -wide], [-2, wide], [far, -wide], [far, wide]].map(([a, b]) => [
      flake.u + flake.dx * a - flake.dy * b, flake.v + flake.dy * a + flake.dx * b,
    ])
    const x0 = Math.max(0, Math.floor((Math.min(...corners.map(c => c[0])) - originU) / step))
    const x1 = Math.min(cols - 1, Math.ceil((Math.max(...corners.map(c => c[0])) - originU) / step))
    const y0 = Math.max(0, Math.floor((Math.min(...corners.map(c => c[1])) - originV) / step))
    const y1 = Math.min(rows - 1, Math.ceil((Math.max(...corners.map(c => c[1])) - originV) / step))
    const frequency = Math.PI * 2 / flake.wave
    for (let y = y0; y <= y1; y++) {
      const dv = originV + y * step - flake.v
      // Clip this row to the flake's own oriented footprint.
      let from = -Infinity, to = Infinity
      if (Math.abs(flake.dx) > 1e-6) {
        const p = (-2 - dv * flake.dy) / flake.dx, q = (far - dv * flake.dy) / flake.dx
        from = Math.min(p, q); to = Math.max(p, q)
      }
      if (Math.abs(flake.dy) > 1e-6) {
        const p = (dv * flake.dx - wide) / flake.dy, q = (dv * flake.dx + wide) / flake.dy
        from = Math.max(from, Math.min(p, q)); to = Math.min(to, Math.max(p, q))
      }
      const first = Math.max(x0, Math.floor((flake.u + from - originU) / step)), last = Math.min(x1, Math.ceil((flake.u + to - originU) / step))
      for (let x = first; x <= last; x++) {
        const i = y * cols + x
        if (!inside[i]) continue
        const du = originU + x * step - flake.u
        const a = du * flake.dx + dv * flake.dy
        if (a < -2 || a > far) continue
        const b = dv * flake.dx - du * flake.dy
        const t = a / length, across = b / (flake.half * (0.72 + 0.5 * clamp(t, 0, 1)))
        if (flake.skim) {
          if (t >= 1 || Math.abs(across) >= 1) continue
          const along = 1 - Math.max(0, t)
          height[i] = Math.max(0.04, height[i] - flake.skim * along * Math.sqrt(along) * (1 - across * across))
          continue
        }
        let surface = flake.start + flake.cup * across * across
        // Climbs under the old face, flattens, then feathers out at its end.
        if (t < 1) surface += rise * (1 - (1 - t) * (1 - t))
        else surface += rise + 3.2 * ((t - 1) / 0.3) ** 2
        if (surface >= height[i]) continue
        const radius = Math.hypot(a, b)
        surface -= flake.bulb * Math.exp(-radius * radius / 3.4)
        // Ripples open out and fade as the fracture runs away from the blow.
        surface += flake.ripple * Math.sin(Math.pow(radius, 0.85) * frequency) * smooth(radius / 4) * (1 - 0.6 * clamp(t, 0, 1))
        if (surface < height[i]) height[i] = Math.max(0.04, surface)
      }
    }
  }

  // Unflaked remnants of the blank keep their rough nodule cortex.
  const detailed = new Float32Array(count), cortex = new Float32Array(count)
  for (let y = 0; y < rows; y++) {
    const v = originV + y * step
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (!inside[i]) continue
      const u = originU + x * step
      // Fresh chert fractures almost glassy-smooth; its grain is barely there.
      let level = height[i] + noise(u * 2.3, v * 2.3, 11) * 0.004 + noise(u * 4.6, v * 4.6, 12) * 0.0015
      if (height[i] > blank[i] - 0.04 && distance[i] * step > 2) {
        const rind = smooth((height[i] - blank[i] + 0.04) / 0.04) * smooth((distance[i] * step - 2) / 2)
        const pit = Math.max(0, noise(u * 1.9, v * 1.9, 15) - 0.45) + Math.max(0, noise(u * 3.7, v * 3.7, 16) - 0.5) * 0.5
        level += rind * (noise(u * 1.15, v * 1.15, 13) * 0.07 + noise(u * 2.9, v * 2.9, 14) * 0.045 - pit * 0.22)
        cortex[i] = rind
      }
      detailed[i] = level
    }
  }
  const meshField = blur(height, cols, rows, Math.max(1, Math.round(density * 0.42)))
  // Neutral outside the outline: no slope, mid tone, mid roughness.
  const relief = new Uint8Array(count * 4).fill(128)
  const inverseRange = 1 / GRADIENT_RANGE
  for (let y = 0; y < rows; y++) {
    const v = originV + y * step
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (!inside[i]) continue
      // Full slope of the flaked face, so shading never depends on tessellation.
      // A neighbour beyond the margin contributes no slope of its own.
      const here = detailed[i]
      const xa = x > 0 && inside[i - 1] ? detailed[i - 1] : here, xb = x < cols - 1 && inside[i + 1] ? detailed[i + 1] : here
      const ya = y > 0 && inside[i - cols] ? detailed[i - cols] : here, yb = y < rows - 1 && inside[i + cols] ? detailed[i + cols] : here
      const gu = (xb - xa) * density * 0.5, gv = (yb - ya) * density * 0.5
      const fade = smooth((distance[i] - 1.5) / 3)
      const u = originU + x * step
      const ridge = clamp((here - meshField[i]) * 1.7, -0.2, 0.24) * fade
      // Worn arrises read paler, hollows hold patina; cortex is chalkier.
      const tone = (1 + ridge) * (1 + noise(u / 7, v / 7, 21) * 0.1 + noise(u / 2.1, v / 2.1, 22) * 0.05) * (1 + cortex[i] * 0.3)
      const rough = 0.5 - ridge * 0.35 + noise(u / 3.3, v / 3.3, 23) * 0.05 + cortex[i] * 0.32
      // Dither the 8-bit slopes: banding would read as contour lines in a highlight.
      const eu = Math.sqrt(Math.min(1, Math.abs(gu) * inverseRange)), ev = Math.sqrt(Math.min(1, Math.abs(gv) * inverseRange))
      const k = i * 4
      relief[k] = ((gu < 0 ? -eu : eu) * 0.5 + 0.5) * 255 + lattice(x, y, 31)
      relief[k + 1] = ((gv < 0 ? -ev : ev) * 0.5 + 0.5) * 255 + lattice(x, y, 32)
      relief[k + 2] = clamp(tone * 127.5, 0, 255)
      relief[k + 3] = clamp(rough * 255, 0, 255)
    }
  }
  return { cols, rows, density, field: meshField, relief }
}

function withSampler(baked) {
  const { cols, rows, density, field } = baked
  const originU = SURFACE_BOUNDS.u + 0.5 / density, originV = SURFACE_BOUNDS.v + 0.5 / density
  /** Half thickness of the mesh at a blade position. */
  function sample(u, v) {
    const x = clamp((u - originU) * density, 0, cols - 1.001), y = clamp((v - originV) * density, 0, rows - 1.001)
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, i = iy * cols + ix
    const top = field[i] + (field[i + 1] - field[i]) * fx
    const bottom = field[i + cols] + (field[i + cols + 1] - field[i + cols]) * fx
    return top + (bottom - top) * fy
  }
  return { ...baked, sample }
}

let cached, pending

/** The flaked surface, baked on first use and shared by mesh and material. */
export function flintSurface() {
  cached ??= withSampler(bakeFlintSurface())
  return cached
}

export const flintSurfaceReady = () => Boolean(cached)

/**
 * Bakes off the main thread where workers exist, so the page stays responsive
 * while the model and environment are still downloading.
 */
export function loadFlintSurface() {
  if (cached) return Promise.resolve(cached)
  pending ??= new Promise((resolve) => {
    const inline = () => resolve(flintSurface())
    if (typeof Worker === 'undefined') return inline()
    try {
      const worker = new Worker(new URL('./flintSurface.worker.js', import.meta.url), { type: 'module' })
      worker.onmessage = (event) => {
        cached ??= withSampler(event.data)
        worker.terminate()
        resolve(cached)
      }
      worker.onerror = () => { worker.terminate(); inline() }
    } catch {
      inline()
    }
  })
  return pending
}
