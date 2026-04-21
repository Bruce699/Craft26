import { useRef, useEffect, useState, useMemo } from 'react'
import '@mux/mux-video'
import './VideoCard.css'

const VISIBILITY_THRESHOLD = 0.3
const EXPLOSION_DISTANCE = 1600 // px to fly outward

const MOBILE_FOCUS_GAP = 4
const MOBILE_SWIPE_THRESHOLD = 30

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
  isMobileFocused = false,
  mobileFocusRect = null,
  mobileFocusExiting = false,
  onMobileFocus,
  onExitMobileFocus,
}) {
  const videoRef = useRef(null)
  const rootRef = useRef(null)
  const originalRectRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)
  const [posterLoaded, setPosterLoaded] = useState(false)

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
    if (phase === 'feed' && rootRef.current) {
      originalRectRef.current = rootRef.current.getBoundingClientRect()
    }
  })

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
      if (cancelled || !isVisible) return
      const p = video.play()
      if (p && typeof p.catch === 'function') p.catch(() => {})
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
  }, [isVisible, phase])

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
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    onMobileFocus(id, rect)
  }

  // When focused on mobile: any click outside exits; any swipe on the card exits.
  useEffect(() => {
    if (!isMobileFocused || mobileFocusExiting) return
    const el = rootRef.current
    if (!el) return

    const onDocClick = (e) => {
      if (!el.contains(e.target)) onExitMobileFocus?.()
    }
    // Defer so the tap that opened focus doesn't immediately close it.
    const rafId = requestAnimationFrame(() => {
      document.addEventListener('click', onDocClick, true)
      document.addEventListener('touchstart', onDocClick, { capture: true, passive: true })
    })

    let startX = 0
    let startY = 0
    let swiped = false
    const onTouchStart = (e) => {
      swiped = false
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
    }
    const onTouchMove = (e) => {
      if (swiped) return
      const t = e.touches[0]
      if (
        Math.hypot(t.clientX - startX, t.clientY - startY) > MOBILE_SWIPE_THRESHOLD
      ) {
        swiped = true
        onExitMobileFocus?.()
      }
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })

    return () => {
      cancelAnimationFrame(rafId)
      document.removeEventListener('click', onDocClick, true)
      document.removeEventListener('touchstart', onDocClick, { capture: true })
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [isMobileFocused, mobileFocusExiting, onExitMobileFocus])

  // Compute the transform for this card based on phase + origin rect.
  // For non-origin cards: fly outward from origin center and fade.
  // For the origin card: translate to viewport center, then scale down.
  const transitionStyle = useMemo(() => {
    // Mobile focus overlay — takes precedence over feed phase.
    if (isMobileFocused && mobileFocusRect) {
      const r = mobileFocusRect
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = window.innerWidth / 2 - cx
      const dy = window.innerHeight / 2 - cy
      const targetWidth = window.innerWidth - MOBILE_FOCUS_GAP * 2
      const scale = targetWidth / r.width
      const commonTransition =
        'transform 0.3s cubic-bezier(0.5, 0, 0, 1), border-radius 0.3s cubic-bezier(0.5, 0, 0, 1)'
      if (mobileFocusExiting) {
        return {
          transform: 'translate(0px, 0px) scale(1)',
          borderRadius: '8px',
          transition: commonTransition,
          zIndex: 100,
        }
      }
      return {
        transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
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
    isMobileFocused,
    mobileFocusRect,
    mobileFocusExiting,
  ])

  return (
    <div
      ref={rootRef}
      className={`video-card ${isOrigin ? 'video-card--origin' : ''} ${posterLoaded ? 'video-card--loaded' : ''} ${isMobileFocused && !mobileFocusExiting ? 'video-card--mobile-focused' : ''}`}
      data-grid-id={id}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      style={transitionStyle ?? undefined}
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
        preload="metadata"
      />
      <div className="video-card__info">
        <span className="video-card__name">{name}</span>
        <span className="video-card__date">{date}</span>
      </div>
    </div>
  )
}
