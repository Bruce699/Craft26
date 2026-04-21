import { useEffect, useMemo, useState } from 'react'
import { feedColumns } from '../data/feedData'

// Parse "April 2026" -> absolute month index (year * 12 + monthIndex)
function parseMonthYear(str) {
  const months = {
    January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
    July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
  }
  const [month, year] = str.split(' ')
  return Number(year) * 12 + (months[month] ?? 0)
}

// Actual coordinate values per item:
//   x = Build Time in hours
//   y = Procedural index (1 = keyframed .. 7 = procedural)
const ITEM_COORDS = {
  c1r1: { x: 2,    y: 4 },
  c1r2: { x: 0.5,  y: 6 },
  c1r3: { x: 1,    y: 2 },
  c1r4: { x: 3,    y: 4 },
  c1r5: { x: 0.5,  y: 1 },
  c1r6: { x: 2,    y: 1 },
  c1r7: { x: 1,    y: 1 },
  c1r8: { x: 17,   y: 7 },
  c1r9: { x: 0.3,  y: 1 },
  c2r1: { x: 4,    y: 6 },
  c2r2: { x: 22,   y: 3 },
  c2r3: { x: 3,    y: 1 },
  c2r4: { x: 0.5,  y: 5 },
  c2r5: { x: 0.6,  y: 1 },
  c2r6: { x: 18,   y: 3 },
  c2r7: { x: 0.5,  y: 4 },
  c2r8: { x: 4,    y: 1 },
  c2r9: { x: 20,   y: 7 },
  c3r1: { x: 60,   y: 4 },
  c3r2: { x: 8,    y: 1 },
  c3r3: { x: 6,    y: 6 },
  c3r4: { x: 0.8,  y: 1 },
  c3r5: { x: 2,    y: 3 },
  c3r6: { x: 3,    y: 1 },
  c3r7: { x: 2,    y: 1 },
  c3r8: { x: 4,    y: 1 },
  c3r9: { x: 0.3,  y: 1 },
}

// Unique time-spent levels across all items, sorted ascending.
// Items are placed at discrete slots so visual gaps are equal regardless
// of absolute hour values (prevents 60hr outlier from squashing the rest).
const X_LEVELS = [0.3, 0.5, 0.6, 0.8, 1, 2, 3, 4, 6, 8, 17, 18, 20, 22, 60]
const X_LEVEL_INDEX = new Map(X_LEVELS.map((v, i) => [v, i]))
const X_LEVEL_SPAN = X_LEVELS.length - 1 // slots between first and last

// Far left (level 0) and far right (last level) should together occupy
// 85% of window width. Same ratio applies to the Z (date) axis span.
const X_WIDTH_RATIO = 0.85
const Z_WIDTH_RATIO = 0.85

// Y range (procedural index 1..7) should occupy 80% of window height.
const Y_HEIGHT_RATIO = 0.8
const Y_MIN_INDEX = 1
const Y_MAX_INDEX = 7
const Y_INDEX_SPAN = Y_MAX_INDEX - Y_MIN_INDEX

// Canonical 3D position for every item. These are absolute —
// the coordinate view subtracts the origin item's values at render time.
export function useCoordinatePoints() {
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }))
  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return useMemo(() => {
    const items = feedColumns.flat()
    const months = items.map((i) => parseMonthYear(i.date))
    const earliest = Math.min(...months)
    const latest = Math.max(...months)
    const monthSpan = Math.max(1, latest - earliest)

    const xPxPerLevel = (viewport.w * X_WIDTH_RATIO) / X_LEVEL_SPAN
    const zPxPerMonth = (viewport.w * Z_WIDTH_RATIO) / monthSpan
    const yPxPerStep = (viewport.h * Y_HEIGHT_RATIO) / Y_INDEX_SPAN

    return items.map((item) => {
      const coord = ITEM_COORDS[item.id] ?? { x: 0, y: 0 }
      const xLevel = X_LEVEL_INDEX.get(coord.x) ?? 0
      return {
        id: item.id,
        name: item.name,
        date: item.date,
        x: xLevel * xPxPerLevel,
        y: (coord.y - Y_MIN_INDEX) * yPxPerStep,
        z: (parseMonthYear(item.date) - earliest) * zPxPerMonth,
      }
    })
  }, [viewport.w, viewport.h])
}
