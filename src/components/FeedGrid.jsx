import { useState, useEffect } from 'react'
import VideoCard from './VideoCard'
import { feedColumns } from '../data/feedData'
import './FeedGrid.css'

const H_PADDING = 16  // left + right edge padding (px)
const COL_GAP = 8     // gap between columns (px)
const NUM_COLS = 3
const TOP_OFFSET = 110 // distance from top of page (px)

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return width
}

export default function FeedGrid() {
  const windowWidth = useWindowWidth()

  // columnWidth = (windowWidth - 2×padding - 2×gap) / 3
  const columnWidth =
    (windowWidth - 2 * H_PADDING - (NUM_COLS - 1) * COL_GAP) / NUM_COLS

  return (
    <div
      className="feed-grid"
      style={{
        paddingTop: TOP_OFFSET,
        paddingLeft: H_PADDING,
        paddingRight: H_PADDING,
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
              <VideoCard key={item.id} id={item.id} playbackId={item.playbackId} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
