import { useRef, useEffect, useState, useMemo } from 'react'
import '@mux/mux-video'
import './VideoCard.css'

const VISIBILITY_THRESHOLD = 0.3
const EXPLOSION_DISTANCE = 1600 // px to fly outward

const MOBILE_FOCUS_GAP = 4

export default function VideoCard({
  id,
  playbackId,
  name,
  date,
  phase = 'feed',
  isOrigin = false,
  originRect = null,
  originTargetWidth = 0,
  sceneZoom = 1,
  onDoubleClick,
  isMobile = false,
  mobileFocusActive = false,
  isMobileFocused = false,
  isMobileFocusPrevious = false,
  mobileFocusRect = null,
  mobileFocusPhase = null,
  mobileFocusDirection = 0,
  mobileFocusExiting = false,
  onMobileFocus,
  onExitMobileFocus,
}) {
  const videoRef = useRef(null)
  const rootRef = useRef(null)
  const cardRef = useRef(null)
  const originalRectRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const [posterLoaded, setPosterLoaded] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [videoAspectRatio, setVideoAspectRatio] = useState(null)
  const isVideoSizedCard = id === 'c3r1'

  const getMobileFocusTransform = (rect) => {
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = window.innerWidth / 2 - cx
    const dy = window.innerHeight / 2 - cy
    const targetWidth = window.innerWidth - MOBILE_FOCUS_GAP * 2
    const scale = targetWidth / rect.width
    return { dx, dy, scale }
  }

  // Reveal the card (fade + slight upward motion) only after the poster img
  // below has actually rendered. Double rAF guarantees the hidden initial
  // state is painted once before the class flip, so cached posters don't
  // "pop in" without a transition.
  const handlePosterLoad = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPosterLoaded(true))
    })
  }

  // Snapshot the card's viewport rect while it's still in normal feed layout.
  // Once transforms kick in, getBoundingClientRect would return the *moved*
  // position, so we stop updating the snapshot once we leave the feed phase.
  useEffect(() => {
    const snapshotTarget = cardRef.current ?? rootRef.current
    if (phase === 'feed' && !mobileFocusActive && snapshotTarget) {
      originalRectRef.current = snapshotTarget.getBoundingClientRect()
    }
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const markReady = () => setVideoReady(true)
    const resetReady = () => setVideoReady(false)
    const syncAspectRatio = () => {
      if (video.videoWidth && video.videoHeight) {
        setVideoAspectRatio(video.videoWidth / video.videoHeight)
      }
    }

    setVideoReady(video.readyState >= 2)
    syncAspectRatio()

    video.addEventListener('loadeddata', markReady)
    video.addEventListener('canplay', markReady)
    video.addEventListener('loadedmetadata', syncAspectRatio)
    video.addEventListener('resize', syncAspectRatio)
    video.addEventListener('emptied', resetReady)

    return () => {
      video.removeEventListener('loadeddata', markReady)
      video.removeEventListener('canplay', markReady)
      video.removeEventListener('loadedmetadata', syncAspectRatio)
      video.removeEventListener('resize', syncAspectRatio)
      video.removeEventListener('emptied', resetReady)
    }
  }, [playbackId])

  // Auto play/pause based on viewport visibility — only in feed mode.
  // Once the easter egg triggers, the origin is paused explicitly and all
  // other cards leave the screen, so we disable the observer-driven playback.
  useEffect(() => {
    if (phase !== 'feed') return
    const video = videoRef.current
    if (!video) return

    video.muted = true
    video.volume = 0

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.intersectionRatio >= VISIBILITY_THRESHOLD),
      { threshold: [0, VISIBILITY_THRESHOLD, 1] },
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [phase])

  useEffect(() => {
    if (phase !== 'feed') return
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    const attemptPlay = () => {
      if (cancelled) return
      const p = video.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
    }

    if (isMobile && mobileFocusActive) {
      if (isMobileFocused) {
        video.preload = 'auto'
        attemptPlay()
      } else {
        video.preload = 'metadata'
        video.pause()
      }
      return () => {
        cancelled = true
      }
    }

    if (isVisible) {
      attemptPlay()
      video.addEventListener('canplay', attemptPlay)
      return () => {
        cancelled = true
        video.removeEventListener('canplay', attemptPlay)
      }
    } else {
      video.pause()
    }
  }, [
    isMobile,
    isMobileFocused,
    isVisible,
    mobileFocusActive,
    phase,
  ])

  // When this card becomes the origin, pause on the current frame
  useEffect(() => {
    if (isOrigin) {
      const video = videoRef.current
      if (video) video.pause()
    }
  }, [isOrigin])

  const handleDoubleClick = () => {
    if (isMobile) return
    if (!onDoubleClick) return
    // Allow double-click in feed (to enter) OR on the origin card while in
    // the coordinate phase (to reverse back out).
    if (phase !== 'feed' && !(phase === 'coordinate' && isOrigin)) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    onDoubleClick(id, rect)
  }

  const handleClick = () => {
    if (!isMobile || phase !== 'feed') return
    if (isMobileFocused) return
    if (!onMobileFocus) return
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    onMobileFocus(id, rect)
  }

  // When focused on mobile: any click outside exits.
  useEffect(() => {
    if (phase !== 'feed' || !isMobileFocused || mobileFocusExiting) return
    const el = cardRef.current
    if (!el) return

    const onDocClick = (e) => {
      if (!el.contains(e.target)) onExitMobileFocus?.()
    }
    // Defer so the tap that opened focus doesn't immediately close it.
    const rafId = requestAnimationFrame(() => {
      document.addEventListener('click', onDocClick, true)
      document.addEventListener('touchstart', onDocClick, { capture: true, passive: true })
    })

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('click', onDocClick, true)
      document.removeEventListener('touchstart', onDocClick, { capture: true })
    }
  }, [phase, isMobileFocused, mobileFocusExiting, onExitMobileFocus])

  // Compute the transform for this card based on phase + origin rect.
  // For non-origin cards: fly outward from origin center and fade.
  // For the origin card: translate to viewport center, then scale down.
  const transitionStyle = useMemo(() => {
    // Mobile focus overlay — takes precedence over feed phase.
    if (phase === 'feed' && (isMobileFocused || isMobileFocusPrevious)) {
      const focusRect = mobileFocusRect ?? originalRectRef.current
      if (!focusRect) return null
      const { dx, dy, scale } = getMobileFocusTransform(focusRect)
      const commonTransition =
        'transform 0.4s cubic-bezier(0.5, 0, 0, 1), border-radius 0.4s cubic-bezier(0.5, 0, 0, 1)'
      const centeredTransform = `translate(${dx}px, ${dy}px) scale(${scale})`
      const fixedFrame = {
        position: 'fixed',
        top: `${focusRect.top}px`,
        left: `${focusRect.left}px`,
        width: `${focusRect.width}px`,
        height: `${focusRect.height}px`,
      }

      if (isMobileFocusPrevious) {
        const outgoingTransform =
          `translate(${dx - mobileFocusDirection * window.innerWidth}px, ${dy}px) scale(${scale})`
        return {
          ...fixedFrame,
          transform: mobileFocusPhase === 'anim' ? outgoingTransform : centeredTransform,
          borderRadius: `${4 / scale}px`,
          transition: mobileFocusPhase === 'anim' ? commonTransition : 'none',
          zIndex: 99,
          pointerEvents: 'none',
        }
      }

      if (mobileFocusExiting) {
        return {
          ...fixedFrame,
          transform: 'translate(0px, 0px) scale(1)',
          borderRadius: '8px',
          transition: commonTransition,
          zIndex: 100,
        }
      }
      if (mobileFocusPhase === 'prep') {
        return {
          ...fixedFrame,
          transform:
            `translate(${dx + mobileFocusDirection * window.innerWidth}px, ${dy}px) scale(${scale})`,
          borderRadius: `${4 / scale}px`,
          transition: 'none',
          zIndex: 100,
        }
      }
      return {
        ...fixedFrame,
        transform: centeredTransform,
        // Divide by scale so the visual corner is ~4px after the transform.
        borderRadius: `${4 / scale}px`,
        transition: commonTransition,
        zIndex: 100,
      }
    }

    if (phase === 'feed' || !originRect) return null

    const selfRect = originalRectRef.current

    if (isOrigin) {
      // Center of viewport minus origin card center in viewport coords
      const originCx = originRect.left + originRect.width / 2
      const originCy = originRect.top + originRect.height / 2
      const dx = window.innerWidth / 2 - originCx
      const dy = window.innerHeight / 2 - originCy
      const baseScale = originTargetWidth / originRect.width

      if (phase === 'exploding') {
        return {
          transform: `translate(${dx}px, ${dy}px) scale(1)`,
          transition: 'transform 0.5s cubic-bezier(0.5, 0, 0, 1)',
          zIndex: 100,
        }
      }
      if (phase === 'uncentering') {
        // Reverse of `centering`: scale back up to 1 while staying at center.
        return {
          transform: `translate(${dx}px, ${dy}px) scale(1)`,
          transition: 'transform 0.5s cubic-bezier(0.5, 0, 0, 1)',
          zIndex: 100,
        }
      }
      if (phase === 'unexploding') {
        // Reverse of `exploding`: translate back to original position.
        return {
          transform: 'translate(0px, 0px) scale(1)',
          transition: 'transform 0.5s cubic-bezier(0.5, 0, 0, 1)',
          zIndex: 100,
        }
      }
      // centering: animate in with base scale; coordinate: track R3F zoom
      const scale = phase === 'coordinate' ? baseScale * sceneZoom : baseScale
      return {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        transition:
          phase === 'centering'
            ? 'transform 0.5s cubic-bezier(0.5, 0, 0, 1)'
            : 'none',
        zIndex: 100,
      }
    }

    // Non-origin: fly away from origin center
    if (!selfRect) {
      // First render after trigger — hide; next render will place it
      return { opacity: 0, transition: 'none' }
    }
    const originCx = originRect.left + originRect.width / 2
    const originCy = originRect.top + originRect.height / 2
    const selfCx = selfRect.left + selfRect.width / 2
    const selfCy = selfRect.top + selfRect.height / 2
    let vx = selfCx - originCx
    let vy = selfCy - originCy
    const len = Math.hypot(vx, vy) || 1
    vx = (vx / len) * EXPLOSION_DISTANCE
    vy = (vy / len) * EXPLOSION_DISTANCE

    if (phase === 'unexploding') {
      // Reverse of `exploding`: translate back home, fade back in.
      return {
        transform: 'translate(0px, 0px)',
        opacity: 1,
        transition:
          'transform 0.5s cubic-bezier(0.5, 0, 0, 1), opacity 0.5s cubic-bezier(0.5, 0, 0, 1)',
        pointerEvents: 'none',
      }
    }

    return {
      transform: `translate(${vx}px, ${vy}px)`,
      opacity: 0,
      transition:
        'transform 0.5s cubic-bezier(0.5, 0, 0, 1), opacity 0.5s cubic-bezier(0.5, 0, 0, 1)',
      pointerEvents: 'none',
    }
  }, [
    phase,
    isOrigin,
    originRect,
    originTargetWidth,
    sceneZoom,
    isMobileFocusPrevious,
    isMobileFocused,
    mobileFocusRect,
    mobileFocusPhase,
    mobileFocusDirection,
    mobileFocusExiting,
  ])

  const shellStyle = useMemo(() => {
    if (phase !== 'feed' || !(isMobileFocused || isMobileFocusPrevious)) return undefined
    const focusRect = mobileFocusRect ?? originalRectRef.current
    if (!focusRect) return undefined
    return {
      height: `${focusRect.height}px`,
    }
  }, [phase, isMobileFocused, isMobileFocusPrevious, mobileFocusRect])

  const cardStyle = {
    ...(transitionStyle ?? {}),
    ...(isVideoSizedCard && videoAspectRatio
      ? { aspectRatio: String(videoAspectRatio) }
      : {}),
  }

  return (
    <div
      ref={rootRef}
      className="video-card-shell"
      data-grid-id={id}
      style={shellStyle}
    >
      <div
        ref={cardRef}
        className={`video-card ${isVideoSizedCard && videoAspectRatio ? 'video-card--video-sized' : ''} ${isOrigin ? 'video-card--origin' : ''} ${posterLoaded ? 'video-card--loaded' : ''} ${videoReady ? 'video-card--video-ready' : ''} ${isMobileFocused && !mobileFocusExiting ? 'video-card--mobile-focused' : ''} ${isMobileFocusPrevious ? 'video-card--mobile-focus-prev' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        style={Object.keys(cardStyle).length > 0 ? cardStyle : undefined}
      >
        <img
          className="video-card__poster"
          src={`/thumbnails/${id}.jpg`}
          alt=""
          onLoad={handlePosterLoad}
          onError={handlePosterLoad}
        />
        <mux-video
          ref={videoRef}
          playback-id={playbackId}
          muted
          loop
          playsinline=""
          preload={isMobile && mobileFocusActive && isMobileFocused ? 'auto' : 'metadata'}
        />
        <div className="video-card__info">
          <span className="video-card__name">{name}</span>
          <span className="video-card__date">{date}</span>
        </div>
      </div>
    </div>
  )
}
