import { useMemo } from 'react'
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

// Deterministic PRNG so random x/y are stable across renders
function hashToUnit(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

const X_RANGE = 600   // pixels: random spread on Build Time axis
const Y_RANGE = 600   // pixels: random spread on Procedural axis
const Z_PX_PER_MONTH = 40 // pixels per month on Date axis

// Canonical 3D position for every item. These are absolute —
// the coordinate view subtracts the origin item's values at render time.
export function useCoordinatePoints() {
  return useMemo(() => {
    const items = feedColumns.flat()
    const earliest = Math.min(...items.map((i) => parseMonthYear(i.date)))

    return items.map((item) => {
      const rx = hashToUnit(item.id + ':x') * 2 - 1
      const ry = hashToUnit(item.id + ':y') * 2 - 1
      return {
        id: item.id,
        name: item.name,
        date: item.date,
        // Canonical values — keep independent of which item is the origin
        x: rx * X_RANGE,
        y: ry * Y_RANGE,
        z: (parseMonthYear(item.date) - earliest) * Z_PX_PER_MONTH,
      }
    })
  }, [])
}
