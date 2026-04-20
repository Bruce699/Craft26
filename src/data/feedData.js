// Feed is structured as a 2D array: feedColumns[colIndex][rowIndex]
// Each item's id encodes its grid position as c{col}r{row} (1-indexed)
// so feedColumns[0][1] has id "c1r2" — ready for spatial labeling later.

export const feedColumns = [
  // Column 1
  [
    { id: 'c1r1', playbackId: 'Blbhj8GsinBk01vt9Afs4Q1g9xbSwrsLkQoFTIUohBDE', name: 'Cursor-Follow Lamp', date: 'November 2025' },
    { id: 'c1r2', playbackId: 'CUu6M78DlOsa6QartKzyLiovgQVBhPWT2utVWB4S602I', name: 'Strings Todo', date: 'April 2026' },
    { id: 'c1r3', playbackId: 'vGHsk01Ymm8901Z8c9IFbVrlU00R637eK6NX00nDNWZEpeQ', name: 'Growing Pattern', date: 'April 2026' },
    { id: 'c1r4', playbackId: 'ELlGYEvzC4fyj02nuHDL02VnghBSXT71vdO4blWr4r7Sg', name: 'Cards for Onboarding', date: 'March 2026' },
    { id: 'c1r5', playbackId: 'jR01HgIlum91aQlmQLeTu9b02V9YsIKRfHJMBrVWoMSoM', name: 'Info Card Generation', date: 'October 2025' },
    { id: 'c1r6', playbackId: 'kUW1DHzuaQMcegeJI9sHXlGXxU00DxZH00YjaYsUFMOqg', name: 'Conceptual UI', date: 'January 2026' },
    { id: 'c1r7', playbackId: 'g59o3r8T005Q01GNj3Y00wXISpDM00FwVVPxi00Gx3EI1Qo4', name: 'AI Brush', date: 'October 2025' },
    { id: 'c1r8', playbackId: 'Mc47Cwar3gkxxixSkaWVvREWtzMpa89u6N02KNOal02wc', name: 'Generative Maze in VR', date: 'February 2025' },
    { id: 'c1r9', playbackId: 'DizwOF9yw00s1YnBxHfnvebryIH00amrlX7YTlCsOrbJM', name: 'Media Preset', date: 'September 2025' },
  ],
  // Column 2
  [
    { id: 'c2r1', playbackId: 'g6EJ015Yax00Kl70202LZdK014r4bSdm1SWTvmZzQTeMIHyU', name: 'Hike Your Todos', date: 'April 2026' },
    { id: 'c2r2', playbackId: '2BPUc02BHPCilYGFASb6QuU4E9F02wiMefxaFBENtixcc', name: 'Self-disciplined Agent', date: 'February 2026' },
    { id: 'c2r3', playbackId: 'YjDjAU7P3KanZw2kA5pAF02IaQuxYiHierePucxTJsHU', name: 'Contextual Search', date: 'September 2025' },
    { id: 'c2r4', playbackId: 'lkOFeA9rDgNGQdyzB77FWIftopmsbhKO00SOcLAnsP00c', name: 'Card Swipe Interaction', date: 'March 2026' },
    { id: 'c2r5', playbackId: 'jIrloIxCi1ToIGx4u9Yc7Zp1RjgzXba1mwnIJKDsNoc', name: 'Follow-up Thread', date: 'September 2026' },
    { id: 'c2r6', playbackId: 'Wb2vxWaCFy6SYXzVW2rbe1bKSW00WgRqjj7wpjFysVOU', name: 'Poker Loading', date: 'August 2026' },
    { id: 'c2r7', playbackId: '3JOGAkFHWi02xCaKKOK3LpeIDhvqIaMr8yYgrINmZakI', name: 'Bookmark Info Cards', date: 'September 2026' },
    { id: 'c2r8', playbackId: 'FA1OaJpIvpOcx1Q8y9apfRi8wDU011c302fk8XU6aParA', name: 'iOS Exit', date: 'August 2026' },
    { id: 'c2r9', playbackId: '01nPlGYjmGSakKAoHKgv5uxzD018RRfJGhCXjk9jMwmSo', name: 'Gaze Tracking in VR', date: 'March 2025' },
  ],
  // Column 3
  [
    { id: 'c3r1', playbackId: 'HhLOV02iqHFt5Mp02Gm00C8FvAMZzh02Cc602kVxki22Q8PA', name: 'Live Motion Panel', date: 'November 2025' },
    { id: 'c3r2', playbackId: '3c1s0200p700trXkIv1qb01dXi3diIsIkQ5m5pddujR2Sq8', name: 'Battle Bar', date: 'October 2025' },
    { id: 'c3r3', playbackId: 'EvNW2VazFMZ015FETD7wBt01mM01WPsZz0202gjhGPp57w8E', name: 'Undo Todo', date: 'April 2026' },
    { id: 'c3r4', playbackId: 'NfIYIz6654qEulVeyvGoIIXM2mj00zdJRvuy3phD015a8', name: 'Subcanvas', date: 'December 2025' },
    { id: 'c3r5', playbackId: 'lD49gZ0262HUDDAmnMsdXMp95KFycobVzobvcV007V2fU', name: 'Branded Animation', date: 'January 2026' },
    { id: 'c3r6', playbackId: '8oFkLXCFhx02cLJ2YoSN3aQIsocSEDx501268nxszGbWY', name: 'Co-build Workflow', date: 'February 2026' },
    { id: 'c3r7', playbackId: 'wrCYLOM6M7rmQ00qMwyEpI4F33OJ3r4p7Sh02ukUaWwJg', name: 'Adaptive Workflow', date: 'April 2026' },
    { id: 'c3r8', playbackId: 'FoU3d02dHic602T1vNd9kjLTGnHbUpW8f9OX2FO029oS008', name: 'Meet Icebreaker', date: 'July 2026' },
    { id: 'c3r9', playbackId: 'Ux1Kjx4W21sTiZ9G3DHpHJ8EvvYOXouES02qxbHR1sbA', name: 'Smart Calendar', date: 'April 2026' },
  ],
]
