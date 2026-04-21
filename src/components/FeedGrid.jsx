import { useState, useEffect } from 'react'
import VideoCard from './VideoCard'
import { feedColumns, mobileFeedColumns } from '../data/feedData'
import './FeedGrid.css'

const H_PADDING = 16
const COL_GAP = 8
const NUM_COLS = 3
const TOP_OFFSET = 110

const MOBILE_BREAKPOINT = 480
const MOBILE_GAP = 4
const MOBILE_NUM_COLS = 2
const MOBILE_TOP_OFFSET = 116

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

  const isMobile = windowWidth <= MOBILE_BREAKPOINT
  const columns = isMobile ? mobileFeedColumns : feedColumns
  const gap = isMobile ? MOBILE_GAP : COL_GAP
  const hPadding = isMobile ? MOBILE_GAP : H_PADDING
  const topOffset = isMobile ? MOBILE_TOP_OFFSET : TOP_OFFSET
  const numCols = isMobile ? MOBILE_NUM_COLS : NUM_COLS

  const columnWidth = (windowWidth - 2 * hPadding - (numCols - 1) * gap) / numCols

  return (
    <div
      className={`feed-grid feed-grid--phase-${phase}`}
      style={{
        paddingTop: topOffset,
        paddingLeft: hPadding,
        paddingRight: hPadding,
        paddingBottom: 100,
      }}
    >
      <div className="feed-grid__columns" style={{ gap }}>
        {columns.map((column, colIndex) => (
          <div
            key={colIndex}
            className="feed-grid__column"
            style={{ width: columnWidth, gap }}
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
