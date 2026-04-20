import { useRef, useEffect, useState } from 'react'
import '@mux/mux-video'
import './VideoCard.css'

// threshold: play when ≥30% of the video is visible in the viewport
const VISIBILITY_THRESHOLD = 0.3

export default function VideoCard({ id, playbackId }) {
  const videoRef = useRef(null)
  const [isVisible, setIsVisible] = useState(false)

  // Observe visibility → flip state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Force-mute imperatively — React's `muted` prop on custom elements
    // isn't always reflected as the underlying media property
    video.muted = true
    video.volume = 0

    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.intersectionRatio >= VISIBILITY_THRESHOLD),
      { threshold: [0, VISIBILITY_THRESHOLD, 1] },
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  // Drive play/pause from state. Re-trying on canplay handles the case where
  // the first play() fires before HLS/metadata is ready, or where autoplay
  // was blocked until the user interacted with the page.
  useEffect(() => {
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
  }, [isVisible])

  return (
    <div className="video-card" data-grid-id={id}>
      <mux-video
        ref={videoRef}
        playback-id={playbackId}
        poster={`/thumbnails/${id}.jpg`}
        muted
        loop
        playsinline=""
        preload="metadata"
      />
    </div>
  )
}
