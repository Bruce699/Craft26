import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { getVideoThumbnailUrl } from '../data/videoThumbnails'
import './CoordinateScene.css'

const AXIS_COLOR = '#4A4A4A'
// Must be >= viewport / minZoom on any reasonable screen so the axes
// always extend beyond the visible area, including at max zoom-out.
const AXIS_LENGTH = 100000
const ENTER_DURATION = 500 // ms, matches centering phase
const STAGGER_STEP = 20 // ms between each item

// Labels fade when the axis is close to parallel with the camera view
// direction (i.e. pointing into or out of the screen).
const AXIS_FADE_DEG_START = 30 // fully visible at this angle and above
const AXIS_FADE_DEG_END = 15 // fully faded at this angle and below
const MINIMAP_ORBIT_RADIUS_SCALE = 1.16
const MINIMAP_ORBIT_SEGMENTS = 48
const MINIMAP_LABEL_OFFSET = 10
const MINIMAP_IDLE_OPACITY = 0.6
const MINIMAP_VERTICAL_LABEL_THRESHOLD = 0.24
const MINIMAP_Y_LABEL_GAP = 3
const MINIMAP_Y_LABEL_ABOVE_AXIS = 6

// cubic-bezier(0.5, 0, 0, 1) solver — same curve as the DOM transitions
function makeCubicBezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x
  const bx = 3 * (p2x - p1x) - cx
  const ax = 1 - cx - bx
  const cy = 3 * p1y
  const by = 3 * (p2y - p1y) - cy
  const ay = 1 - cy - by
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t
  const sampleY = (t) => ((ay * t + by) * t + cy) * t
  const sampleDX = (t) => (3 * ax * t + 2 * bx) * t + cx
  return (x) => {
    let t = x
    for (let i = 0; i < 8; i++) {
      const diff = sampleX(t) - x
      if (Math.abs(diff) < 1e-6) return sampleY(t)
      const d = sampleDX(t)
      if (Math.abs(d) < 1e-6) break
      t -= diff / d
    }
    return sampleY(t)
  }
}
const ease = makeCubicBezier(0.5, 0, 0, 1)

// Map text angle into [-π/2, π/2] so glyphs never render upside-down.
// When the original direction was past that range, we return flipped=true
// so the caller can swap the pivot to the opposite corner and keep the
// label visually glued to the same axis endpoint.
function uprightAngle(angle) {
  if (angle > Math.PI / 2) return { angle: angle - Math.PI, flipped: true }
  if (angle < -Math.PI / 2) return { angle: angle + Math.PI, flipped: true }
  return { angle, flipped: false }
}

// Smoothstep opacity based on the angle between an axis and the camera
// view direction. Fully visible at >= START deg, fully faded at <= END deg.
function orientationFade(angleRad) {
  const deg = (angleRad * 180) / Math.PI
  if (deg >= AXIS_FADE_DEG_START) return 1
  if (deg <= AXIS_FADE_DEG_END) return 0
  const t = (deg - AXIS_FADE_DEG_END) / (AXIS_FADE_DEG_START - AXIS_FADE_DEG_END)
  return t * t * (3 - 2 * t)
}

function pickUpperLeftPerp(ux, uy) {
  const a = { x: -uy, y: ux }
  const b = { x: uy, y: -ux }
  if (a.y !== b.y) return a.y < b.y ? a : b
  return a.x < b.x ? a : b
}

