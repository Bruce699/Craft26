import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { useDialKitController } from 'dialkit'
import '@mux/mux-video'
import RockScene from './RockScene'
import { playlist } from './playlist'
import { shapeControls, sculptControls, flattenShape } from './rockShapeControls'
import { formPreset, newOrganicForm } from './rockFormControls'
import { videoWindowControls, videoWindowDefaults, windowForAspect, syncVideoWindow } from './videoWindowControls'
import { backdropControls, lightingControls } from './backdropControls'
import { rockVersions, withControlDefaults } from './rockVersions'
import './InternetDesign.css'

const controls = {
  playback: {
    _collapsed: true,
    clip: {
      type: 'select',
      options: playlist.map((clip, index) => ({ value: String(index), label: `${String(index + 1).padStart(2, '0')} · ${clip.name}` })),
      default: '26',
    },
    playing: true,
    muted: true,
    volume: [0, 0, 1, 0.01],
    speed: [1, 0.25, 2, 0.05],
    autoAdvance: true,
    previous: { type: 'action', label: 'Previous clip' },
    next: { type: 'action', label: 'Next clip' },
    restart: { type: 'action', label: 'Restart clip' },
  },
  rock: {
    _collapsed: true,
    expanded: false,
    scale: [0.75, 0.5, 1.35, 0.01],
    pointerTilt: true,
    tiltAmount: [5, 0, 25, 0.5],
    smoothing: [8, 1, 20, 0.5],
    rotationX: [0, -180, 180, 1],
    rotationY: [0, -180, 180, 1],
    rotationZ: [0, -180, 180, 1],
  },
  lighting: lightingControls,
  backdrop: backdropControls,
  videoWindow: videoWindowControls,
  shape: shapeControls,
  sculpt: sculptControls,
  finish: {
    _collapsed: true,
    color: '#3b3b3b',
    metalness: [1, 0, 1, 0.01],
    roughness: [0.41, 0, 1, 0.01],
    bump: [0.3, 0, 1, 0.01],
    screenGlow: [0.62, 0, 1, 0.01],
    light: [1, 0, 2, 0.01],
  },
  screenLight: {
    _collapsed: true,
    enabled: true,
    strength: [0.53, 0, 1, 0.01],
    reach: [28, 8, 80, 1],
    spread: [0.34, 0.08, 0.8, 0.01],
    haze: [0.33, 0, 0.35, 0.005],
  },
  canvas: { _collapsed: true, background: '#0F0F0F' },
  reset: { type: 'action', label: 'Reset everything' },
}

const spearControls = withControlDefaults(controls, {
  playback: rockVersions[2].playback,
  rock: rockVersions[2].rock,
  shape: rockVersions[2].shape,
  finish: rockVersions[2].finish,
  lighting: rockVersions[2].lighting,
  screenLight: rockVersions[2].screenLight,
})
spearControls.opening = { size: [100, 50, 120, 1], horizontal: [0, -10, 10, 0.1], vertical: [0, -14, 18, 0.1] }
delete spearControls.videoWindow
spearControls.shape.presets = { spear: { type: 'action', label: 'Stone spear' }, ...spearControls.shape.presets }
spearControls.finish.flakeScale = [1, 0.35, 2.5, 0.05]
spearControls.finish.detail = [1, 0, 2, 0.05]
spearControls.finish.grain = [0.12, 0, 0.5, 0.01]

class SceneBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { this.props.onError(error) }
  render() { return this.state.failed ? null : this.props.children }
}

