import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { loadBackdropRelief } from './backdropRelief'
import { createWallSurface } from './wallMaterial'

// Original vector from Figma node 15:494. Geometry, letterforms, and positions
// come from this asset; only its baked shading is replaced by live scene light.
const DESIGN_URL = '/internet-design/figma/new-stone-age.svg'
const ignoreRaycast = () => null

export default function CarvedBackdrop({ settings, lighting, lightPositionRef, lightCursorRef }) {
  const [maps, setMaps] = useState(null)
  const rootRef = useRef(null)
  const planeRef = useRef(null)
  const materialRef = useRef(null)
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())
  const surface = useMemo(() => maps ? createWallSurface(maps) : null, [maps])

  useEffect(() => {
    let active = true
    loadBackdropRelief(DESIGN_URL).then((result) => {
      if (active) setMaps(result)
    }).catch((error) => console.error('Unable to load the Figma relief:', error))
    return () => { active = false }
  }, [])

  useLayoutEffect(() => {
    if (!maps) return
    // Fiber 8 assigns output color space to attached byte textures. These maps
    // are numerical relief data and must remain linear after attachment.
    for (const texture of [maps.normalMap, maps.wornNormalMap, surface.grainMap]) {
      texture.colorSpace = THREE.NoColorSpace
      texture.anisotropy = Math.min(8, maxAnisotropy)
      texture.needsUpdate = true
    }
    // Shader edits must also reach retained live DialKit scenes during HMR.
    if (materialRef.current) materialRef.current.needsUpdate = true
  }, [maps, surface, maxAnisotropy])

  useFrame(({ camera, size }) => {
    if (!maps || !surface || !rootRef.current) return
    const distance = Math.max(1, camera.position.z + settings.depth)
    const viewHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * distance
    const viewWidth = viewHeight * size.width / Math.max(size.height, 1)
    // The wall always fills the frame. The Figma composition is mapped into it
    // separately, so changing its size or position never reveals a panel edge.
    const wallWidth = viewWidth * 1.02, wallHeight = viewHeight * 1.02
    const artworkWidth = Math.max(viewWidth, viewHeight * maps.aspect) * settings.scale
    const artworkHeight = artworkWidth / maps.aspect
    planeRef.current.scale.set(wallWidth, wallHeight, 1)
    rootRef.current.position.set(0, 0, -settings.depth)
    surface.uniforms.wallArtworkRepeat.value.set(wallWidth / artworkWidth, wallHeight / artworkHeight)
    surface.uniforms.wallArtworkOffset.value.set(-settings.offsetX / artworkWidth, -settings.offsetY / artworkHeight)
    surface.uniforms.wallGrainRepeat.value.set(wallWidth / 9, wallHeight / 9)
    surface.uniforms.wallWear.value = settings.wear
    surface.uniforms.wallGrain.value = settings.grain
    surface.uniforms.wallReflection.value = settings.wallReflection ?? 0.035
    surface.uniforms.wallLightPosition.value.copy(lightPositionRef.current)
    // Focus follows the cursor's projection onto the wall. The key light's
    // deliberate overhead offset affects shading direction, not beam placement.
    surface.uniforms.wallFocus.value.set(lightCursorRef.current.x * viewWidth * 0.5, lightCursorRef.current.y * viewHeight * 0.5)
    surface.uniforms.wallLightColor.value.set(lighting.color)
    surface.uniforms.wallLightIntensity.value = lighting.intensity
    surface.uniforms.wallRadius.value = lighting.wallRadius
    surface.uniforms.wallSoftness.value = lighting.wallSoftness
    surface.uniforms.wallContrast.value = lighting.carvingContrast
  })

  if (!maps) return null

  return (
    <group ref={rootRef} visible={settings.enabled} userData={{ figmaNode: '15:494', sourceAsset: DESIGN_URL }}>
      <mesh ref={planeRef} raycast={ignoreRaycast}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial
          ref={materialRef}
          color={settings.color}
          emissive={settings.color}
          emissiveIntensity={0.8}
          metalness={settings.metalness}
          roughness={settings.roughness}
          normalMap={maps.normalMap}
          normalScale={[settings.relief, settings.relief]}
          onBeforeCompile={surface.onBeforeCompile}
          customProgramCacheKey={surface.cacheKey}
        />
      </mesh>
    </group>
  )
}
