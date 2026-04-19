// Feed is structured as a 2D array: feedColumns[colIndex][rowIndex]
// Each item's id encodes its grid position as c{col}r{row} (1-indexed)
// so feedColumns[0][1] has id "c1r2" — ready for spatial labeling later.

const playbackId = 'g59o3r8T005Q01GNj3Y00wXISpDM00FwVVPxi00Gx3EI1Qo4'

export const feedColumns = [
  // Column 1
  [
    { id: 'c1r1', playbackId },
    { id: 'c1r2', playbackId },
    { id: 'c1r3', playbackId },
    { id: 'c1r4', playbackId },
  ],
  // Column 2
  [
    { id: 'c2r1', playbackId },
    { id: 'c2r2', playbackId },
    { id: 'c2r3', playbackId },
    { id: 'c2r4', playbackId },
  ],
  // Column 3
  [
    { id: 'c3r1', playbackId },
    { id: 'c3r2', playbackId },
    { id: 'c3r3', playbackId },
    { id: 'c3r4', playbackId },
  ],
]