function buildOrbitPath(a, b, radius) {
  const orbitRadius = radius * MINIMAP_ORBIT_RADIUS_SCALE
  const commands = []

  for (let i = 0; i <= MINIMAP_ORBIT_SEGMENTS; i++) {
    const t = (i / MINIMAP_ORBIT_SEGMENTS) * Math.PI * 2
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const x = (cos * a.x + sin * b.x) * orbitRadius
    const y = (cos * a.y + sin * b.y) * orbitRadius
    commands.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`)
  }

  return commands.join(' ')
}

function Axes({ exiting }) {
  const materialsRef = useRef([null, null, null])
  const startRef = useRef(null)
  const exitStartRef = useRef(null)
  const exitFromRef = useRef(1)

  const geoms = useMemo(() => {
    const make = (from, to) => {
      const g = new THREE.BufferGeometry()
      g.setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)])
      return g
    }
    return [
      make([-AXIS_LENGTH, 0, 0], [AXIS_LENGTH, 0, 0]),
      make([0, -AXIS_LENGTH, 0], [0, AXIS_LENGTH, 0]),
      make([0, 0, -AXIS_LENGTH], [0, 0, AXIS_LENGTH]),
    ]
  }, [])
  useEffect(() => () => geoms.forEach((g) => g.dispose()), [geoms])

  useFrame((state) => {
    const mats = materialsRef.current
    if (!mats[0]) return
    const now = state.clock.elapsedTime * 1000
    let opacity
    if (exiting) {
      if (exitStartRef.current === null) {
        exitStartRef.current = now
        exitFromRef.current = mats[0].opacity ?? 1
      }
      const t = Math.min(1, (now - exitStartRef.current) / ENTER_DURATION)
      opacity = exitFromRef.current * (1 - ease(t))
    } else {
      if (startRef.current === null) startRef.current = now
      const t = Math.min(1, (now - startRef.current) / ENTER_DURATION)
      opacity = ease(t)
    }
    for (let i = 0; i < mats.length; i++) {
      if (mats[i]) mats[i].opacity = opacity
    }

  })

  return (
    <>
      {geoms.map((g, i) => (
        <line key={i} geometry={g}>
          <lineBasicMaterial
            ref={(el) => {
              materialsRef.current[i] = el
            }}
            color={AXIS_COLOR}
            transparent
            opacity={0}
          />
        </line>
      ))}
    </>
  )
}

function createBlurredThumbnail(image, displayWidth) {
  const iw = image.naturalWidth || image.width
  const ih = image.naturalHeight || image.height
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(displayWidth * 2))
  canvas.height = Math.max(1, Math.round(canvas.width * ih / iw))
  const blur = 8 * canvas.width / displayWidth
  const padding = Math.ceil(blur * 4)
  const padded = document.createElement('canvas')
  padded.width = canvas.width + padding * 2
  padded.height = canvas.height + padding * 2
  const source = padded.getContext('2d')
  // Extend the edge pixels before blurring so the frame stays opaque.
  const columns = [[0, 1, 0, padding], [0, iw, padding, canvas.width], [iw - 1, 1, padding + canvas.width, padding]]
  const rows = [[0, 1, 0, padding], [0, ih, padding, canvas.height], [ih - 1, 1, padding + canvas.height, padding]]
  for (const [sx, sw, dx, dw] of columns) {
    for (const [sy, sh, dy, dh] of rows) {
      source.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
    }
  }
  const context = canvas.getContext('2d')
  context.filter = `blur(${blur}px)`
  context.drawImage(padded, -padding, -padding)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function ThumbnailBillboard({ url, position, width, delay, exiting, selected, onSelect }) {
  const [texture, setTexture] = useState(null)
  const [height, setHeight] = useState(width)
  const meshRef = useRef()
  const materialRef = useRef()
  const startRef = useRef(null)
  const exitStartRef = useRef(null)
  const exitFromRef = useRef({ scale: 1, opacity: 1 })
  const outlineGeom = useMemo(() => {
    const plane = new THREE.PlaneGeometry(width, height)
    const edges = new THREE.EdgesGeometry(plane)
    plane.dispose()
    return edges
  }, [width, height])
  useEffect(() => () => outlineGeom.dispose(), [outlineGeom])

  useEffect(() => {
    let cancelled = false
    let loadedTex = null
    setTexture(null)
    const loader = new THREE.ImageLoader()
    loader.load(
      url,
      (img) => {
        if (cancelled) return
        loadedTex = createBlurredThumbnail(img, width)
        setTexture(loadedTex)
        const iw = img.naturalWidth || img.width
        const ih = img.naturalHeight || img.height
        setHeight(iw ? (ih / iw) * width : width)
      },
      undefined,
      () => {},
    )
    return () => {
      cancelled = true
      if (loadedTex) loadedTex.dispose()
    }
  }, [url, width])

  useFrame((state) => {
    if (!meshRef.current || !materialRef.current) return
    const now = state.clock.elapsedTime * 1000

    if (exiting) {
      if (exitStartRef.current === null) {
        exitStartRef.current = now
        exitFromRef.current = {
          scale: meshRef.current.scale.x || 0.0001,
          opacity: materialRef.current.opacity ?? 1,
        }
      }
      const elapsed = now - exitStartRef.current
      const t = Math.min(1, elapsed / ENTER_DURATION)
      const eased = ease(t)
      const from = exitFromRef.current
      meshRef.current.scale.setScalar(Math.max(0.0001, from.scale * (1 - eased)))
      materialRef.current.opacity = from.opacity * (1 - eased)
      return
    }

    if (startRef.current === null) startRef.current = now + delay
    const elapsed = now - startRef.current
    if (elapsed <= 0) {
      meshRef.current.scale.setScalar(0.0001)
      materialRef.current.opacity = 0
      return
    }
    const t = Math.min(1, elapsed / ENTER_DURATION)
    const eased = ease(t)
    meshRef.current.scale.setScalar(eased)
    materialRef.current.opacity = eased
  })

  if (!texture) return null

  return (
    <Billboard position={position}>
      <group ref={meshRef} scale={0.0001}>
        <mesh
          onClick={(e) => {
            if (!onSelect) return
            e.stopPropagation()
            onSelect()
          }}
        >
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            ref={materialRef}
            map={texture}
            transparent
            toneMapped={false}
            opacity={0}
          />
        </mesh>
        {selected && (
          <lineSegments geometry={outlineGeom}>
            <lineBasicMaterial color="#F83F01" transparent />
          </lineSegments>
        )}
      </group>
    </Billboard>
  )
}

// After a drag ends, spring the camera to the nearest axis-aligned view —
// one where two of the three world axes lie in the screen plane and the
// third is perpendicular. Six such orientations exist (±X, ±Y, ±Z face-on).
// Framer-motion-style spring: stiffness 250, damping 10 (ζ≈0.316, mild
// overshoot), capped at 700ms so the view deterministically lands on target.
const SNAP_DURATION = 700
const SPRING_STIFFNESS = 250
// ζ ≈ 0.76 → single ~3% overshoot (40% smaller than damping=22)
const SPRING_DAMPING = 24
const SPRING_MASS = 1
const SPRING_SUBSTEPS = 6 // integration substeps per frame for stability
// XZ-plane snap uses a plain cubic-bezier ease so overshoot can't cross
// the pole and flip every billboard at once.
const EASE_SNAP_DURATION = 500

function SnapToAxisView() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)
  const snapRef = useRef(null)

  const writeCamera = (az, pol, radius) => {
    const sinPhi = Math.sin(pol) * radius
    camera.position
      .set(sinPhi * Math.sin(az), Math.cos(pol) * radius, sinPhi * Math.cos(az))
      .add(controls.target)
    camera.lookAt(controls.target)
    controls.update()
  }

  useEffect(() => {
    if (!controls) return
    const halfPi = Math.PI / 2
    const snap = (v) => Math.round(v / halfPi) * halfPi

    const onEnd = () => {
      if (snapRef.current) return
      const az = controls.getAzimuthalAngle()
      const pol = controls.getPolarAngle()
      const radius = camera.position.distanceTo(controls.target)
      const rawTargetPol = snap(pol)
      // Polar is clamped slightly off 0/π to preserve a stable up vector.
      const targetPol = Math.max(
        1e-4,
        Math.min(Math.PI - 1e-4, rawTargetPol),
      )
      let dAz = snap(az) - az
      while (dAz > Math.PI) dAz -= 2 * Math.PI
      while (dAz < -Math.PI) dAz += 2 * Math.PI
      const targetAz = az + dAz
      if (Math.abs(dAz) < 1e-4 && Math.abs(targetPol - pol) < 1e-4) return
      // Damping from OrbitControls would fight the animation by adding
      // residual angular momentum every frame — silence it for the duration
      // of the snap and restore afterward.
      const savedDamping = controls.enableDamping
      controls.enableDamping = false
      // XZ-plane snap (Y perpendicular) uses a plain ease instead of a
      // spring — any overshoot would cross the pole and flip every billboard.
      const mode =
        rawTargetPol === 0 || rawTargetPol === Math.PI ? 'ease' : 'spring'
      snapRef.current = {
        mode,
        start: performance.now(),
        az,
        pol,
        fromAz: az,
        fromPol: pol,
        toAz: targetAz,
        toPol: targetPol,
        azVel: 0,
        polVel: 0,
        radius,
        savedDamping,
      }
    }

    const onStart = () => {
      const s = snapRef.current
      if (!s) return
      // User grabs the scene again — abandon the in-flight snap.
      controls.enableDamping = s.savedDamping
      snapRef.current = null
    }

    controls.addEventListener('end', onEnd)
    controls.addEventListener('start', onStart)
    return () => {
      controls.removeEventListener('end', onEnd)
      controls.removeEventListener('start', onStart)
    }
  }, [controls, camera])

  useFrame((_, dt) => {
    const s = snapRef.current
    if (!s || !controls) return
    const elapsed = performance.now() - s.start

    if (s.mode === 'ease') {
      const t = Math.min(1, elapsed / EASE_SNAP_DURATION)
      const e = ease(t)
      const a = s.fromAz + (s.toAz - s.fromAz) * e
      const p = s.fromPol + (s.toPol - s.fromPol) * e
      writeCamera(a, p, s.radius)
      if (t >= 1) {
        controls.enableDamping = s.savedDamping
        snapRef.current = null
      }
      return
    }

    if (elapsed >= SNAP_DURATION) {
      // Finalize on the exact target so the view locks cleanly.
      writeCamera(s.toAz, s.toPol, s.radius)
      controls.enableDamping = s.savedDamping
      snapRef.current = null
      return
    }

    // Semi-implicit Euler spring integration. Substeps keep it stable
    // across variable frame deltas without exploding at high stiffness.
    const h = Math.min(dt, 1 / 30) / SPRING_SUBSTEPS
    for (let i = 0; i < SPRING_SUBSTEPS; i++) {
      const aAz =
        (SPRING_STIFFNESS * (s.toAz - s.az) - SPRING_DAMPING * s.azVel) /
        SPRING_MASS
      const aPol =
        (SPRING_STIFFNESS * (s.toPol - s.pol) - SPRING_DAMPING * s.polVel) /
        SPRING_MASS
      s.azVel += aAz * h
      s.polVel += aPol * h
      s.az += s.azVel * h
      s.pol += s.polVel * h
    }
    writeCamera(s.az, s.pol, s.radius)
  })

  return null
}

// Mini-map driver: translates camera orientation into screen-space 2D
// directions for each world axis and writes them to DOM refs each frame.
// Using the view matrix's columns gives unit-bounded vectors whose 2D length
// naturally collapses toward zero when the axis points into/out of the screen.
function AxisMinimapDriver({ refs, radius }) {
  const camera = useThree((s) => s.camera)

  useFrame(() => {
    const m = camera.matrixWorldInverse.elements
    // Columns 0, 1, 2 are world X, Y, Z axes expressed in view space.
    const axes = {
      x: { x: m[0], y: m[1] },
      y: { x: m[4], y: m[5] },
      z: { x: m[8], y: m[9] },
    }
    const screenAxes = {
      x: { x: axes.x.x, y: -axes.x.y },
      y: { x: axes.y.x, y: -axes.y.y },
      z: { x: axes.z.x, y: -axes.z.y },
    }

    for (const key of ['x', 'y', 'z']) {
      const a = axes[key]
      // View Y is up; screen Y is down — flip.
      const sx = a.x
      const sy = -a.y
      const len = Math.hypot(sx, sy) // 0..1
      const angle = Math.atan2(sy, sx)
      const endpointDist = radius * len

      const lineLength = radius * 2 * len
      const axisEl = refs[key].current
      if (axisEl) {
        axisEl.style.width = `${lineLength}px`
        axisEl.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`
      }

      const positiveDotEl = refs[`${key}PositiveDot`].current
      const negativeDotEl = refs[`${key}NegativeDot`].current
      if (positiveDotEl) {
        positiveDotEl.style.opacity = len < 0.02 ? '0' : '1'
        positiveDotEl.style.transform =
          `translate(-50%, -50%) translate(${sx * radius}px, ${sy * radius}px)`
      }
      if (negativeDotEl) {
        negativeDotEl.style.opacity = len < 0.02 ? '0' : '1'
        negativeDotEl.style.transform =
          `translate(-50%, -50%) translate(${-sx * radius}px, ${-sy * radius}px)`
      }

      // Angle from the nearest reference axis arm (0..45°).
      const deg = (Math.abs(angle) * 180) / Math.PI
      const modDeg = deg % 90
      const angleFromRef = Math.min(modDeg, 90 - modDeg)

      const labelEl = refs[`${key}Label`].current
      if (labelEl) {
        if (len < 0.02) {
          labelEl.style.opacity = '0'
        } else {
          const ux = sx / len
          const uy = sy / len
          labelEl.style.opacity = '1'
          labelEl.style.transform =
            key === 'y'
              ? (() => {
                  const labelDist = endpointDist + MINIMAP_Y_LABEL_GAP
                  return `translate(-50%, -50%) translate(${ux * labelDist}px, ${uy * labelDist - MINIMAP_Y_LABEL_ABOVE_AXIS}px)`
                })()
              : (() => {
                  const useUpperLeftPlacement =
                    Math.abs(ux) <= MINIMAP_VERTICAL_LABEL_THRESHOLD
                  return useUpperLeftPlacement
                    ? (() => {
                        const labelPerp = pickUpperLeftPerp(ux, uy)
                        const labelX = ux * endpointDist + labelPerp.x * MINIMAP_LABEL_OFFSET
                        const labelY = uy * endpointDist + labelPerp.y * MINIMAP_LABEL_OFFSET
                        return `translate(-100%, -100%) translate(${labelX}px, ${labelY}px)`
                      })()
                    : (() => {
                        const labelX = ux * endpointDist * 0.64
                        const labelY = uy * endpointDist * 0.64 - MINIMAP_LABEL_OFFSET
                        return `translate(-50%, -100%) translate(${labelX}px, ${labelY}px)`
                      })()
                })()
          labelEl.textContent = `${key.toUpperCase()} ${Math.round(angleFromRef)}°`
        }
      }
    }

    const orbitDefs = [
      ['xyOrbit', screenAxes.x, screenAxes.y],
      ['yzOrbit', screenAxes.y, screenAxes.z],
      ['zxOrbit', screenAxes.z, screenAxes.x],
    ]
    for (const [refKey, a, b] of orbitDefs) {
      const orbitEl = refs[refKey].current
      if (!orbitEl) continue
      orbitEl.setAttribute('d', buildOrbitPath(a, b, radius))
    }
  })

  return null
}

