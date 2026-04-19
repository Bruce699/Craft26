// Feed is structured as a 2D array: feedColumns[colIndex][rowIndex]
// Each item's id encodes its grid position as c{col}r{row} (1-indexed)
// so feedColumns[0][1] has id "c1r2" — ready for spatial labeling later.

// Mux delivers renditions at stream.mux.com/{PLAYBACK_ID}/{quality}.mp4
const MUX_PLAYBACK_ID = 'g59o3r8T005Q01GNj3Y00wXISpDM00FwVVPxi00Gx3EI1Qo4'
const src = `https://stream.mux.com/${MUX_PLAYBACK_ID}/medium.mp4`

export const feedColumns = [
  // Column 1
  [
    { id: 'c1r1', src },
    { id: 'c1r2', src },
    { id: 'c1r3', src },
    { id: 'c1r4', src },
  ],
  // Column 2
  [
    { id: 'c2r1', src },
    { id: 'c2r2', src },
    { id: 'c2r3', src },
    { id: 'c2r4', src },
  ],
  // Column 3
  [
    { id: 'c3r1', src },
    { id: 'c3r2', src },
    { id: 'c3r3', src },
    { id: 'c3r4', src },
  ],
]
