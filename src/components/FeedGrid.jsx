import { useState, useEffect } from 'react'
import VideoCard from './VideoCard'
import { feedColumns } from '../data/feedData'
import './FeedGrid.css'

const H_PADDING = 16
const COL_GAP = 8
const NUM_COLS = 3
const TOP_OFFSET = 110

function useWindowWidth(enabled) {
  const [width, setWidth] = useState(() => document.documentElement.clientWidth)

  useEffect(() => {
    if (!enabled) return
    const onResize = () => setWidth(document.documentElement.clientWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [enabled])

  return width
}

export default function FeedGrid({
  phase = 'feed',
  originId = null,
  originRect = null,
  originTargetWidth = 0,
  sceneZoom = 1,
  onItemDoubleClick,
}) {
  const windowWidth = useWindowWidth(phase === 'feed')

  const columnWidth =
    (windowWidth - 2 * H_PADDING - (NUM_COLS - 1) * COL_GAP) / NUM_COLS

  return (
    <div
      className={`feed-grid feed-grid--phase-${phase}`}
      style={{
        paddingTop: TOP_OFFSET,
        paddingLeft: H_PADDING,
        paddingRight: H_PADDING,
        paddingBottom: 100,
      }}
    >
      <div className="feed-grid__columns" style={{ gap: COL_GAP }}>
        {feedColumns.map((column, colIndex) => (
          <div
            key={colIndex}
            className="feed-grid__column"
            style={{ width: columnWidth, gap: COL_GAP }}
          >
            {column.map((item) => (
              <VideoCard
                key={item.id}
                id={item.id}
                playbackId={item.playbackId}
                name={item.name}
                date={item.date}
                phase={phase}
                isOrigin={originId === item.id}
                originRect={originRect}
                originTargetWidth={originTargetWidth}
                sceneZoom={sceneZoom}
                onDoubleClick={onItemDoubleClick}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