function AxisMinimap({ refs }) {
  return (
    <div ref={refs.root} className="axis-minimap">
      <div className="minimap-ref minimap-ref-h" />
      <div className="minimap-ref minimap-ref-v" />
      <svg className="minimap-orbits" viewBox="-64 -64 128 128" aria-hidden="true">
        <path ref={refs.xyOrbit} className="minimap-orbit" />
        <path ref={refs.yzOrbit} className="minimap-orbit" />
        <path ref={refs.zxOrbit} className="minimap-orbit" />
      </svg>
      <div ref={refs.x} className="minimap-axis" />
      <div ref={refs.y} className="minimap-axis" />
      <div ref={refs.z} className="minimap-axis" />
      <div ref={refs.xPositiveDot} className="minimap-tip" />
      <div ref={refs.xNegativeDot} className="minimap-tip" />
      <div ref={refs.yPositiveDot} className="minimap-tip" />
      <div ref={refs.yNegativeDot} className="minimap-tip" />
      <div ref={refs.zPositiveDot} className="minimap-tip" />
      <div ref={refs.zNegativeDot} className="minimap-tip" />
      <div className="minimap-origin" />
      <div ref={refs.xLabel} className="minimap-angle" />
      <div ref={refs.yLabel} className="minimap-angle" />
      <div ref={refs.zLabel} className="minimap-angle" />
    </div>
  )
}

