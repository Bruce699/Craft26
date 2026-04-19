import { useRef, useEffect } from 'react'
import './VideoCard.css'

// threshold: play when ≥30% of the video is visible in the viewport
const VISIBILITY_THRESHOLD = 0.3

export default function VideoCard({ id, src }) {
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
      // Two thresholds: just below and at the trigger point
      // so the callback fires as soon as the ratio crosses 0.3
      { threshold: [0, VISIBILITY_THRESHOLD, 1] },
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  return (
    // data-grid-id retained in the DOM for future spatial queries (e.g. [c1r2])
    <div className="video-card" data-grid-id={id}>
      <video
        ref={videoRef}
        src={src}
        muted
        loop
        playsInline
        preload="metadata"
      />
    </div>
  )
}
