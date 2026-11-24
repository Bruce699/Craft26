export const REFERENCE_WINDOW_ASPECT = 1.5397166650890477

const MIN_DIMENSION = 0.45
const MAX_DIMENSION = 1.3
const MIN_ASPECT = REFERENCE_WINDOW_ASPECT * MIN_DIMENSION / MAX_DIMENSION
const MAX_ASPECT = REFERENCE_WINDOW_ASPECT * MAX_DIMENSION / MIN_DIMENSION
const CHANGE_EPSILON = 1e-8
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback
const dimension = (value) => clamp(finite(value, 1), MIN_DIMENSION, MAX_DIMENSION)

export const videoWindowDefaults = {
  width: Math.sqrt(1 / REFERENCE_WINDOW_ASPECT),
  height: Math.sqrt(REFERENCE_WINDOW_ASPECT),
  aspectRatio: 1,
}

export const videoWindowControls = {
  // Readable bounds also keep DialKit's numeric display at two decimal places;
  // the conversion helpers enforce the exact reachable limits underneath.
  aspectRatio: [videoWindowDefaults.aspectRatio, 0.53, 4.45, 0.01],
  width: [videoWindowDefaults.width, MIN_DIMENSION, MAX_DIMENSION, 0.01],
  height: [videoWindowDefaults.height, MIN_DIMENSION, MAX_DIMENSION, 0.01],
  square: { type: 'action', label: '1:1 square' },
  wide: { type: 'action', label: '16:9 wide' },
  portrait: { type: 'action', label: '9:16 portrait' },
  reset: { type: 'action', label: 'Reset video window' },
}

// Preserve the current area unless the requested proportions require a uniform
// resize to keep both dimensions inside their bounds.
export function windowForAspect(aspectRatio, current = videoWindowDefaults) {
  const aspect = clamp(finite(aspectRatio, REFERENCE_WINDOW_ASPECT), MIN_ASPECT, MAX_ASPECT)
  const area = dimension(current?.width) * dimension(current?.height)
  const relativeAspect = aspect / REFERENCE_WINDOW_ASPECT
  const proposedWidth = Math.sqrt(area * relativeAspect)
  const proposedHeight = Math.sqrt(area / relativeAspect)
  const minScale = Math.max(MIN_DIMENSION / proposedWidth, MIN_DIMENSION / proposedHeight)
  const maxScale = Math.min(MAX_DIMENSION / proposedWidth, MAX_DIMENSION / proposedHeight)
  const scale = Math.min(maxScale, Math.max(minScale, 1))
  // Clamp only the final floating-point rounding at an exact boundary.
  const width = clamp(proposedWidth * scale, MIN_DIMENSION, MAX_DIMENSION)
  const height = clamp(proposedHeight * scale, MIN_DIMENSION, MAX_DIMENSION)
  return { width, height, aspectRatio: REFERENCE_WINDOW_ASPECT * width / height }
}

// An isolated ratio edit expresses new proportions. A dimension edit takes
// precedence when controls change together, and determines the physical ratio.
export function syncVideoWindow(current = videoWindowDefaults, previous = videoWindowDefaults) {
  const width = dimension(current?.width)
  const height = dimension(current?.height)
  const actualAspect = REFERENCE_WINDOW_ASPECT * width / height
  const requestedAspect = finite(current?.aspectRatio, actualAspect)
  const previousWidth = dimension(previous?.width)
  const previousHeight = dimension(previous?.height)
  const previousAspect = finite(previous?.aspectRatio, REFERENCE_WINDOW_ASPECT * previousWidth / previousHeight)
  const dimensionsUnchanged = Math.abs(width - previousWidth) <= CHANGE_EPSILON
    && Math.abs(height - previousHeight) <= CHANGE_EPSILON
  if (dimensionsUnchanged && Math.abs(requestedAspect - previousAspect) > CHANGE_EPSILON) {
    return windowForAspect(requestedAspect, { width, height })
  }
  return { width, height, aspectRatio: actualAspect }
}