function ZoomBroadcaster({ onZoomChange }) {
  const camera = useThree((s) => s.camera)
  const lastRef = useRef(null)
  useFrame(() => {
    if (!onZoomChange || !camera.isOrthographicCamera) return
    if (camera.zoom !== lastRef.current) {
      lastRef.current = camera.zoom
      onZoomChange(camera.zoom)
    }
  })
  return null
}

// Find where the line through (ox,oy) in direction (ux,uy) exits screen bounds.
// Returns smallest-positive-t and smallest-negative-|t| intersections.
function findAxisExits(ox, oy, ux, uy, w, h) {
  const eps = 1e-6
  const candidates = []
  if (Math.abs(ux) > eps) {
    const tL = -ox / ux
    const yL = oy + tL * uy
    if (yL >= 0 && yL <= h) candidates.push({ t: tL, x: 0, y: yL })
    const tR = (w - ox) / ux
    const yR = oy + tR * uy
    if (yR >= 0 && yR <= h) candidates.push({ t: tR, x: w, y: yR })
  }
  if (Math.abs(uy) > eps) {
    const tT = -oy / uy
    const xT = ox + tT * ux
    if (xT >= 0 && xT <= w) candidates.push({ t: tT, x: xT, y: 0 })
    const tB = (h - oy) / uy
    const xB = ox + tB * ux
    if (xB >= 0 && xB <= w) candidates.push({ t: tB, x: xB, y: h })
  }
  const pos = candidates.filter((c) => c.t > 0).sort((a, b) => a.t - b.t)[0]
  const neg = candidates.filter((c) => c.t < 0).sort((a, b) => b.t - a.t)[0]
  return { pos, neg }
}

