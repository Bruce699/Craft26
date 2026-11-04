import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createScreenLightMaterial, screenLightDefaults } from './screenLightMaterial'

const ignoreRaycast = () => null

export default function ScreenLightBeams({ frame, sourceUniforms, settings, reducedMotion }) {
  const meshRef = useRef(null)
  const geometry = useMemo(() => new THREE.BoxGeometry(2, 2, 1), [])
  const material = useMemo(() => createScreenLightMaterial(sourceUniforms), [sourceUniforms])
  const rotation = useMemo(() => new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(frame.u, frame.v, frame.normal),
  ), [frame])
  const params = { ...screenLightDefaults, ...settings }

  useFrame((state) => {
    if (!meshRef.current) return
    const uniforms = material.uniforms
    // worldToLocal updates parent matrices after the rock's tilt/approach step.
    state.camera.getWorldPosition(uniforms.beamCamera.value)
    meshRef.current.worldToLocal(uniforms.beamCamera.value)
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
  })

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={frame.center}
      quaternion={rotation}
      visible={params.enabled && params.strength + params.haze > 0}
      frustumCulled={false}
      raycast={ignoreRaycast}
      renderOrder={2}
      dispose={null}
    />
  )
}
