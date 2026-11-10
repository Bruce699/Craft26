import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

export default function CursorLight({ settings, positionRef, cursorRef, wideLightMix, reducedMotion }) {
  const lightRef = useRef(null)
  const pointer = useRef(new THREE.Vector2())
  const target = useRef(new THREE.Vector3())
  const parameters = useRef(new THREE.Vector3(settings.cursorRange, settings.height, settings.distance))
  const center = useRef(new THREE.Vector2())
  const canvas = useThree((state) => state.gl.domElement)

  useEffect(() => {
    const move = (event) => {
      const rect = canvas.getBoundingClientRect()
      pointer.current.set(
        THREE.MathUtils.clamp((event.clientX - rect.left) / Math.max(rect.width, 1) * 2 - 1, -1, 1),
        THREE.MathUtils.clamp(1 - (event.clientY - rect.top) / Math.max(rect.height, 1) * 2, -1, 1),
      )
    }
    const reset = () => pointer.current.set(0, 0)
    window.addEventListener('pointermove', move, { passive: true })
    canvas.addEventListener('pointerleave', reset)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerleave', reset)
      window.removeEventListener('blur', reset)
    }
  }, [canvas])

  useFrame((_, delta) => {
    const follow = settings.followCursor
    // Smooth edits to the light's controls, never the pointer itself. Keeping
    // the preset's smoothing value must not introduce cursor-following lag.
    const blend = reducedMotion ? 1 : 1 - Math.exp(-settings.smoothing * Math.min(delta, 0.1))
    parameters.current.x = THREE.MathUtils.lerp(parameters.current.x, settings.cursorRange, blend)
    parameters.current.y = THREE.MathUtils.lerp(parameters.current.y, settings.height, blend)
    parameters.current.z = THREE.MathUtils.lerp(parameters.current.z, settings.distance, blend)
    target.current.set(
      follow ? pointer.current.x * parameters.current.x : 0,
      parameters.current.y + (follow ? pointer.current.y * parameters.current.x * 0.65 : 0),
      parameters.current.z,
    )
    positionRef.current.copy(target.current)
    const wallFollow = settings.wallFollowsCursor ?? follow
    cursorRef.current.copy(wallFollow ? pointer.current : center.current)
    if (!wallFollow) positionRef.current.set(0, parameters.current.y, parameters.current.z)
    // Preserve the authored wall beam and close-up light. In the wide shot
    // rake the blade from camera-right so the knapped ridge casts tonal relief.
    if (lightRef.current) {
      const wide = wideLightMix.current
      lightRef.current.position.copy(target.current)
      if (wide > 0) {
        // Move the key across the face in the wide shot too. A raised
        // light keeps the ridge readable even when the cursor crosses center.
        const x = follow ? Math.tanh(pointer.current.x * 3.3) : 0
        const y = follow ? pointer.current.y : 0
        const travel = THREE.MathUtils.clamp(parameters.current.x / 180, 0, 1)
        const angle = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(
          (settings.wideAngle ?? 64) + x * (x < 0 ? 120 : 42) * travel, -80, 86))
        const range = parameters.current.z
        const pos = lightRef.current.position
        pos.x = THREE.MathUtils.lerp(pos.x, range * Math.sin(angle), wide)
        pos.y = THREE.MathUtils.lerp(pos.y, parameters.current.y + y * range * 0.68 * travel, wide)
        pos.z = THREE.MathUtils.lerp(pos.z, range * Math.cos(angle) * 0.68, wide)
      }
      lightRef.current.intensity = settings.intensity * THREE.MathUtils.lerp(1, 0.6 * (settings.wideBrightness ?? 1), wide)
    }
  }, -0.5)

  // Shared source for the stone and lettering. The wall material localizes its
  // reveal around the current cursor; no extra light or shadow-map pass is used.
  return <pointLight ref={lightRef} position={positionRef.current} color={settings.color} intensity={settings.intensity} decay={0} />
}
