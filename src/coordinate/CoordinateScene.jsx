import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Billboard } from '@react-three/drei'
import * as THREE from 'three'
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

function ThumbnailBillboard({ url, position, width, delay, exiting }) {
  const [texture, setTexture] = useState(null)
  const [height, setHeight] = useState(width)
  const meshRef = useRef()
  const materialRef = useRef()
  const startRef = useRef(null)
  const exitStartRef = useRef(null)
  const exitFromRef = useRef({ scale: 1, opacity: 1 })

  useEffect(() => {
    let cancelled = false
    const loader = new THREE.TextureLoader()
    loader.load(
      url,
      (tex) => {
        if (cancelled) return
        tex.colorSpace = THREE.SRGBColorSpace
        setTexture(tex)
        const img = tex.image
        const iw = img.naturalWidth || img.width
        const ih = img.naturalHeight || img.height
        setHeight(iw ? (ih / iw) * width : width)
      },
      undefined,
      () => {},
    )
    return () => {
      cancelled = true
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
      <mesh ref={meshRef} scale={0.0001}>
        <planeGeometry args={[width, height]} />
        <meshBasicMaterial
          ref={materialRef}
          map={texture}
          transparent
          toneMapped={false}
          opacity={0}
        />
      </mesh>
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
            url={`/coordinate-thumbnail/${p.id}.png`}
            position={p.position}
            width={thumbnailWidth}
            delay={i * STAGGER_STEP}
            exiting={exiting}
          />
        ))}
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
      </Canvas>
      <div ref={xMinusRef} className="axis-label">Less time spent</div>
      <div ref={xPlusRef} className="axis-label">More time spent</div>
      <div ref={yPlusRef} className="axis-label">Procedural</div>
      <div ref={yMinusRef} className="axis-label">Keyframed</div>
      <div ref={zMinusRef} className="axis-label">Before</div>
      <div ref={zPlusRef} className="axis-label">After</div>
    </div>
  )
}
