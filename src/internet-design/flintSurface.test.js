import assert from 'node:assert/strict'
import test from 'node:test'
import { BASE, GRADIENT_RANGE, SURFACE_BOUNDS, TIP, bakeFlintSurface, bladeEdges, flintSurface } from './flintSurface.js'

test('traced outline is a barbed, corner-notched point leaning the way the reference does', () => {
  const width = (v) => { const [left, right] = bladeEdges(v); return right - left }
  assert.ok(width(TIP) < 1 && width(TIP - 10) > 8)
  // Widest at the barbs, cinched at the notches, flaring again down the stem.
  assert.ok(width(-9) > 54 && width(-12.5) < 42 && width(-18) > 46)
  // Excurvate blade: mid-height is wider than a straight tip-to-barb taper.
  assert.ok(width(23) > width(-9) / 2 + 1)
  // The tip sits to the right of the axis and the left barb reaches further.
  const [tipLeft] = bladeEdges(TIP), [barbLeft, barbRight] = bladeEdges(-9)
  assert.ok(tipLeft > 1 && -barbLeft > barbRight)
  for (let v = BASE; v <= TIP; v += 0.5) {
    const [left, right] = bladeEdges(v)
    assert.ok(left < right && left > SURFACE_BOUNDS.u && right < SURFACE_BOUNDS.u + SURFACE_BOUNDS.width)
  }
})

test('bake is deterministic and the shared surface is built once', () => {
  const a = bakeFlintSurface(4), b = bakeFlintSurface(4)
  assert.equal(a.cols, SURFACE_BOUNDS.width * 4)
  assert.equal(a.rows, SURFACE_BOUNDS.height * 4)
  assert.deepEqual(a.field, b.field)
  assert.deepEqual(a.relief, b.relief)
  assert.equal(flintSurface(), flintSurface())
})

test('faces are flaked: thin at the margin, full in the middle, and faceted between', () => {
  const surface = flintSurface(), { cols, rows, density, relief } = surface
  assert.ok(surface.sample(0, 10) > 3.5 && surface.sample(0, 10) < 6.5)
  for (const v of [-20, 0, 20, 40]) {
    const [left, right] = bladeEdges(v)
    assert.ok(surface.sample(left + 0.4, v) < 1.6 && surface.sample(right - 0.4, v) < 1.6)
    assert.equal(surface.sample(left - 3, v), 0)
  }
  // Outside the outline the map is neutral; inside, slopes vary widely because
  // scars meet at arrises. A smooth lens would keep them within a narrow band.
  assert.deepEqual([...relief.subarray(0, 4)], [128, 128, 128, 128])
  const decode = (byte) => { const e = byte / 127.5 - 1; return e * Math.abs(e) * GRADIENT_RANGE }
  let steep = 0, flat = 0, inside = 0
  for (let y = 0; y < rows; y += 3) {
    const v = SURFACE_BOUNDS.v + (y + 0.5) / density, [left, right] = bladeEdges(v)
    if (v < BASE + 4 || v > TIP - 8) continue
    for (let x = 0; x < cols; x += 3) {
      const u = SURFACE_BOUNDS.u + (x + 0.5) / density
      if (u < left + 4 || u > right - 4) continue
      const k = (y * cols + x) * 4, slope = Math.hypot(decode(relief[k]), decode(relief[k + 1]))
      inside++
      if (slope > 0.25) steep++
      if (slope < 0.08) flat++
    }
  }
  assert.ok(inside > 5000)
  assert.ok(steep / inside > 0.2 && steep / inside < 0.8 && flat / inside > 0.03)
})
