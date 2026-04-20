import { useCallback, useEffect, useState } from 'react'
import FeedGrid from './components/FeedGrid'
import Nav from './components/Nav'
import CoordinateScene from './coordinate/CoordinateScene'
import { useCoordinatePoints } from './coordinate/useCoordinateData'
import './App.css'

// Transition phases:
//   feed       → normal grid
//   exploding  → non-origin items fade + fly outward; origin pauses + starts translating to center
//   centering  → origin has completed translate; now scaling down
//   coordinate → R3F scene mounted, origin locked at screen center
const PHASE_DURATIONS = {
  exploding: 500,   // ms — matches origin translate + non-origin explosion
  centering: 500,   // ms — origin scale-down
}

const ORIGIN_WIDTH_RATIO = 80 / 1200

export default function App() {
  const [phase, setPhase] = useState('feed')
  const [originId, setOriginId] = useState(null)
  const [originRect, setOriginRect] = useState(null)
  const [sceneZoom, setSceneZoom] = useState(1)

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
    if (phase !== 'feed') return
    setOriginId(id)
    setOriginRect(rect)
    setPhase('exploding')
  }, [phase])

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
  }, [phase])

  // Dark background once transition starts. Done via body class so it
  // covers the whole viewport and fades smoothly alongside the scene.
  useEffect(() => {
    document.body.classList.toggle('is-dark', phase !== 'feed')
  }, [phase])

  const showScene = phase === 'centering' || phase === 'coordinate'

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
      />
      {showScene && (
        <CoordinateScene
          points={points}
          originId={originId}
          thumbnailWidth={originTargetWidth}
          onZoomChange={setSceneZoom}
        />
      )}
    </>
  )
}
