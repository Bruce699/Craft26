import { useState, useEffect } from 'react'
import VideoCard from './VideoCard'
import { feedColumns, mobileFeedColumns } from '../data/feedData'
import './FeedGrid.css'

const DEFAULT_H_PADDING = 48
const DEFAULT_COL_GAP = 12
const NUM_COLS = 3
const DEFAULT_TOP_OFFSET = 150
const DESKTOP_ENTRY_ROWS = 3

const MOBILE_BREAKPOINT = 480
const MOBILE_GAP = 4
const MOBILE_NUM_COLS = 2
const MOBILE_TOP_OFFSET = 116
const MOBILE_ENTRY_ROWS = 5

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
  mobileFocus = null,
  onMobileFocus,
  onExitMobileFocus,
  desktopFocus = null,
  onDesktopFocus,
}) {
  const windowWidth = useWindowWidth(phase === 'feed')

  const [gridOverrides, setGridOverrides] = useState({})

  useEffect(() => {
    const handler = (e) => setGridOverrides(e.detail)
    window.addEventListener('dp-grid-update', handler)
    return () => window.removeEventListener('dp-grid-update', handler)
  }, [])

  const isMobile = windowWidth <= MOBILE_BREAKPOINT
  const columns = isMobile ? mobileFeedColumns : feedColumns
  const numCols = isMobile ? MOBILE_NUM_COLS : NUM_COLS

  const gap = isMobile ? MOBILE_GAP : (gridOverrides.gap ?? DEFAULT_COL_GAP)
  const hPadding = isMobile ? MOBILE_GAP : (gridOverrides.padding ?? DEFAULT_H_PADDING)
  const topOffset = isMobile ? MOBILE_TOP_OFFSET : (gridOverrides.topOffset ?? DEFAULT_TOP_OFFSET)

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
            {column.map((item, rowIndex) => (
              <VideoCard
                key={item.id}
                id={item.id}
                entranceIndex={rowIndex * numCols + colIndex}
                animateEntry={
                  rowIndex < (isMobile ? MOBILE_ENTRY_ROWS : DESKTOP_ENTRY_ROWS)
                }
                playbackId={item.playbackId}
                name={item.name}
                date={item.date}
                phase={phase}
                isOrigin={originId === item.id}
                originRect={originRect}
                originTargetWidth={originTargetWidth}
                sceneZoom={sceneZoom}
                onDoubleClick={onItemDoubleClick}
                isMobile={isMobile}
                mobileFocusActive={!!mobileFocus && !mobileFocus.exiting}
                isMobileFocused={mobileFocus?.id === item.id}
                isMobileFocusPrevious={mobileFocus?.previousId === item.id}
                mobileFocusRect={mobileFocus?.id === item.id ? mobileFocus.rect : null}
                mobileFocusScrollY={mobileFocus?.scrollY ?? null}
                mobileFocusPhase={mobileFocus?.phase ?? null}
                mobileFocusDirection={mobileFocus?.direction ?? 0}
                mobileFocusExiting={mobileFocus?.exiting === true}
                onMobileFocus={onMobileFocus}
                onExitMobileFocus={onExitMobileFocus}
                desktopFocusActive={!!desktopFocus}
                isDesktopFocused={desktopFocus?.id === item.id}
                desktopFocusRect={desktopFocus?.id === item.id ? desktopFocus.rect : null}
                desktopFocusExiting={desktopFocus?.exiting === true}
                onDesktopFocus={onDesktopFocus}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
