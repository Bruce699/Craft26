import { useRef, useEffect } from 'react'
import '@mux/mux-video'
import './VideoCard.css'

// threshold: play when ≥30% of the video is visible in the viewport
const VISIBILITY_THRESHOLD = 0.3

export default function VideoCard({ id, playbackId }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
          video.play().catch(() => {
            // Autoplay blocked by browser policy — silently ignore
          })
        } else {
          video.pause()
        }
      },
      { threshold: [0, VISIBILITY_THRESHOLD, 1] },
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  return (
    // data-grid-id retained in the DOM for future spatial queries (e.g. [c1r2])
    <div className="video-card" data-grid-id={id}>
      <mux-video
        ref={videoRef}
        playback-id={playbackId}
        muted
        loop
        playsinline=""
        preload="metadata"
      />
    </div>
  )
}
