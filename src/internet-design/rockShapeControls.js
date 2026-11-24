import { formControls, formDefaults, formPresetNames } from './rockFormControls.js'

export const shapeDefaults = {
  width: 0.62,
  height: 0.5,
  depth: 0.65,
  seed: 1207,
  outline: { top: 0.35, right: 0.1, bottom: 0.35, left: 0.1, angularity: 0.05, asymmetry: 0.1 },
  surface: { ridges: 0.05, ridgeScale: 1.3, dents: 0.1, dentScale: 1.8 },
  form: {
    ...formDefaults,
    bendX: -0.18,
    bendY: -0.04,
    twist: 0.19,
    taperTop: -0.07,
    taperBottom: 0.15,
    skewX: -0.66,
    skewY: -0.14,
    bulge: 0.8,
    topRight: -0.01,
    bottomRight: 0.09,
    bottomLeft: 0.05,
    topLeft: -0.3,
  },
}

export const shapeControls = {
  presets: Object.fromEntries(formPresetNames.map((name) => [name, { type: 'action', label: name[0].toUpperCase() + name.slice(1) }])),
  width: [shapeDefaults.width, 0.5, 2.1, 0.01],
  height: [shapeDefaults.height, 0.5, 2.1, 0.01],
  depth: [shapeDefaults.depth, 0.4, 2, 0.01],
  form: {
    _collapsed: true,
    ...Object.fromEntries(Object.entries(formControls).map(([key, tuple]) => [key, [shapeDefaults.form[key], ...tuple.slice(1)]])),
  },
  outline: {
    _collapsed: true,
    top: [shapeDefaults.outline.top, -1, 1, 0.01],
    right: [shapeDefaults.outline.right, -1, 1, 0.01],
    bottom: [shapeDefaults.outline.bottom, -1, 1, 0.01],
    left: [shapeDefaults.outline.left, -1, 1, 0.01],
    angularity: [shapeDefaults.outline.angularity, 0, 1, 0.01],
    asymmetry: [shapeDefaults.outline.asymmetry, 0, 1, 0.01],
  },
  surface: {
    _collapsed: true,
    ridges: [shapeDefaults.surface.ridges, 0, 1, 0.01],
    ridgeScale: [shapeDefaults.surface.ridgeScale, 1, 5, 0.01],
    dents: [shapeDefaults.surface.dents, 0, 1, 0.01],
    dentScale: [shapeDefaults.surface.dentScale, 1, 5, 0.01],
  },
  seed: [shapeDefaults.seed, 1, 9999, 1],
  randomize: { type: 'action', label: 'New organic shape' },
  reset: { type: 'action', label: 'Reset shape' },
}

export const sculptControls = {
  _collapsed: true,
  enabled: false,
  mode: {
    type: 'select',
    options: [
      { value: 'grab', label: 'Grab' },
      { value: 'stretch', label: 'Stretch' },
      { value: 'push', label: 'Push' },
      { value: 'raise', label: 'Pull' },
      { value: 'carve', label: 'Dent' },
      { value: 'smooth', label: 'Smooth' },
    ],
    default: 'grab',
  },
  brushSize: [12, 2, 18, 0.5],
  strength: [0.45, 0.05, 1.2, 0.05],
  undo: { type: 'action', label: 'Undo stroke' },
  clear: { type: 'action', label: 'Clear brush edits' },
}

export function flattenShape(shape) {
  return { ...shape, ...shape.outline, ...shape.surface, ...shape.form }
}
