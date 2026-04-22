import { useCallback, useEffect, useRef, useState } from 'react'
import FeedGrid from './components/FeedGrid'
import Nav from './components/Nav'
import CoordinateScene from './coordinate/CoordinateScene'
import { useCoordinatePoints } from './coordinate/useCoordinateData'
import './App.css'

// Transition phases:
//   feed         → normal grid
//   exploding    → non-origin items fade + fly outward; origin pauses + starts translating to center
//   centering    → origin has completed translate; now scaling down
//   coordinate   → R3F scene mounted, origin locked at screen center
//   uncentering  → (reverse of centering) origin scales back up; scene thumbnails fade out
//   unexploding  → (reverse of exploding) origin translates back; non-origin items fly in + fade in
const PHASE_DURATIONS = {
  exploding: 500,
  centering: 500,
  uncentering: 500,
  unexploding: 500,
}

const ORIGIN_WIDTH_RATIO = 120 / 1200

const DARK_PHASES = new Set(['exploding', 'centering', 'coordinate', 'uncentering'])

const MOBILE_BREAKPOINT = 480
const MOBILE_FOCUS_TRANSITION_MS = 400
const MOBILE_FOCUS_EXIT_MS = MOBILE_FOCUS_TRANSITION_MS

export default function App() {
  const [phase, setPhase] = useState('feed')
  const [originId, setOriginId] = useState(null)
  const [originRect, setOriginRect] = useState(null)
  const [sceneZoom, setSceneZoom] = useState(1)
  // { id, rect, exiting } — mobile focus overlay (tap a card to enlarge it)
  const [mobileFocus, setMobileFocus] = useState(null)
  const mobileFocusScrollLockRef = useRef(0)
  const [isMobile, setIsMobile] = useState(
    () => document.documentElement.clientWidth <= MOBILE_BREAKPOINT,
  )
  useEffect(() => {
    const onResize = () =>
      setIsMobile(document.documentElement.clientWidth <= MOBILE_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const points = useCoordinatePoints()
  // Target pixel width of the centered origin item (and every coordinate thumbnail)
  const [originTargetWidth, setOriginTargetWidth] = useState(
    () => window.innerWidth * ORIGIN_WIDTH_RATIO,
  )
  useEffect(() => {
    const onResize = () => setOriginTargetWidth(window.innerWidth * ORIGIN_WIDTH_RATIO)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleItemDoubleClick = useCallback((id, rect) => {
    if (phase === 'feed') {
      setOriginId(id)
      setOriginRect(rect)
      setPhase('exploding')
      return
    }
    // Origin double-clicked in coordinate phase → reverse transition.
    if (phase === 'coordinate' && id === originId) {
      setPhase('uncentering')
    }
  }, [phase, originId])

  const handleMobileFocus = useCallback((id, rect) => {
    if (!isMobile || phase !== 'feed') return
    setMobileFocus({
      id,
      rect,
      exiting: false,
      previousId: null,
      direction: 0,
      phase: 'enter',
    })
  }, [isMobile, phase])

  const exitMobileFocus = useCallback(() => {
    setMobileFocus((f) => (f && !f.exiting ? { ...f, exiting: true } : f))
  }, [])

  useEffect(() => {
    if (!mobileFocus || !mobileFocus.exiting) return
    const t = setTimeout(() => setMobileFocus(null), MOBILE_FOCUS_EXIT_MS)
    return () => clearTimeout(t)
  }, [mobileFocus])

  useEffect(() => {
    if (!mobileFocus || mobileFocus.exiting) return
    if (mobileFocus.phase !== 'enter' && mobileFocus.phase !== 'anim') return
    const t = setTimeout(() => {
      setMobileFocus((current) => {
        if (!current || current.exiting) return current
        if (current.id !== mobileFocus.id || current.phase !== mobileFocus.phase) return current
        return {
          ...current,
          previousId: null,
          direction: 0,
          phase: 'idle',
        }
      })
    }, MOBILE_FOCUS_TRANSITION_MS)
    return () => clearTimeout(t)
  }, [mobileFocus])

  useEffect(() => {
    document.body.classList.toggle(
      'is-mobile-focus',
      !!mobileFocus && !mobileFocus.exiting,
    )
    document.body.classList.toggle(
      'is-mobile-focus-exiting',
      !!mobileFocus && mobileFocus.exiting,
    )
  }, [mobileFocus])

  useEffect(() => {
    if (!isMobile) return
    const shouldLockScroll = !!mobileFocus
    if (!shouldLockScroll) return

    const scrollY = window.scrollY
    mobileFocusScrollLockRef.current = scrollY

    const { style } = document.body
    const prevPosition = style.position
    const prevTop = style.top
    const prevLeft = style.left
    const prevRight = style.right
    const prevWidth = style.width
    const prevOverflow = style.overflow

    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.left = '0'
    style.right = '0'
    style.width = '100%'
    style.overflow = 'hidden'

    return () => {
      style.position = prevPosition
      style.top = prevTop
      style.left = prevLeft
      style.right = prevRight
      style.width = prevWidth
      style.overflow = prevOverflow
      window.scrollTo(0, mobileFocusScrollLockRef.current)
    }
  }, [isMobile, mobileFocus])

  // Phase timing. We advance phase via setTimeout so CSS transitions can run
  // in sequence without fighting each other.
  useEffect(() => {
    if (phase === 'exploding') {
      const t = setTimeout(() => setPhase('centering'), PHASE_DURATIONS.exploding)
      return () => clearTimeout(t)
    }
    if (phase === 'centering') {
      const t = setTimeout(() => setPhase('coordinate'), PHASE_DURATIONS.centering)
      return () => clearTimeout(t)
    }
    if (phase === 'uncentering') {
      const t = setTimeout(() => setPhase('unexploding'), PHASE_DURATIONS.uncentering)
      return () => clearTimeout(t)
    }
    if (phase === 'unexploding') {
      const t = setTimeout(() => {
        setPhase('feed')
        setOriginId(null)
        setOriginRect(null)
        setSceneZoom(1)
      }, PHASE_DURATIONS.unexploding)
      return () => clearTimeout(t)
    }
  }, [phase])

  // Dark background while in the 3D coordinate mode (including reverse enter).
  // Removed on `unexploding` so the bg fades back to normal alongside items
  // flying back in (body has a 0.6s bg-color transition).
  useEffect(() => {
    document.body.classList.toggle('is-dark', DARK_PHASES.has(phase))
  }, [phase])

  // Scene is mounted for forward centering/coordinate AND reverse uncentering
  // so thumbnails can fade out. Unmounts once we reach `unexploding`.
  const showScene =
    phase === 'centering' || phase === 'coordinate' || phase === 'uncentering'

  return (
    <>
      {phase === 'feed' && <Nav />}
      <FeedGrid
        phase={phase}
        originId={originId}
        originRect={originRect}
        originTargetWidth={originTargetWidth}
        sceneZoom={sceneZoom}
        onItemDoubleClick={handleItemDoubleClick}
        mobileFocus={mobileFocus}
        onMobileFocus={handleMobileFocus}
        onExitMobileFocus={exitMobileFocus}
      />
      {showScene && (
        <CoordinateScene
          points={points}
          originId={originId}
          thumbnailWidth={originTargetWidth}
          onZoomChange={setSceneZoom}
          exiting={phase === 'uncentering'}
        />
      )}
    </>
  )
}