function AxisLabelDriver({ labelRefs, exiting }) {
  const { camera, size } = useThree()
  const p0 = useMemo(() => new THREE.Vector3(), [])
  const p1 = useMemo(() => new THREE.Vector3(), [])
  const viewDir = useMemo(() => new THREE.Vector3(), [])
  const startRef = useRef(null)
  const exitStartRef = useRef(null)
  const exitFromRef = useRef(1)
  const enterRef = useRef(0)

  useFrame((state) => {
    const w = size.width
    const h = size.height
    if (!w || !h) return

    const now = state.clock.elapsedTime * 1000
    let enterOpacity
    if (exiting) {
      if (exitStartRef.current === null) {
        exitStartRef.current = now
        exitFromRef.current = enterRef.current
      }
      const t = Math.min(1, (now - exitStartRef.current) / ENTER_DURATION)
      enterOpacity = exitFromRef.current * (1 - ease(t))
    } else {
      if (startRef.current === null) startRef.current = now
      const t = Math.min(1, (now - startRef.current) / ENTER_DURATION)
      enterOpacity = ease(t)
    }
    enterRef.current = enterOpacity

    // Angle between each world axis and the camera view direction.
    // When the axis is close to parallel with the view line, it projects
    // down to near-zero screen length and its labels should fade.
    camera.getWorldDirection(viewDir)
    const xFade = orientationFade(
      Math.acos(Math.min(1, Math.abs(viewDir.x))),
    )
    const yFade = orientationFade(
      Math.acos(Math.min(1, Math.abs(viewDir.y))),
    )
    const zFade = orientationFade(
      Math.acos(Math.min(1, Math.abs(viewDir.z))),
    )

    // Project world origin to screen
    p0.set(0, 0, 0).project(camera)
    const ox = (p0.x + 1) * 0.5 * w
    const oy = (1 - p0.y) * 0.5 * h

    // Helper to project any world vector (from origin) to 2D screen direction
    const projectDir = (wx, wy, wz) => {
      p1.set(wx, wy, wz).project(camera)
      const sx = (p1.x + 1) * 0.5 * w - ox
      const sy = (1 - p1.y) * 0.5 * h - oy
      const len = Math.hypot(sx, sy) || 1
      return { x: sx / len, y: sy / len }
    }

    const xDir = projectDir(1, 0, 0)
    const yDir = projectDir(0, 1, 0)
    const zDir = projectDir(0, 0, 1)

    const setLabel = (ref, data, axisFade) => {
      if (!ref.current) return
      const visible = data ? enterOpacity * axisFade : 0
      ref.current.style.opacity = String(visible)
      if (data) {
        ref.current.style.transform =
          `translate(${data.x}px, ${data.y}px) rotate(${data.angle}rad) ${data.pivot}`
      }
    }

    // -------- X axis labels --------
    const xExits = findAxisExits(ox, oy, xDir.x, xDir.y, w, h)
    const xRawAngle = Math.atan2(xDir.y, xDir.x)
    const { angle: xAngle, flipped: xFlipped } = uprightAngle(xRawAngle)
    // Perpendicular toward screen top (smaller y)
    const xPerpA = { x: -xDir.y, y: xDir.x }
    const xPerpB = { x: xDir.y, y: -xDir.x }
    const xPerpUp = xPerpA.y < xPerpB.y ? xPerpA : xPerpB

    let xMinus = null
    if (xExits.neg) {
      const bx = xExits.neg.x + 8 * xDir.x
      const by = xExits.neg.y + 8 * xDir.y
      xMinus = {
        x: bx + 2 * xPerpUp.x,
        y: by + 2 * xPerpUp.y,
        angle: xAngle,
        pivot: xFlipped ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
      }
    }

    let xPlus = null
    if (xExits.pos) {
      const bx = xExits.pos.x - 8 * xDir.x
      const by = xExits.pos.y - 8 * xDir.y
      xPlus = {
        x: bx + 2 * xPerpUp.x,
        y: by + 2 * xPerpUp.y,
        angle: xAngle,
        pivot: xFlipped ? 'translate(0, -100%)' : 'translate(-100%, -100%)',
      }
    }

    setLabel(labelRefs.xMinus, xMinus, xFade)
    setLabel(labelRefs.xPlus, xPlus, xFade)

    // -------- Y axis labels --------
    // Same edge-intersection logic as X so labels stay glued to the
    // viewport boundary instead of drifting along the axis as it rotates.
    const yExits = findAxisExits(ox, oy, yDir.x, yDir.y, w, h)
    const yRawAngle = Math.atan2(yDir.y, yDir.x)
    const { angle: yAngle, flipped: yFlipped } = uprightAngle(yRawAngle)
    const yPerpA = { x: -yDir.y, y: yDir.x }
    const yPerpB = { x: yDir.y, y: -yDir.x }
    const yPerpUp = yPerpA.y < yPerpB.y ? yPerpA : yPerpB

    let yMinus = null
    if (yExits.neg) {
      const bx = yExits.neg.x + 8 * yDir.x
      const by = yExits.neg.y + 8 * yDir.y
      yMinus = {
        x: bx + 2 * yPerpUp.x,
        y: by + 2 * yPerpUp.y,
        angle: yAngle,
        pivot: yFlipped ? 'translate(-100%, 0)' : 'translate(0, -100%)',
      }
    }

    let yPlus = null
    if (yExits.pos) {
      const bx = yExits.pos.x - 8 * yDir.x
      const by = yExits.pos.y - 8 * yDir.y
      yPlus = {
        x: bx + 2 * yPerpUp.x,
        y: by + 2 * yPerpUp.y,
        angle: yAngle,
        pivot: yFlipped ? 'translate(0, 0)' : 'translate(-100%, -100%)',
      }
    }

    setLabel(labelRefs.yPlus, yPlus, yFade)
    setLabel(labelRefs.yMinus, yMinus, yFade)

    // -------- Z axis labels --------
    const zExits = findAxisExits(ox, oy, zDir.x, zDir.y, w, h)
    const zRawAngle = Math.atan2(zDir.y, zDir.x)
    const { angle: zAngle, flipped: zFlipped } = uprightAngle(zRawAngle)
    const zPerpA = { x: -zDir.y, y: zDir.x }
    const zPerpB = { x: zDir.y, y: -zDir.x }
    const zPerpUp = zPerpA.y < zPerpB.y ? zPerpA : zPerpB

    let zMinus = null
    if (zExits.neg) {
      const bx = zExits.neg.x + 8 * zDir.x
      const by = zExits.neg.y + 8 * zDir.y
      zMinus = {
        x: bx + 2 * zPerpUp.x,
        y: by + 2 * zPerpUp.y,
        angle: zAngle,
        pivot: zFlipped ? 'translate(-100%, -100%)' : 'translate(0, -100%)',
      }
    }

    let zPlus = null
    if (zExits.pos) {
      const bx = zExits.pos.x - 8 * zDir.x
      const by = zExits.pos.y - 8 * zDir.y
      zPlus = {
        x: bx + 2 * zPerpUp.x,
        y: by + 2 * zPerpUp.y,
        angle: zAngle,
        pivot: zFlipped ? 'translate(0, -100%)' : 'translate(-100%, -100%)',
      }
    }

    setLabel(labelRefs.zPlus, zPlus, zFade)
    setLabel(labelRefs.zMinus, zMinus, zFade)
  })

  return null
}

