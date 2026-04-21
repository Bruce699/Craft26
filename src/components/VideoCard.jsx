import { useRef, useEffect, useState, useMemo } from 'react'
import '@mux/mux-video'
import './VideoCard.css'

const VISIBILITY_THRESHOLD = 0.3
const EXPLOSION_DISTANCE = 1600 // px to fly outward

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
}) {
  const videoRef = useRef(null)
  const rootRef = useRef(null)
  const originalRectRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

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
    if (!onDoubleClick) return
    // Allow double-click in feed (to enter) OR on the origin card while in
    // the coordinate phase (to reverse back out).
    if (phase !== 'feed' && !(phase === 'coordinate' && isOrigin)) return
    const rect = rootRef.current?.getBoundingClientRect()
    if (!rect) return
    onDoubleClick(id, rect)
  }

  // Compute the transform for this card based on phase + origin rect.
  // For non-origin cards: fly outward from origin center and fade.
  // For the origin card: translate to viewport center, then scale down.
  const transitionStyle = useMemo(() => {
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
  }, [phase, isOrigin, originRect, originTargetWidth, sceneZoom])

  return (
    <div
      ref={rootRef}
      className={`video-card ${isOrigin ? 'video-card--origin' : ''}`}
      data-grid-id={id}
      onDoubleClick={handleDoubleClick}
      style={transitionStyle ?? undefined}
    >
      <mux-video
        ref={videoRef}
        playback-id={playbackId}
        poster={`/thumbnails/${id}.jpg`}
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
