import { formDefaults } from './rockFormControls.js'
import { shapeDefaults } from './rockShapeControls.js'

// V2 owns its source silhouette. Neutral editing values preserve the spear;
// V1 keeps the user's saved shape and metallic finish exactly as configured.
export const spearShapeDefaults = {
  width: 1, height: 1, depth: 1, seed: 4301,
  form: { ...formDefaults },
  outline: { top: 0, right: 0, bottom: 0, left: 0, angularity: 0, asymmetry: 0 },
  surface: { ridges: 0, ridgeScale: 2.1, dents: 0, dentScale: 2.4 },
}

export const rockVersions = {
  1: { number: 1, path: '/internet-design', title: 'Internet Design — Bruce Cao', shape: shapeDefaults },
  2: {
    number: 2,
    path: '/internet-design/v2',
    title: 'Internet Design V2 — Stone Spear',
    playback: { clip: '21' },
    shape: spearShapeDefaults,
    rock: { scale: 1, pointerTilt: true, tiltAmount: 3 },
    finish: { color: '#454642', metalness: 0.06, roughness: 0.88, bump: 0.48, light: 1, screenGlow: 0.45 },
    lighting: { intensity: 5, distance: 112, color: '#ffffff', ambient: 0.2 },
    screenLight: { enabled: true, strength: 0.22, reach: 32, spread: 0.34, haze: 0.08 },
  },
}

// Preserve slider bounds, labels and action definitions when changing defaults.
export function withControlDefaults(schema, defaults) {
  return Object.fromEntries(Object.entries(schema).map(([key, control]) => {
    const value = defaults[key]
    if (value === undefined) return [key, control]
    if (Array.isArray(control)) return [key, [value, ...control.slice(1)]]
    if (control?.type === 'select') return [key, { ...control, default: value }]
    if (control && typeof control === 'object' && !control.type) {
      return [key, withControlDefaults(control, value)]
    }
    return [key, value]
  }))
}