const SELECT_LINE_DURATION = 250
const SELECT_DOT_DURATION = 100
const SELECT_LABEL_GAP = 4

function SelectionOverlay({ point, data, refs }) {
  const { camera, size } = useThree()
  const startRef = useRef(null)
  const prevKeyRef = useRef(null)
  const v = useMemo(() => new THREE.Vector3(), [])

  const geomX = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    return g
  }, [])
  const geomY = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    return g
  }, [])
  const geomZ = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
    return g
  }, [])
  useEffect(
    () => () => {
      geomX.dispose()
      geomY.dispose()
      geomZ.dispose()
    },
    [geomX, geomY, geomZ],
  )

  useFrame((state) => {
    const now = state.clock.elapsedTime * 1000
    const key = `${point.x}|${point.y}|${point.z}`
    if (prevKeyRef.current !== key) {
      prevKeyRef.current = key
      startRef.current = now
    }
    const elapsed = now - startRef.current
    const lineT = Math.min(1, elapsed / SELECT_LINE_DURATION)
    const lineE = ease(lineT)

    const px = point.x, py = point.y, pz = point.z

    const posX = geomX.attributes.position
    posX.setXYZ(0, px, py, pz)
    posX.setXYZ(1, px, py * (1 - lineE), pz * (1 - lineE))
    posX.needsUpdate = true

    const posY = geomY.attributes.position
    posY.setXYZ(0, px, py, pz)
    posY.setXYZ(1, px * (1 - lineE), py, pz * (1 - lineE))
    posY.needsUpdate = true

    const posZ = geomZ.attributes.position
    posZ.setXYZ(0, px, py, pz)
    posZ.setXYZ(1, px * (1 - lineE), py * (1 - lineE), pz)
    posZ.needsUpdate = true

    const dotT = Math.max(
      0,
      Math.min(1, (elapsed - SELECT_LINE_DURATION) / SELECT_DOT_DURATION),
    )
    const dotScale = ease(dotT)
    const labelOpacity = dotT

    const w = size.width, h = size.height
    const project = (x, y, z) => {
      v.set(x, y, z).project(camera)
      return { x: (v.x + 1) * 0.5 * w, y: (1 - v.y) * 0.5 * h }
    }
    const originScreen = project(0, 0, 0)
    const imgScreen = project(px, py, pz)
    const xEnd = project(px, 0, 0)
    const yEnd = project(0, py, 0)
    const zEnd = project(0, 0, pz)

    const setDot = (ref, pos) => {
      if (!ref.current) return
      ref.current.style.opacity = dotScale > 0 ? '1' : '0'
      ref.current.style.transform =
        `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${dotScale})`
    }
    setDot(refs.xDot, xEnd)
    setDot(refs.yDot, yEnd)
    setDot(refs.zDot, zEnd)

    const setLabel = (ref, dotPos, axisEnd, text) => {
      if (!ref.current) return
      if (ref.current.textContent !== text) ref.current.textContent = text
      ref.current.style.opacity = String(labelOpacity)
      const axisDx = axisEnd.x - originScreen.x
      const axisDy = axisEnd.y - originScreen.y
      const axisLen = Math.hypot(axisDx, axisDy) || 1
      const perpX = -axisDy / axisLen
      const perpY = axisDx / axisLen
      const imgDx = imgScreen.x - dotPos.x
      const imgDy = imgScreen.y - dotPos.y
      const imgSide = imgDx * perpX + imgDy * perpY
      const sign = imgSide >= 0 ? -1 : 1
      const ox = perpX * sign
      const oy = perpY * sign
      const labelX = dotPos.x + ox * SELECT_LABEL_GAP
      const labelY = dotPos.y + oy * SELECT_LABEL_GAP
      const thresh = 0.3
      const xAnchor = Math.abs(ox) < thresh ? '-50%' : ox > 0 ? '0' : '-100%'
      const yAnchor = Math.abs(oy) < thresh ? '-50%' : oy > 0 ? '0' : '-100%'
      ref.current.style.transform =
        `translate(${xAnchor}, ${yAnchor}) translate(${labelX}px, ${labelY}px)`
    }
    setLabel(refs.xLabel, xEnd, xEnd, data.xText)
    setLabel(refs.yLabel, yEnd, yEnd, data.yText)
    setLabel(refs.zLabel, zEnd, zEnd, data.zText)
  })

  return (
    <>
      <line geometry={geomX}>
        <lineBasicMaterial color="#F83F01" transparent />
      </line>
      <line geometry={geomY}>
        <lineBasicMaterial color="#F83F01" transparent />
      </line>
      <line geometry={geomZ}>
        <lineBasicMaterial color="#F83F01" transparent />
      </line>
    </>
  )
}