function Icon({ name }) {
  const paths = {
    previous: <><path d="M6 5v14" /><path d="m18 5-10 7 10 7Z" /></>,
    next: <><path d="M18 5v14" /><path d="m6 5 10 7-10 7Z" /></>,
    pause: <><path d="M8 5v14M16 5v14" /></>,
    play: <path d="m8 5 11 7-11 7Z" />,
    muted: <><path d="m10 5-5 4H2v6h3l5 4Z" /><path d="m16 9 6 6m0-6-6 6" /></>,
    sound: <><path d="m10 5-5 4H2v6h3l5 4Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
    expand: <path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6" />,
    collapse: <path d="M3 9h6V3m6 0v6h6M9 21v-6H3m18 0h-6v6" />,
    sculpt: <><path d="m14 4 6 6M6 14 17 3l4 4L10 18H6Z" /><path d="M3 21c0-3 1-4 4-4" /></>,
    undo: <><path d="m8 4-5 5 5 5" /><path d="M3 9h10a7 7 0 0 1 7 7v3" /></>,
  }
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function InternetDesign({ version = 1, dialOpen = false, sceneOverrides }) {
  const profile = rockVersions[version] ?? rockVersions[1]
  const playerRef = useRef(null)
  const sculptApiRef = useRef(null)
  const previousWindow = useRef(videoWindowDefaults)
  const [video, setVideo] = useState(null)
  const [ready, setReady] = useState(false)
  const [mediaError, setMediaError] = useState(false)
  const [needsGesture, setNeedsGesture] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [strokeCount, setStrokeCount] = useState(0)
  const dial = useDialKitController(version === 2 ? 'Rock player · V2' : 'Rock player', version === 2 ? spearControls : controls, {
    id: version === 2 ? 'internet-design-rock-v2' : 'internet-design-rock',
    onAction(path) {
      if (path === 'playback.previous') changeClip(-1)
      if (path === 'playback.next') changeClip(1)
      if (path === 'playback.restart') {
        playerRef.current.currentTime = 0
        dial.setValue('playback.playing', true)
      }
      if (path === 'sculpt.undo') sculptApiRef.current?.undo()
      if (path === 'sculpt.clear') sculptApiRef.current?.clear()
      if (path === 'videoWindow.square') dial.setValues({ videoWindow: windowForAspect(1, dial.getValues().videoWindow) })
      if (path === 'videoWindow.wide') dial.setValues({ videoWindow: windowForAspect(16 / 9, dial.getValues().videoWindow) })
      if (path === 'videoWindow.portrait') dial.setValues({ videoWindow: windowForAspect(9 / 16, dial.getValues().videoWindow) })
      if (path === 'videoWindow.reset') dial.setValues({ videoWindow: videoWindowDefaults })
      if (path === 'shape.reset') {
        sculptApiRef.current?.clear()
        dial.setValues({ shape: profile.shape })
      }
      if (path.startsWith('shape.presets.')) {
        sculptApiRef.current?.clear()
        const name = path.split('.').at(-1)
        dial.setValues({ shape: name === 'spear' ? profile.shape : formPreset(name) })
      }
      if (path === 'shape.randomize') {
        sculptApiRef.current?.clear()
        dial.setValues({ shape: newOrganicForm() })
      }
      if (path === 'reset') {
        sculptApiRef.current?.clear()
        dial.resetValues()
      }
    },
  })
  const params = dial.values
  const clipIndex = Number(params.playback.clip)
  const clip = playlist[clipIndex] ?? playlist[0]

  // Width, height, and aspect are three views of the same dimensions. Changing
  // aspect preserves area when possible; editing either dimension updates ratio.
  useLayoutEffect(() => {
    if (version === 2) return
    const current = params.videoWindow
    const next = syncVideoWindow(current, previousWindow.current)
    previousWindow.current = next
    if (['width', 'height', 'aspectRatio'].some((key) => Math.abs(current[key] - next[key]) > 1e-8)) {
      dial.setValues({ videoWindow: next })
    }
  }, [version, params.videoWindow?.width, params.videoWindow?.height, params.videoWindow?.aspectRatio, dial.setValues])

  useEffect(() => {
    // DialKit re-registers retained panels in StrictMode and snaps slider values.
    // Restore the linked dimensions after registration so the square is exact.
    previousWindow.current = videoWindowDefaults
    dial.setValues(version === 2 ? { rock: { expanded: false } } : { videoWindow: videoWindowDefaults, rock: { expanded: false } })
  }, [dial.setValues, version])

  function changeClip(direction) {
    const current = Number(dial.getValues().playback.clip)
    dial.setValue('playback.clip', String((current + direction + playlist.length) % playlist.length))
  }

  const tryPlay = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    player.play()?.then(() => setNeedsGesture(false)).catch((error) => {
      if (error.name === 'NotAllowedError') setNeedsGesture(true)
    })
  }, [])

  useEffect(() => {
    const previousTitle = document.title
    document.title = profile.title
    return () => { document.title = previousTitle }
  }, [profile.title])

  useEffect(() => {
    const player = playerRef.current
    // Mux exposes its native HTMLVideoElement for the Three.js video texture.
    const attachVideo = () => setVideo(player.nativeEl ?? player.shadowRoot?.querySelector('video') ?? null)
    attachVideo()
    const onCanPlay = () => {
      attachVideo()
      setReady(true)
      setMediaError(false)
      const playback = dial.getValues().playback
      player.muted = playback.muted
      player.volume = playback.volume
      player.playbackRate = playback.speed
      if (playback.playing) tryPlay()
      else player.pause()
    }
    const onEnded = () => {
      if (dial.getValues().playback.autoAdvance) changeClip(1)
      else dial.setValue('playback.playing', false)
    }
    const onLoadStart = () => { setReady(false); setMediaError(false) }
    const onError = () => { setMediaError(true); setReady(false) }
    player.addEventListener('canplay', onCanPlay)
    player.addEventListener('loadedmetadata', attachVideo)
    player.addEventListener('ended', onEnded)
    player.addEventListener('loadstart', onLoadStart)
    player.addEventListener('error', onError)
    return () => {
      player.removeEventListener('canplay', onCanPlay)
      player.removeEventListener('loadedmetadata', attachVideo)
      player.removeEventListener('ended', onEnded)
      player.removeEventListener('loadstart', onLoadStart)
      player.removeEventListener('error', onError)
      player.pause()
    }
  }, [])

  useEffect(() => {
    const player = playerRef.current
    player.muted = params.playback.muted
    player.volume = params.playback.volume
    player.playbackRate = params.playback.speed
    if (params.playback.playing) tryPlay()
    else player.pause()
  }, [clipIndex, params.playback.playing, params.playback.muted, params.playback.volume, params.playback.speed, tryPlay])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Escape') {
        dial.setValue('rock.expanded', false)
        dial.setValue('sculpt.enabled', false)
        return
      }
      const target = event.target
      const editingField = target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="slider"], [role="combobox"]')
      if (!editingField && !event.shiftKey && (event.metaKey || event.ctrlKey) && event.code === 'KeyZ' && dial.getValues().sculpt.enabled) {
        event.preventDefault()
        sculptApiRef.current?.undo()
        return
      }
      if (target instanceof Element && target.closest('input, textarea, select, button, [contenteditable="true"], [role="slider"], [role="combobox"], [data-dialkit]')) return
      if (event.code === 'Space') {
        event.preventDefault()
        dial.setValue('playback.playing', !dial.getValues().playback.playing)
      }
      if (event.code === 'ArrowRight') { event.preventDefault(); changeClip(1) }
      if (event.code === 'ArrowLeft') { event.preventDefault(); changeClip(-1) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const toggleExpanded = useCallback(() => {
    dial.setValue('rock.expanded', !dial.getValues().rock.expanded)
  }, [dial.setValue, dial.getValues])
  const opening = sceneOverrides?.opening ?? params.opening
  const videoWindow = version === 2 ? {
    width: videoWindowDefaults.width * opening.size / 100,
    height: videoWindowDefaults.height * opening.size / 100,
    offsetX: opening.horizontal, offsetY: opening.vertical,
  } : params.videoWindow
  const showFallback = useCallback(() => setFallback(true), [])

  return (
    <main className={`internet-design${fallback ? ' internet-design--fallback' : ''}${params.sculpt.enabled ? ' internet-design--sculpting' : ''}${dialOpen ? ' internet-design--adjusting' : ''}`} style={{ background: params.canvas.background }} aria-label="Internet Design — Craft rock video player">
      <mux-video
        ref={playerRef}
        class="internet-design__source"
        playback-id={clip.playbackId}
        crossorigin="anonymous"
        muted
        playsinline=""
        preload="auto"
        aria-hidden={!fallback}
        tabIndex={-1}
      />
      <div className="internet-design__canvas">
        <SceneBoundary onError={showFallback}>
          <Canvas
            role="img"
            aria-label="Interactive rock video player with carved A NEW STONE AGE lettering"
            camera={{ position: [0, 0, 130], fov: 24, near: 0.1, far: 1000 }}
            dpr={[1, 2]}
            gl={{ antialias: true, alpha: true }}
            fallback={null}
          >
            <Suspense fallback={null}>
              <RockScene
                version={version}
                video={video}
                settings={{ ...params.rock, ...params.finish, ...sceneOverrides?.stone }}
                shape={flattenShape(params.shape)}
                videoWindow={videoWindow}
                backdrop={params.backdrop}
                lighting={{ ...params.lighting, ...sceneOverrides?.lighting }}
                screenLight={params.screenLight}
                sculpt={params.sculpt}
                sculptApiRef={sculptApiRef}
                onStrokeCountChange={setStrokeCount}
                onExpand={toggleExpanded}
                onError={showFallback}
              />
            </Suspense>
          </Canvas>
        </SceneBoundary>
      </div>
      <nav className="internet-design__versions" aria-label="Rock versions">
        {Object.values(rockVersions).map((item) => (
          <a key={item.number} href={item.path} aria-label={`Rock version ${item.number}`} aria-current={item.number === version ? 'page' : undefined}>V{item.number}</a>
        ))}
      </nav>
      <div className="internet-design__toolbar" role="toolbar" aria-label="Player controls">
        <button type="button" aria-label="Previous clip" title="Previous clip (←)" onClick={() => changeClip(-1)}><Icon name="previous" /></button>
        <button type="button" aria-label={params.playback.playing ? 'Pause video' : 'Play video'} title={params.playback.playing ? 'Pause (Space)' : 'Play (Space)'} aria-pressed={!params.playback.playing} onClick={() => dial.setValue('playback.playing', !params.playback.playing)}><Icon name={params.playback.playing ? 'pause' : 'play'} /></button>
        <button type="button" aria-label="Next clip" title="Next clip (→)" onClick={() => changeClip(1)}><Icon name="next" /></button>
        <span className="internet-design__divider" />
        <button type="button" aria-label={params.playback.muted ? 'Unmute video' : 'Mute video'} title={params.playback.muted ? 'Unmute' : 'Mute'} aria-pressed={params.playback.muted} onClick={() => dial.setValue('playback.muted', !params.playback.muted)}><Icon name={params.playback.muted ? 'muted' : 'sound'} /></button>
        <button type="button" aria-label={params.rock.expanded ? 'Collapse player' : 'Expand player'} title={params.rock.expanded ? 'Collapse (Esc)' : 'Expand'} aria-pressed={params.rock.expanded} onClick={toggleExpanded}><Icon name={params.rock.expanded ? 'collapse' : 'expand'} /></button>
        <span className="internet-design__divider" />
        <button type="button" aria-label={params.sculpt.enabled ? 'Stop sculpting' : 'Sculpt rock'} title={params.sculpt.enabled ? 'Stop sculpting (Esc)' : 'Sculpt rock'} aria-pressed={params.sculpt.enabled} onClick={() => dial.setValue('sculpt.enabled', !params.sculpt.enabled)}><Icon name="sculpt" /></button>
        {params.sculpt.enabled && <button type="button" aria-label="Undo brush stroke" title="Undo brush stroke (⌘Z / Ctrl+Z)" disabled={!strokeCount} onClick={() => sculptApiRef.current?.undo()}><Icon name="undo" /></button>}
      </div>
      {params.sculpt.enabled && (
        <div className="internet-design__sculpt-tools" role="toolbar" aria-label="Sculpting tools">
          {[['grab', 'Grab'], ['stretch', 'Stretch'], ['push', 'Push'], ['raise', 'Pull'], ['carve', 'Dent'], ['smooth', 'Smooth']].map(([mode, label]) => <button type="button" key={mode} aria-pressed={params.sculpt.mode === mode} onClick={() => dial.setValue('sculpt.mode', mode)}>{label}</button>)}
          <span>{params.sculpt.mode === 'grab' || params.sculpt.mode === 'stretch' ? 'Drag a region to reshape it' : 'Drag to push or sculpt the surface'}</span>
        </div>
      )}
      {needsGesture && params.playback.playing && !mediaError && (
        <button type="button" className="internet-design__start" onClick={tryPlay}><Icon name="play" /><span>Play video</span></button>
      )}
      {mediaError && (
        <button type="button" className="internet-design__start" onClick={() => { playerRef.current.load(); if (params.playback.playing) tryPlay() }}>Retry video</button>
      )}
      <div className="internet-design__caption" aria-live="polite">
        <span className={!ready && !mediaError ? 'internet-design__status internet-design__status--loading' : 'internet-design__status'} aria-hidden="true" />
        <span>{clip.name}</span>
        <span className="internet-design__count">{String(clipIndex + 1).padStart(2, '0')} / {playlist.length}</span>
      </div>
    </main>
  )
}
