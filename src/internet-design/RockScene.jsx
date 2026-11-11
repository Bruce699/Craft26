import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Environment, PerspectiveCamera, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { createScreenGlowMaterial } from './screenGlowMaterial'
import { createRockDeformer } from './rockGeometry'
import { createSpearOpening } from './spearOpening'
import { createSpearGeometry } from './spearGeometry'
import { createVideoWindowDeformer } from './videoWindowGeometry'
import { videoWindowDefaults } from './videoWindowControls'
import { shapeDefaults, flattenShape } from './rockShapeControls'
import { useRockSculpt } from './useRockSculpt'
import CarvedBackdrop from './CarvedBackdrop'
import CursorLight from './CursorLight'
import ScreenLightBeams from './ScreenLightBeams'
import { backdropDefaults, lightingDefaults } from './backdropControls'
import { createRockApproach, approachZ } from './rockApproach'

const MODEL_URL = '/internet-design/marcd_stone_smooth.gltf'
const BUMP_URL = '/internet-design/stone_nm_1k.jpg'
const SPEAR_BUMP_URL = '/internet-design/v2/rock_face_03_disp_1k.png'
const ENVIRONMENT_URL = '/internet-design/studio_1k_bw.hdr'
const DRACO_PATH = '/internet-design/draco/'
const CAMERA_FOV = 24
const RADIANS = Math.PI / 180
const DEFAULT_SETTINGS = {
  scale: 0.75,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 0,
  pointerTilt: true,
  tiltAmount: 5,
  smoothing: 8,
  metalness: 1,
  roughness: 0.41,
  bump: 0.3,
  color: '#3b3b3b',
  light: 1,
  screenGlow: 0.62,
  expanded: false,
}
const DEFAULT_SHAPE = flattenShape(shapeDefaults)
const DEFAULT_SCULPT = { enabled: false, mode: 'grab', brushSize: 12, strength: 0.45 }
const ignoreRaycast = () => null

class SceneErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.error ? null : this.props.children
  }
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    update()
    return () => query.removeEventListener('change', update)
  }, [])

  return reducedMotion
}

function useCoverVideoTexture(video, frameAspect) {
  const [texture, setTexture] = useState(null)

  useEffect(() => {
    if (!video) {
      setTexture(null)
      return undefined
    }

    const nextTexture = new THREE.VideoTexture(video)
    nextTexture.colorSpace = THREE.SRGBColorSpace
    nextTexture.minFilter = THREE.LinearFilter
    nextTexture.magFilter = THREE.LinearFilter
    nextTexture.generateMipmaps = false
    nextTexture.flipY = true
    nextTexture.center.set(0.5, 0.5)
    nextTexture.rotation = Math.PI
    nextTexture.offset.set(0, 0)

    setTexture(nextTexture)

    return () => {
      nextTexture.dispose()
    }
  }, [video])

  useLayoutEffect(() => {
    if (!texture || !video) return
    const updateCrop = () => {
      const sourceAspect = video.videoWidth && video.videoHeight
        ? video.videoWidth / video.videoHeight
        : frameAspect
      // Centered cover crop follows the actual window, preserving the video's
      // proportions and the reference's half-turn / negative-Y orientation.
      texture.repeat.set(Math.min(1, frameAspect / sourceAspect), -Math.min(1, sourceAspect / frameAspect))
      texture.updateMatrix()
    }
    updateCrop()
    video.addEventListener('loadedmetadata', updateCrop)
    video.addEventListener('resize', updateCrop)
    return () => {
      video.removeEventListener('loadedmetadata', updateCrop)
      video.removeEventListener('resize', updateCrop)
    }
  }, [texture, video, frameAspect])

  return texture
}