export default function CoordinateScene({ points, originId, thumbnailWidth, onZoomChange, exiting = false }) {
  const origin = points.find((p) => p.id === originId)
  const relative = useMemo(() => {
    if (!origin) return []
    return points
      .filter((p) => p.id !== originId)
      .map((p) => ({
        ...p,
        position: [p.x - origin.x, p.y - origin.y, p.z - origin.z],
      }))
  }, [points, origin, originId])

  const [size, setSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }))

  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    // R3F's initial ResizeObserver reading can come in as 0x0 when the
    // scene mounts mid-transition; kicking resize events a few times
    // forces R3F/use-measure to pick up the real viewport size.
    const timers = [16, 50, 150, 400].map((ms) =>
      setTimeout(() => window.dispatchEvent(new Event('resize')), ms),
    )
    return () => {
      window.removeEventListener('resize', onResize)
      timers.forEach(clearTimeout)
    }
  }, [])

  const cameraProps = useMemo(
    () => ({
      left: -size.w / 2,
      right: size.w / 2,
      top: size.h / 2,
      bottom: -size.h / 2,
      near: -10000,
      far: 10000,
      position: [0, 0, 2000],
      zoom: 1,
    }),
    [size.w, size.h],
  )

  const xMinusRef = useRef()
  const xPlusRef = useRef()
  const yPlusRef = useRef()
  const yMinusRef = useRef()
  const zPlusRef = useRef()
  const zMinusRef = useRef()
  const labelRefs = useMemo(
    () => ({
      xMinus: xMinusRef,
      xPlus: xPlusRef,
      yPlus: yPlusRef,
      yMinus: yMinusRef,
      zPlus: zPlusRef,
      zMinus: zMinusRef,
    }),
    [],
  )

  const minimapRootRef = useRef()
  const minimapXRef = useRef()
  const minimapYRef = useRef()
  const minimapZRef = useRef()
  const minimapXYOrbitRef = useRef()
  const minimapYZOrbitRef = useRef()
  const minimapZXOrbitRef = useRef()
  const minimapXPositiveDotRef = useRef()
  const minimapXNegativeDotRef = useRef()
  const minimapYPositiveDotRef = useRef()
  const minimapYNegativeDotRef = useRef()
  const minimapZPositiveDotRef = useRef()
  const minimapZNegativeDotRef = useRef()
  const minimapXLabelRef = useRef()
  const minimapYLabelRef = useRef()
  const minimapZLabelRef = useRef()
  const minimapRefs = useMemo(
    () => ({
      root: minimapRootRef,
      x: minimapXRef,
      y: minimapYRef,
      z: minimapZRef,
      xyOrbit: minimapXYOrbitRef,
      yzOrbit: minimapYZOrbitRef,
      zxOrbit: minimapZXOrbitRef,
      xPositiveDot: minimapXPositiveDotRef,
      xNegativeDot: minimapXNegativeDotRef,
      yPositiveDot: minimapYPositiveDotRef,
      yNegativeDot: minimapYNegativeDotRef,
      zPositiveDot: minimapZPositiveDotRef,
      zNegativeDot: minimapZNegativeDotRef,
      xLabel: minimapXLabelRef,
      yLabel: minimapYLabelRef,
      zLabel: minimapZLabelRef,
    }),
    [],
  )

  // Fade the minimap in with the rest of the scene; fade out while exiting.
  useEffect(() => {
    const el = minimapRootRef.current
    if (!el) return
    // Match the axis enter/exit timing used by <Axes> and <AxisLabelDriver>.
    el.style.transition = `opacity ${ENTER_DURATION}ms cubic-bezier(0.5, 0, 0, 1)`
    el.style.opacity = exiting ? '0' : String(MINIMAP_IDLE_OPACITY)
  }, [exiting])

  const [selectedId, setSelectedId] = useState(null)
  const selected = useMemo(
    () => (selectedId ? relative.find((p) => p.id === selectedId) : null),
    [selectedId, relative],
  )
  const selectionData = useMemo(() => {
    if (!selected) return null
    return {
      xText: `${selected.hours} Hrs`,
      yText: `Level ${selected.procIndex}`,
      zText: selected.date,
    }
  }, [selected])

  const xDotRef = useRef()
  const yDotRef = useRef()
  const zDotRef = useRef()
  const xSelLabelRef = useRef()
  const ySelLabelRef = useRef()
  const zSelLabelRef = useRef()
  const selectionRefs = useMemo(
    () => ({
      xDot: xDotRef,
      yDot: yDotRef,
      zDot: zDotRef,
      xLabel: xSelLabelRef,
      yLabel: ySelLabelRef,
      zLabel: zSelLabelRef,
    }),
    [],
  )

  useEffect(() => {
    if (exiting) setSelectedId(null)
  }, [exiting])

  return (
    <div className="coordinate-scene">
      <Canvas
        orthographic
        camera={cameraProps}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        onCreated={({ gl, camera, size: s }) => {
          console.log('[R3F] onCreated', s, 'window', window.innerWidth, window.innerHeight)
          const w = window.innerWidth
          const h = window.innerHeight
          gl.setSize(w, h, false)
          if (camera.isOrthographicCamera) {
            camera.left = -w / 2
            camera.right = w / 2
            camera.top = h / 2
            camera.bottom = -h / 2
            camera.updateProjectionMatrix()
          }
        }}
      >
        <Axes exiting={exiting} />
        {relative.map((p, i) => (
          <ThumbnailBillboard
            key={p.id}
            url={getVideoThumbnailUrl(p.playbackId, 600)}
            position={p.position}
            width={thumbnailWidth}
            delay={i * STAGGER_STEP}
            exiting={exiting}
            selected={selectedId === p.id}
            onSelect={() => setSelectedId(p.id)}
          />
        ))}
        {selected && selectionData && !exiting && (
          <SelectionOverlay
            point={{ x: selected.position[0], y: selected.position[1], z: selected.position[2] }}
            data={selectionData}
            refs={selectionRefs}
          />
        )}
        <OrbitControls
          enablePan={false}
          enableZoom
          zoomToCursor={false}
          zoomSpeed={1}
          minZoom={0.2}
          maxZoom={8}
          makeDefault
        />
        <ZoomBroadcaster onZoomChange={onZoomChange} />
        <SnapToAxisView />
        <AxisLabelDriver labelRefs={labelRefs} exiting={exiting} />
        <AxisMinimapDriver refs={minimapRefs} radius={50} />
      </Canvas>
      <div ref={xMinusRef} className="axis-label">Less time spent</div>
      <div ref={xPlusRef} className="axis-label">More time spent</div>
      <div ref={yPlusRef} className="axis-label">Procedural</div>
      <div ref={yMinusRef} className="axis-label">Keyframed</div>
      <div ref={zMinusRef} className="axis-label">Before</div>
      <div ref={zPlusRef} className="axis-label">After</div>
      {selected && (
        <>
          <div ref={xDotRef} className="selection-dot" />
          <div ref={yDotRef} className="selection-dot" />
          <div ref={zDotRef} className="selection-dot" />
          <div ref={xSelLabelRef} className="selection-label" />
          <div ref={ySelLabelRef} className="selection-label" />
          <div ref={zSelLabelRef} className="selection-label" />
        </>
      )}
      <AxisMinimap refs={minimapRefs} />
    </div>
  )
}
