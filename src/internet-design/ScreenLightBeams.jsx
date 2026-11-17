import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createScreenLightComposite, createScreenLightMaterial, screenLightDefaults } from './screenLightMaterial'

const ignoreRaycast = () => null
// The haze is soft, and ray-marching it for every screen pixel was the most
// expensive thing in the close-up. March it at this fraction of the canvas
// resolution into its own target, then add that over the frame.
const BEAM_RESOLUTION = 0.5
// Only the offscreen pass looks at this layer; the main camera never does.
const BEAM_LAYER = 1

export default function ScreenLightBeams({ frame, sourceUniforms, settings, reducedMotion }) {
  const meshRef = useRef(null)
  const compositeRef = useRef(null)
  const geometry = useMemo(() => new THREE.BoxGeometry(2, 2, 1), [])
  const material = useMemo(() => createScreenLightMaterial(sourceUniforms), [sourceUniforms])
  const target = useMemo(() => new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false }), [])
  const composite = useMemo(() => createScreenLightComposite(target.texture), [target])
  // One triangle that covers the whole clip-space square.
  const screen = useMemo(() => new THREE.BufferGeometry().setAttribute(
    'position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3),
  ), [])
  const bufferSize = useMemo(() => new THREE.Vector2(), [])
  const rotation = useMemo(() => new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(frame.u, frame.v, frame.normal),
  ), [frame])
  const params = { ...screenLightDefaults, ...settings }
  const enabled = params.enabled && params.strength + params.haze > 0

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    mesh.position.copy(frame.center)
    const uniforms = material.uniforms
    // worldToLocal updates parent matrices after the rock's tilt/approach step.
    state.camera.getWorldPosition(uniforms.beamCamera.value)
    mesh.worldToLocal(uniforms.beamCamera.value)
    uniforms.beamReach.value = Math.max(8, params.reach)
    uniforms.beamSpread.value = params.spread
    uniforms.beamStrength.value = params.strength
    uniforms.beamHaze.value = params.haze
    uniforms.beamTime.value = reducedMotion ? 0 : state.clock.elapsedTime
    const origin = uniforms.beamCamera.value
    const inside = origin.z >= uniforms.beamStart.value && origin.z <= uniforms.beamReach.value
      && Math.abs(origin.x) <= sourceUniforms.screenGlowHalfSize.value.x + origin.z * params.spread
      && Math.abs(origin.y) <= sourceUniforms.screenGlowHalfSize.value.y + origin.z * params.spread
    const side = inside ? THREE.BackSide : THREE.FrontSide
    if (material.side !== side) {
      material.side = side
      material.needsUpdate = true
    }

    // Nothing to add until the video has a frame to shine.
    const lit = enabled && sourceUniforms.screenGlowReady.value > 0.5
    if (compositeRef.current) compositeRef.current.visible = lit
    if (!lit) return
    const { gl, camera } = state
    gl.getDrawingBufferSize(bufferSize)
    const width = Math.max(1, Math.round(bufferSize.x * BEAM_RESOLUTION))
    const height = Math.max(1, Math.round(bufferSize.y * BEAM_RESOLUTION))
    if (target.width !== width || target.height !== height) target.setSize(width, height)
    const previousTarget = gl.getRenderTarget(), previousLayers = camera.layers.mask
    camera.layers.set(BEAM_LAYER)
    gl.setRenderTarget(target)
    gl.clear()
    gl.render(mesh, camera)
    gl.setRenderTarget(previousTarget)
    camera.layers.mask = previousLayers
  })

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => () => { composite.dispose(); screen.dispose() }, [composite, screen])
  useEffect(() => () => target.dispose(), [target])

  return (
    <>
      <mesh
        ref={meshRef}
        geometry={geometry}
        material={material}
        position={frame.center}
        quaternion={rotation}
        layers={BEAM_LAYER}
        visible={enabled}
        frustumCulled={false}
        raycast={ignoreRaycast}
        dispose={null}
      />
      <mesh
        ref={compositeRef}
        geometry={screen}
        material={composite}
        visible={false}
        frustumCulled={false}
        raycast={ignoreRaycast}
        renderOrder={2}
        dispose={null}
      />
    </>
  )
}
