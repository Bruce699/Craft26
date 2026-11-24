import * as THREE from 'three'
import { apertureFrame } from './rockGeometry.js'
import { TIP, BASE, bladeEdges, flintSurface } from './flintSurface.js'

// Height of the barbs, where the blade is widest above the corner notches.
const SHOULDER = -10
// The blade's mid-plane sits this far behind the player's original face.
const MIDPLANE = -3
// Lattice pitch of both faces, in model units. The mesh only has to carry
// the outline and the broad facets; finer relief is shaded from the bake.
const PITCH = 0.7
// Least half thickness just inside the margin.
const MARGIN = 0.06

/** Where the blade's own (u, v, height) space sits in model coordinates. */
export function spearBladeFrame(screenGeometry) {
  const { center, u, v, normal } = apertureFrame(screenGeometry)
  return { origin: center.clone().addScaledVector(normal, MIDPLANE), u: u.clone(), v: v.clone(), normal: normal.clone() }
}

/**
 * A solid knapped point, before the player opening is cut. Two faces share one
 * sharp margin: each is a regular lattice clipped to the traced outline, so the
 * silhouette and the flake scars are exact rather than warped from a scan.
 */
export function createSpearGeometry(screenGeometry) {
  const { origin, u, v, normal } = spearBladeFrame(screenGeometry)
  const surface = flintSurface()
  const blade = [], rows = []
  const rowCount = Math.round((TIP - BASE) / PITCH)
  for (let j = 0; j <= rowCount; j++) {
    const height = BASE + (TIP - BASE) * j / rowCount
    const [left, right] = bladeEdges(height)
    // The tip and the heel each close on a single margin point.
    if (j === 0 || j === rowCount) {
      rows.push([blade.length])
      blade.push([(left + right) / 2, height, 0])
      continue
    }
    const row = [blade.length]
    blade.push([left, height, 0])
    // Interior points stay clear of the margin so no face triangle is a sliver.
    const inner = (a) => { row.push(blade.length); blade.push([a, height, Math.max(MARGIN, surface.sample(a, height))]) }
    for (let k = Math.ceil((left + PITCH * 0.35) / PITCH); k * PITCH < right - PITCH * 0.35; k++) inner(k * PITCH)
    // Even the needle tip keeps one interior point, so the solid stays closed.
    if (row.length === 1) inner((left + right) / 2)
    row.push(blade.length)
    blade.push([right, height, 0])
    rows.push(row)
  }
  // Margin points belong to both faces; every interior point gets a twin behind.
  const twin = new Int32Array(blade.length)
  let count = blade.length
  for (let i = 0; i < blade.length; i++) twin[i] = blade[i][2] > 0 ? count++ : i
  const positions = new Float32Array(count * 3), indices = []
  const place = (index, a, b, d) => {
    positions[index * 3] = origin.x + u.x * a + v.x * b + normal.x * d
    positions[index * 3 + 1] = origin.y + u.y * a + v.y * b + normal.y * d
    positions[index * 3 + 2] = origin.z + u.z * a + v.z * b + normal.z * d
  }
  for (let i = 0; i < blade.length; i++) {
    const [a, b, d] = blade[i]
    place(i, a, b, d)
    if (twin[i] !== i) place(twin[i], a, b, -d)
  }
  const face = (a, b, c) => {
    indices.push(a, b, c)
    if (twin[a] !== a || twin[b] !== b || twin[c] !== c) indices.push(twin[a], twin[c], twin[b])
  }
  for (let j = 0; j < rowCount; j++) {
    const lower = rows[j], upper = rows[j + 1]
    let i = 0, k = 0
    while (i < lower.length - 1 || k < upper.length - 1) {
      const advanceLower = k === upper.length - 1
        || (i < lower.length - 1 && blade[lower[i + 1]][0] <= blade[upper[k + 1]][0])
      if (advanceLower) { face(lower[i], lower[i + 1], upper[k]); i++ }
      else { face(lower[i], upper[k + 1], upper[k]); k++ }
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices), 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingBox(); geometry.computeBoundingSphere()
  geometry.name = 'Solid knapped stone spear'
  geometry.userData.spear = { tip: TIP, base: BASE, shoulder: SHOULDER }
  return geometry
}
