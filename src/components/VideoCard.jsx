import { useRef, useEffect, useState, useMemo, useCallback } from 'react'
import '@mux/mux-video'
import './VideoCard.css'

const VISIBILITY_THRESHOLD = 0.3
const EXPLOSION_DISTANCE = 1600 // px to fly outward
const ENTRY_TRIGGER_DISTANCE = 40
const ENTRY_STAGGER_MS = 60

const MOBILE_FOCUS_SIDE_INSET = 4
const MOBILE_FOCUS_RADIUS = 12
const MOBILE_FOCUS_TRANSITION_MS = 340
const MOBILE_DRAG_FRICTION = 280
const MOBILE_DRAG_SCALE_DISTANCE = 260
const MOBILE_DRAG_EXIT_DISTANCE = 56
const FOCUS_BACKGROUND_SCALE = 0.92
const FOCUS_EASING = 'cubic-bezier(0.5, 0, 0, 1)'

const PNG_THUMBNAIL_NAME_OVERRIDES = {
  'Hike Your Todos - Widget': 'Hike Your Todos',
  'Superpower Referral Cards': 'Superpower Referral Card',
}

export default function VideoCard({
  id,
  entranceIndex = 0,
  animateEntry = true,
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
  desktopFocusActive = false,
  isDesktopFocused = false,
  desktopFocusRect = null,
  desktopFocusExiting = false,
  onDesktopFocus,
}) {
  const videoRef = useRef(null)
  const rootRef = useRef(null)
  const cardRef = useRef(null)
  const originalRectRef = useRef(null)
  const initiallyInViewportRef = useRef(false)
  const entranceTimerRef = useRef(0)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const dragMovedRef = useRef(false)
  const [isVisible, setIsVisible] = useState(false)
  const [posterLoaded, setPosterLoaded] = useState(false)
  const [entryState, setEntryState] = useState(animateEntry ? 'pending' : 'visible')
  const [entryOffset, setEntryOffset] = useState('100vh')
  const [mobileDrag, setMobileDrag] = useState({
    x: 0,
    y: 0,
    progress: 0,
    dragging: false,
  })
  const [videoReady, setVideoReady] = useState(false)
  const [videoAspectRatio, setVideoAspectRatio] = useState(null)
  const isVideoSizedCard = id === 'c3r1'

  const getMobileFocusTransform = (rect) => {
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = window.innerWidth / 2 - cx
    const dy = window.innerHeight / 2 - cy
    const targetWidth = window.innerWidth - MOBILE_FOCUS_SIDE_INSET * 2
    const scale = targetWidth / rect.width
    return { dx, dy, scale }
  }

  const resetMobileDrag = useCallback(() => {
    setMobileDrag({ x: 0, y: 0, progress: 0, dragging: false })
  }, [])

  const applyMobileDrag = useCallback((rawX, rawY, dragging) => {
    const distance = Math.hypot(rawX, rawY)
    const frictionScale = 1 / (1 + distance / MOBILE_DRAG_FRICTION)
    const x = rawX * frictionScale
    const y = rawY * frictionScale
    const easedDistance = Math.hypot(x, y)
    const progress = Math.min(easedDistance / MOBILE_DRAG_SCALE_DISTANCE, 1)

    setMobileDrag({ x, y, progress, dragging })
  }, [])

  useEffect(() => {
    if (!isMobile || !isMobileFocused || mobileFocusExiting) return
    const overlayStrength = 1 - mobileDrag.progress
    document.documentElement.style.setProperty(
      '--mobile-focus-overlay-opacity',
      String(0.85 * overlayStrength),
    )
    document.documentElement.style.setProperty(
      '--mobile-focus-overlay-blur',
      `${24 * overlayStrength}px`,
    )
    document.documentElement.style.setProperty(
      '--mobile-focus-overlay-transition',
      mobileDrag.dragging
        ? 'none'
        : 'background 0.34s cubic-bezier(0.5, 0, 0, 1), backdrop-filter 0.34s cubic-bezier(0.5, 0, 0, 1)',
    )
    document.documentElement.style.setProperty(
      '--mobile-focus-label-opacity',
      mobileDrag.dragging || mobileDrag.progress > 0 ? '0' : '1',
    )
    document.documentElement.style.setProperty(
      '--mobile-focus-label-blur',
      mobileDrag.dragging || mobileDrag.progress > 0 ? '8px' : '0px',
    )

    return () => {
      document.documentElement.style.removeProperty('--mobile-focus-overlay-opacity')
      document.documentElement.style.removeProperty('--mobile-focus-overlay-blur')
      document.documentElement.style.removeProperty('--mobile-focus-overlay-transition')
      document.documentElement.style.removeProperty('--mobile-focus-label-opacity')
      document.documentElement.style.removeProperty('--mobile-focus-label-blur')
    }
  }, [isMobile, isMobileFocused, mobileFocusExiting, mobileDrag.dragging, mobileDrag.progress])

  useEffect(() => {
    if (isMobileFocused && !mobileFocusExiting) return
    resetMobileDrag()
    dragMovedRef.current = false
  }, [isMobileFocused, mobileFocusExiting, resetMobileDrag])

  // Reveal the card (fade + slight upward motion) only after the poster img
  // below has actually rendered. Double rAF guarantees the hidden initial
  // state is painted once before the class flip, so cached posters don't
  // "pop in" without a transition.
  const handlePosterLoad = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPosterLoaded(true))
    })
  }

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    initiallyInViewportRef.current =
      rect.top < window.innerHeight + ENTRY_TRIGGER_DISTANCE && rect.bottom > 0
  }, [])

  useEffect(() => {
    if (phase !== 'feed' || !posterLoaded || entryState !== 'pending') return
    const el = rootRef.current
    if (!el) return

    const startEntry = () => {
      if (entryState !== 'pending') return
      const rect = el.getBoundingClientRect()
      const offset = initiallyInViewportRef.current
        ? 150
        : Math.max(window.innerHeight + rect.height - rect.top, rect.height)
      const delay = entranceIndex * ENTRY_STAGGER_MS

      setEntryOffset(`${offset}px`)
      entranceTimerRef.current = window.setTimeout(() => {
        requestAnimationFrame(() => setEntryState('visible'))
      }, delay)
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (
          entry.isIntersecting ||
          entry.boundingClientRect.top <= window.innerHeight + ENTRY_TRIGGER_DISTANCE
        ) {
          observer.disconnect()
          startEntry()
        }
      },
      { root: null, rootMargin: `0px 0px ${ENTRY_TRIGGER_DISTANCE}px`, threshold: 0 },
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
      window.clearTimeout(entranceTimerRef.current)
    }
  }, [phase, posterLoaded, entryState, entranceIndex])

  // Snapshot the card's viewport rect while it's still in normal feed layout.
  // Once transforms kick in, getBoundingClientRect would return the *moved*
  // position, so we stop updating the snapshot once we leave the feed phase.
  useEffect(() => {
    const snapshotTarget = cardRef.current ?? rootRef.current
    if (phase === 'feed' && !mobileFocusActive && !desktopFocusActive && snapshotTarget) {
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

    setVideoReady(!video.paused && video.readyState >= 2)
    syncAspectRatio()

    video.addEventListener('playing', markReady)
    video.addEventListener('timeupdate', markReady)
    video.addEventListener('loadedmetadata', syncAspectRatio)
    video.addEventListener('resize', syncAspectRatio)
    video.addEventListener('emptied', resetReady)

    return () => {
      video.removeEventListener('playing', markReady)
      video.removeEventListener('timeupdate', markReady)
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
    // Focus mode owns clicks — exit via the overlay, not the easter egg.
    if (desktopFocusActive) return
    if (!onDoubleClick) return
    // Allow double-click in feed (to enter) OR on the origin card while in
    // the coordinate phase (to reverse back out).
    if (phase !== 'feed' && !(phase === 'coordinate' && isOrigin)) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    onDoubleClick(id, rect)
  }

  const handleClick = () => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false
      return
    }
    if (phase !== 'feed') return
    if (isMobile) {
      if (isMobileFocused) return
      if (!onMobileFocus) return
      const rect = cardRef.current?.getBoundingClientRect()
      if (!rect) return
      onMobileFocus(id, rect, name, date)
      return
    }
    if (isDesktopFocused || desktopFocusActive) return
    if (!onDesktopFocus) return
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    onDesktopFocus(id, rect, name, date)
  }

  const handlePointerDown = (event) => {
    if (!isMobile || !isMobileFocused || mobileFocusExiting || mobileFocusPhase !== 'idle') return
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    }
    dragMovedRef.current = false
    setMobileDrag((drag) => ({ ...drag, dragging: true }))
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  const handlePointerMove = (event) => {
    if (!mobileDrag.dragging) return
    const rawX = event.clientX - dragStartRef.current.x
    const rawY = event.clientY - dragStartRef.current.y
    if (Math.hypot(rawX, rawY) > 4) dragMovedRef.current = true
    applyMobileDrag(rawX, rawY, true)
  }

  const handlePointerEnd = (event) => {
    if (!mobileDrag.dragging) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const distance = Math.hypot(mobileDrag.x, mobileDrag.y)
    if (distance >= MOBILE_DRAG_EXIT_DISTANCE) {
      resetMobileDrag()
      dragMovedRef.current = false
      onExitMobileFocus?.()
      return
    }
    resetMobileDrag()
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
    // Desktop focus — click zooms the card to 80% of viewport height,
    // centered, above the blur overlay (z-index 90 < 100).
    if (phase === 'feed' && isDesktopFocused) {
      const focusRect = desktopFocusRect ?? originalRectRef.current
      if (focusRect) {
        const cx = focusRect.left + focusRect.width / 2
        const cy = focusRect.top + focusRect.height / 2
        const dx = window.innerWidth / 2 - cx
        const dy = window.innerHeight / 2 - cy
        // 80% of window height, but never wider than 90% of the window.
        const scale = Math.min(
          (window.innerHeight * 0.8) / focusRect.height,
          (window.innerWidth * 0.9) / focusRect.width,
        )
        const fixedFrame = {
          position: 'fixed',
          top: `${focusRect.top}px`,
          left: `${focusRect.left}px`,
          width: `${focusRect.width}px`,
          height: `${focusRect.height}px`,
        }
        if (desktopFocusExiting) {
          return {
            ...fixedFrame,
            transform: 'translate(0px, 0px) scale(1)',
            borderRadius: '12px',
            transition:
              'transform 0.45s cubic-bezier(0.5, 0, 0, 1), border-radius 0.45s cubic-bezier(0.5, 0, 0, 1)',
            zIndex: 100,
          }
        }
        return {
          ...fixedFrame,
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          // Divide by scale so the visual corner stays ~12px when scaled.
          borderRadius: `${12 / scale}px`,
          transition:
            'transform 0.5s cubic-bezier(0.5, 0, 0, 1), border-radius 0.5s cubic-bezier(0.5, 0, 0, 1)',
          zIndex: 100,
        }
      }
    }

    // Mobile focus overlay — takes precedence over feed phase.
    if (phase === 'feed' && (isMobileFocused || isMobileFocusPrevious)) {
      const focusRect = mobileFocusRect ?? originalRectRef.current
      if (!focusRect) return null
      const { dx, dy, scale } = getMobileFocusTransform(focusRect)
      const commonTransition =
        `transform ${MOBILE_FOCUS_TRANSITION_MS}ms cubic-bezier(0.5, 0, 0, 1), border-radius ${MOBILE_FOCUS_TRANSITION_MS}ms cubic-bezier(0.5, 0, 0, 1)`
      const dragTransition = mobileDrag.dragging ? 'none' : commonTransition
      const activeScale = isMobileFocused
        ? 1 + (scale - 1) * (1 - mobileDrag.progress)
        : scale
      const activeDx = dx + (isMobileFocused ? mobileDrag.x : 0)
      const activeDy = dy + (isMobileFocused ? mobileDrag.y : 0)
      const centeredTransform = `translate(${activeDx}px, ${activeDy}px) scale(${activeScale})`
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
          borderRadius: `${MOBILE_FOCUS_RADIUS / scale}px`,
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
          borderRadius: `${MOBILE_FOCUS_RADIUS / scale}px`,
          transition: 'none',
          zIndex: 100,
        }
      }
      return {
        ...fixedFrame,
        transform: centeredTransform,
        // Divide by scale so the visual corner remains stable after transform scaling.
        borderRadius: `${MOBILE_FOCUS_RADIUS / activeScale}px`,
        transition: dragTransition,
        zIndex: 100,
        touchAction: 'none',
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
    mobileDrag,
    isDesktopFocused,
    desktopFocusRect,
    desktopFocusExiting,
  ])

  const shellStyle = useMemo(() => {
    if (phase !== 'feed') return undefined
    const isFocusedShell =
      isMobileFocused || isMobileFocusPrevious || isDesktopFocused
    const focusRect = originalRectRef.current

    if (isFocusedShell) {
      const selectedRect =
        (isDesktopFocused ? desktopFocusRect : mobileFocusRect) ?? focusRect
      return selectedRect ? { height: `${selectedRect.height}px` } : undefined
    }

    if (!desktopFocusActive) return undefined
    if (!focusRect) return undefined

    const duration = desktopFocusExiting ? 450 : 500
    const scale = desktopFocusExiting ? 1 : FOCUS_BACKGROUND_SCALE
    const distanceToViewportCenterX = window.innerWidth / 2 - focusRect.left
    const distanceToViewportCenterY = window.innerHeight / 2 - focusRect.top
    const shiftX = distanceToViewportCenterX * (1 - scale)
    const shiftY = distanceToViewportCenterY * (1 - scale)

    return {
      transform: `translate(${shiftX}px, ${shiftY}px) scale(${scale})`,
      transformOrigin: 'top left',
      transition: `transform ${duration}ms ${FOCUS_EASING}`,
      willChange: 'transform',
    }
  }, [
    phase,
    isMobileFocused,
    isMobileFocusPrevious,
    mobileFocusRect,
    isDesktopFocused,
    desktopFocusRect,
    desktopFocusActive,
    desktopFocusExiting,
  ])

  const cardStyle = {
    '--entry-offset': entryOffset,
    ...(transitionStyle ?? {}),
    ...(isVideoSizedCard && videoAspectRatio
      ? { aspectRatio: String(videoAspectRatio) }
      : {}),
  }
  const posterName = PNG_THUMBNAIL_NAME_OVERRIDES[name] ?? name

  return (
    <div
      ref={rootRef}
      className="video-card-shell"
      data-grid-id={id}
      style={shellStyle}
    >
      <div
        ref={cardRef}
        className={`video-card ${isVideoSizedCard && videoAspectRatio ? 'video-card--video-sized' : ''} ${isOrigin ? 'video-card--origin' : ''} ${posterLoaded ? 'video-card--loaded' : ''} ${entryState === 'visible' ? 'video-card--entry-visible' : ''} ${videoReady ? 'video-card--video-ready' : ''} ${isMobileFocused && !mobileFocusExiting ? 'video-card--mobile-focused' : ''} ${isMobileFocusPrevious ? 'video-card--mobile-focus-prev' : ''} ${isDesktopFocused ? 'video-card--desktop-focused' : ''} ${isDesktopFocused && desktopFocusExiting ? 'video-card--desktop-focus-exiting' : ''}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={Object.keys(cardStyle).length > 0 ? cardStyle : undefined}
      >
        <img
          className="video-card__poster"
          src={`/thumbnails/png/${encodeURIComponent(posterName)}.png`}
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
