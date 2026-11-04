import { feedColumns } from '../data/feedData'

// Read across each visible Craft row, retaining its single source of content.
export const playlist = Array.from(
  { length: Math.max(...feedColumns.map((column) => column.length)) },
  (_, row) => feedColumns.flatMap((column) => column[row] ? [column[row]] : []),
).flat()