function RockModel({ version, video, settings, shape, videoWindow, sculpt, backdrop, lighting, screenLight, sculptApiRef, onStrokeCountChange, onExpand, onReady }) {
  const { nodes, scene } = useGLTF(MODEL_URL, DRACO_PATH)
  const bumpSource = useTexture(version === 2 ? SPEAR_BUMP_URL : BUMP_URL)
  const reducedMotion = useReducedMotion()
  const cameraRef = useRef(null)
  const motionRef = useRef(null)
  const videoMaterialRef = useRef(null)
  const stoneMaterialRef = useRef(null)
  const stoneMeshRef = useRef(null)
  const brushCursorRef = useRef(null)
  const readyRef = useRef(false)
  const [approach] = useState(() => createRockApproach(settings.expanded))
  const wideLightMix = useRef(version === 2 && !settings.expanded ? 1 : 0)
  const approachTimeRef = useRef(0)
  const lightPositionRef = useRef(new THREE.Vector3(0, lighting.height, lighting.distance))
  const lightCursorRef = useRef(new THREE.Vector2())
  const size = useThree((state) => state.size)
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())

  const geometries = useMemo(() => {
    const meshes = []
    scene.traverse((object) => {
      if (object.isMesh) meshes.push(object)
    })
    const screen = nodes.marcd_stone_smooth003_1?.geometry
      ?? meshes.find((mesh) => mesh.geometry.attributes.position.count < 1000)?.geometry
    const stone = nodes.marcd_stone_smooth003_2?.geometry
      ?? meshes.find((mesh) => mesh.geometry.attributes.position.count > 1000)?.geometry
    if (!screen || !stone) throw new Error('The rock model is missing its video or stone surface.')
    stone.computeBoundingBox()
    const bounds = stone.boundingBox
    return {
      screen,
      stone,
      width: bounds.max.x - bounds.min.x,
      height: bounds.max.y - bounds.min.y,
      depth: bounds.max.z - bounds.min.z,
    }
  }, [nodes, scene])

  const deformer = useMemo(() => {
    const source = version === 2 ? createSpearGeometry(geometries.stone, geometries.screen) : geometries.stone
    const base = createRockDeformer(source, geometries.screen)
    if (version === 2) source.dispose()
    return version === 2 ? createSpearOpening(base) : createVideoWindowDeformer(base, geometries.screen)
  }, [geometries, version])
  const brushGeometry = useMemo(() => new THREE.RingGeometry(0.975, 1, 64), [])
  const sculpting = useRockSculpt({
    deformer, shape, videoWindow, sculpt, apiRef: sculptApiRef, meshRef: stoneMeshRef,
    cursorRef: brushCursorRef, onStrokeCountChange,
  })
  const videoTexture = useCoverVideoTexture(video, deformer.aspect)
  const stoneSurface = useMemo(() => createScreenGlowMaterial(deformer.frame, version), [deformer, version])

  useLayoutEffect(() => {
    if (stoneMaterialRef.current) stoneMaterialRef.current.needsUpdate = true
  }, [stoneSurface])

  useFrame(() => {
    const { width, height } = deformer.window
    const uniforms = stoneSurface.uniforms
    uniforms.screenGlowCenter.value.copy(deformer.frame.center)
    uniforms.screenGlowVideo.value = videoTexture
    if (videoTexture) uniforms.screenGlowVideoMatrix.value.copy(videoTexture.matrix)
    uniforms.screenGlowHalfSize.value.set(deformer.frame.halfWidth * width, deformer.frame.halfHeight * height)
    uniforms.screenGlowBandScale.value = Math.max(width, height)
    uniforms.screenGlowStrength.value = settings.screenGlow
    uniforms.screenGlowReady.value = videoTexture && video?.readyState >= 2 && video.videoWidth > 0 ? 1 : 0
    if (version === 2) {
      uniforms.roughStoneFlakeScale.value = settings.flakeScale ?? 1
      uniforms.roughStoneDetail.value = settings.detail ?? 1
      uniforms.roughStoneGrain.value = settings.grain ?? 0.12
    }
  })

  useEffect(() => () => {
    deformer.dispose()
    brushGeometry.dispose()
  }, [deformer, brushGeometry])

  const bumpTexture = useMemo(() => {
    const texture = bumpSource.clone()
    texture.colorSpace = THREE.NoColorSpace
    // The stone shader samples an interior atlas patch in deformed model space.
    // Preserve detail at grazing angles, without stretching the original UVs.
    texture.anisotropy = Math.min(8, maxAnisotropy)
    if (version === 2) texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.needsUpdate = true
    return texture
  }, [bumpSource, maxAnisotropy, version])

  useEffect(() => () => bumpTexture.dispose(), [bumpTexture])

  // Fiber 8 assigns its output color space when attaching byte textures. The
  // reference resets this texture to linear data after attachment, so do that
  // before the first frame; bump heights must not undergo a color conversion.
  useLayoutEffect(() => {
    bumpTexture.colorSpace = THREE.NoColorSpace
    bumpTexture.needsUpdate = true
  }, [bumpTexture])

  // Adding a map after the first render changes Three's shader defines.
  useEffect(() => {
    if (videoMaterialRef.current) videoMaterialRef.current.needsUpdate = true
  }, [videoTexture])

  useEffect(() => {
    const screenMaterial = videoMaterialRef.current
    const stoneMaterial = stoneMaterialRef.current
    const brushMaterial = brushCursorRef.current?.material
    return () => {
      screenMaterial?.dispose()
      stoneMaterial?.dispose()
      brushMaterial?.dispose()
    }
  }, [])

  useEffect(() => {
    if (readyRef.current) return
    readyRef.current = true
    onReady?.()
  }, [onReady])

  const framing = useMemo(() => {
    const aspect = Math.max(size.width, 1) / Math.max(size.height, 1)
    const tangent = Math.tan(CAMERA_FOV * RADIANS / 2)
    const widthFraction = 0.72
    const heightFraction = version === 2 ? 0.78 : 0.7
    const bounds = deformer.geometry.boundingBox.clone().translate(deformer.anchor.clone().negate())
    const transform = new THREE.Matrix4().makeRotationY(Math.PI)
    transform.premultiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
      settings.rotationX * RADIANS, settings.rotationY * RADIANS, settings.rotationZ * RADIANS,
    )))
    bounds.applyMatrix4(transform)
    const center = version === 2 ? bounds.getCenter(new THREE.Vector3()) : new THREE.Vector3()
    bounds.translate(new THREE.Vector3(-center.x, -center.y, 0))
    const halfWidth = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x))
    const halfHeight = Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y))
    const horizontalFit = halfWidth / (tangent * aspect * widthFraction)
    const verticalFit = halfHeight / (tangent * heightFraction)
    return { distance: Math.max(horizontalFit, verticalFit) + Math.max(0, bounds.max.z), x: -center.x, y: -center.y }
  }, [size.width, size.height, settings.rotationX, settings.rotationY, settings.rotationZ, deformer, sculpting.revision, version])
  const cameraDistance = framing.distance

  const focusOffset = useMemo(() => new THREE.Vector3(), [])
  const initialDistance = useRef(cameraDistance)
  const initialScale = useRef(settings.scale)
  const initialPosition = useRef([framing.x * settings.scale, framing.y * settings.scale, 0])

  useLayoutEffect(() => {
    if (reducedMotion) approach.snap(settings.expanded)
    else approach.setExpanded(settings.expanded, approachTimeRef.current)
  }, [approach, settings.expanded, reducedMotion])

  useFrame((state, delta) => {
    const group = motionRef.current
    const camera = cameraRef.current
    if (!group || !camera) return
    // Keep the mesh, brush plane, and camera still for the whole captured stroke.
    if (sculpting.draggingRef.current) return
    approachTimeRef.current += Math.max(0, delta) * 1000

    const blend = reducedMotion
      ? 1
      : 1 - Math.exp(-Math.max(0.01, settings.smoothing) * Math.min(delta, 0.1))
    const canTilt = settings.pointerTilt && !settings.expanded && !sculpt.enabled && !reducedMotion && size.width > 950
    const tilt = canTilt ? settings.tiltAmount * RADIANS : 0
    group.rotation.x = THREE.MathUtils.lerp(
      group.rotation.x,
      settings.rotationX * RADIANS - state.pointer.y * tilt,
      blend,
    )
    group.rotation.y = THREE.MathUtils.lerp(
      group.rotation.y,
      settings.rotationY * RADIANS + state.pointer.x * tilt,
      blend,
    )
    group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, settings.rotationZ * RADIANS, blend)
    group.scale.setScalar(THREE.MathUtils.lerp(group.scale.x, settings.scale, blend))
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, cameraDistance, blend)
    // Move only the rock toward the fixed camera. The video anchor reaches 2×
    // apparent size in exactly 1200ms using cubic-bezier(.5, 0, 0, 1).
    // Reset the old imperative camera zoom during hot reload as well.
    if (camera.zoom !== 1) {
      camera.zoom = 1
      camera.updateProjectionMatrix()
    }
    const magnification = approach.sample(approachTimeRef.current)
    wideLightMix.current = version === 2 ? 2 - magnification : 0
    if (version === 2) {
      // Follow the actual recessed player through its local offset, the scan's
      // half turn, the authored pose, and scale. Blend from whole-stone framing
      // to the player's center using the same clock as the approach.
      focusOffset.copy(deformer.frame.center).sub(deformer.anchor)
      focusOffset.x *= -1
      focusOffset.z *= -1
      focusOffset.applyQuaternion(group.quaternion).multiplyScalar(group.scale.x)
      const focusMix = magnification - 1
      group.position.x = THREE.MathUtils.lerp(framing.x * group.scale.x, -focusOffset.x, focusMix)
      group.position.y = THREE.MathUtils.lerp(framing.y * group.scale.x, -focusOffset.y, focusMix)
      group.position.z = approachZ(camera.position.z - focusOffset.z, magnification)
    } else {
      group.position.x = THREE.MathUtils.lerp(group.position.x, framing.x * settings.scale, blend)
      group.position.y = THREE.MathUtils.lerp(group.position.y, framing.y * settings.scale, blend)
      group.position.z = approachZ(camera.position.z, magnification)
    }
  }, -1)

  const expand = (event) => {
    event.stopPropagation()
    if (!sculpting.canExpand() || event.delta > 3) return
    onExpand?.()
  }

  return (
    <>
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        fov={CAMERA_FOV}
        zoom={1}
        near={0.1}
        far={2000}
        position={[0, 0, initialDistance.current]}
      />
      <CursorLight wideLightMix={wideLightMix} settings={lighting} positionRef={lightPositionRef} cursorRef={lightCursorRef} reducedMotion={reducedMotion} />
      <CarvedBackdrop settings={backdrop} lighting={lighting} lightPositionRef={lightPositionRef} lightCursorRef={lightCursorRef} />
      <group ref={motionRef} scale={initialScale.current} position={initialPosition.current}>
        <group rotation={[0, Math.PI, 0]} dispose={null}>
          <group position={[-deformer.anchor.x, -deformer.anchor.y, -deformer.anchor.z]}>
            <mesh geometry={deformer.screenGeometry} onClick={expand} onPointerDown={sculpting.blockScreen} onPointerMove={sculpting.blockScreen}>
              <meshBasicMaterial
                ref={videoMaterialRef}
                map={videoTexture}
                color={videoTexture ? '#ffffff' : '#080808'}
                side={THREE.FrontSide}
                toneMapped={false}
              />
            </mesh>
            <mesh ref={stoneMeshRef} geometry={deformer.geometry} onClick={expand} {...sculpting.events}>
              <meshStandardMaterial
                ref={stoneMaterialRef}
                color={settings.color}
                metalness={settings.metalness}
                roughness={settings.roughness}
                bumpMap={bumpTexture}
                bumpScale={settings.bump}
                onBeforeCompile={stoneSurface.onBeforeCompile}
                customProgramCacheKey={stoneSurface.cacheKey}
              />
            </mesh>
            <ScreenLightBeams frame={deformer.frame} sourceUniforms={stoneSurface.uniforms} settings={screenLight} reducedMotion={reducedMotion} />
            <mesh ref={brushCursorRef} geometry={brushGeometry} visible={false} raycast={ignoreRaycast} renderOrder={10}>
              <meshBasicMaterial color="#e3e3e3" transparent opacity={0.7} side={THREE.DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
            </mesh>
          </group>
        </group>
      </group>
      <Environment
        files={ENVIRONMENT_URL}
        background={false}
        environmentIntensity={settings.light * lighting.ambient}
      />
    </>
  )
}

export default function RockScene({ version = 1, video, settings, shape, videoWindow, sculpt, backdrop, lighting, screenLight, sculptApiRef, onStrokeCountChange, onExpand, onReady, onError }) {
  const resolvedSettings = { ...DEFAULT_SETTINGS, ...settings }

  return (
    <SceneErrorBoundary onError={onError}>
      <Suspense fallback={null}>
        <RockModel
          version={version}
          video={video}
          settings={resolvedSettings}
          shape={{ ...DEFAULT_SHAPE, ...shape }}
          videoWindow={{ ...videoWindowDefaults, ...videoWindow }}
          sculpt={{ ...DEFAULT_SCULPT, ...sculpt }}
          backdrop={{ ...backdropDefaults, ...backdrop }}
          lighting={{ ...lightingDefaults, ...lighting }}
          screenLight={screenLight}
          sculptApiRef={sculptApiRef}
          onStrokeCountChange={onStrokeCountChange}
          onExpand={onExpand}
          onReady={onReady}
        />
      </Suspense>
    </SceneErrorBoundary>
  )
}
