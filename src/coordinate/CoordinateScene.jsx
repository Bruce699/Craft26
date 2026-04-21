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

function AxisLine({ from, to }) {
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)])
    return g
  }, [from, to])
  return (
    <line geometry={geom}>
      <lineBasicMaterial color={AXIS_COLOR} linewidth={2} />
    </line>
  )
}

function Axes() {
  return (
    <>
      <AxisLine from={[-AXIS_LENGTH, 0, 0]} to={[AXIS_LENGTH, 0, 0]} />
      <AxisLine from={[0, -AXIS_LENGTH, 0]} to={[0, AXIS_LENGTH, 0]} />
      <AxisLine from={[0, 0, -AXIS_LENGTH]} to={[0, 0, AXIS_LENGTH]} />
    </>
  )
}

function ThumbnailBillboard({ url, position, width, delay }) {
  const [texture, setTexture] = useState(null)
  const [height, setHeight] = useState(width)
  const meshRef = useRef()
  const materialRef = useRef()
  const startRef = useRef(null)

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

function AxisLabelDriver({ labelRefs }) {
  const { camera, size } = useThree()
  const p0 = useMemo(() => new THREE.Vector3(), [])
  const p1 = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const w = size.width
    const h = size.height
    if (!w || !h) return

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

    const setLabel = (ref, data) => {
      if (!ref.current) return
      if (!data) {
        ref.current.style.opacity = '0'
        return
      }
      ref.current.style.opacity = '1'
      ref.current.style.transform =
        `translate(${data.x}px, ${data.y}px) rotate(${data.angle}rad) ${data.pivot}`
    }

    // -------- X axis labels --------
    const xExits = findAxisExits(ox, oy, xDir.x, xDir.y, w, h)
    const xAngle = Math.atan2(xDir.y, xDir.x)
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
        pivot: 'translate(0, -100%)',
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
        pivot: 'translate(-100%, -100%)',
      }
    }

    setLabel(labelRefs.xMinus, xMinus)
    setLabel(labelRefs.xPlus, xPlus)

    // -------- Y axis labels --------
    const yAngle = Math.atan2(yDir.y, yDir.x)
    const yPerpA = { x: -yDir.y, y: yDir.x }
    const yPerpB = { x: yDir.y, y: -yDir.x }
    const yPerpRight = yPerpA.x > yPerpB.x ? yPerpA : yPerpB
    const yPerpLeft = yPerpA.x < yPerpB.x ? yPerpA : yPerpB

    let yPlus = null
    let yMinus = null
    if (Math.abs(yDir.y) > 1e-6) {
      const topY = 16
      const bottomY = h - 16
      const tTop = (topY - oy) / yDir.y
      const tBottom = (bottomY - oy) / yDir.y
      const xAtTop = ox + tTop * yDir.x
      const xAtBottom = ox + tBottom * yDir.x

      // Procedural at + end → whichever target has t > 0
      const plusTargetY = tTop >= 0 ? topY : bottomY
      const plusX = tTop >= 0 ? xAtTop : xAtBottom
      const minusTargetY = tTop >= 0 ? bottomY : topY
      const minusX = tTop >= 0 ? xAtBottom : xAtTop

      yPlus = {
        x: plusX + 2 * yPerpRight.x,
        y: plusTargetY + 2 * yPerpRight.y,
        angle: yAngle,
        pivot: 'translate(-100%, 0)',
      }
      yMinus = {
        x: minusX + 2 * yPerpLeft.x,
        y: minusTargetY + 2 * yPerpLeft.y,
        angle: yAngle,
        pivot: 'translate(0, -100%)',
      }
    }

    setLabel(labelRefs.yPlus, yPlus)
    setLabel(labelRefs.yMinus, yMinus)
  })

  return null
}

export default function CoordinateScene({ points, originId, thumbnailWidth, onZoomChange }) {
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
  const labelRefs = useMemo(
    () => ({ xMinus: xMinusRef, xPlus: xPlusRef, yPlus: yPlusRef, yMinus: yMinusRef }),
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
        <Axes />
        {relative.map((p, i) => (
          <ThumbnailBillboard
            key={p.id}
            url={`/coordinate-thumbnail/${p.id}.png`}
            position={p.position}
            width={thumbnailWidth}
            delay={i * STAGGER_STEP}
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
        <AxisLabelDriver labelRefs={labelRefs} />
      </Canvas>
      <div ref={xMinusRef} className="axis-label">Build Time -</div>
      <div ref={xPlusRef} className="axis-label">Build Time +</div>
      <div ref={yPlusRef} className="axis-label">Procedural</div>
      <div ref={yMinusRef} className="axis-label">Keyframed</div>
    </div>
  )
}
