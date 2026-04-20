import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Billboard } from '@react-three/drei'
import * as THREE from 'three'
import './CoordinateScene.css'

const AXIS_COLOR = '#4A4A4A'
const AXIS_LENGTH = 4000
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
      </Canvas>
    </div>
  )
}
