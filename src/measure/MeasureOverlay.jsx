import { useEffect, useId, useRef, useState } from 'react'
import './MeasureOverlay.css'
import { listenForHold } from './holdKey'
import { createMediaTransition } from './mediaTransition'
import { setMotionRate } from './motionClock'

// Fixed preview settings. Measurement guides remain disabled.
const settings = {
  enabled: true,
  showMeasurements: false,
  pinOverlay: false,
  holdDelay: 350,
  opacity: 1,
  dimColor: '#000000',
  fontWeight: 500,
  dimPage: 1,
  pixelGrid: {
    visible: true,
    color: '#2684ff',
    opacity: 0.3,
    cellSize: 8,
    lineWidth: 0.5,
    majorEvery: 8,
    majorWidth: 1,
    majorOpacity: 0.65,
    offsetX: 0,
    offsetY: 0,
    followScroll: true,
  },
  layout: {
    visible: true,
    color: '#4598ff',
    opacity: 0.95,
    columnFill: 0.035,
    showColumns: true,
    showPadding: true,
    showGaps: true,
    showRowGaps: true,
    showTopPadding: true,
    guides: true,
    lineWidth: 1,
    arrowSize: 4,
    rulerY: 114,
    gapLabelOffset: 25,
    rowGapLabelOffset: 48,
    topLabelOffset: 30,
    topRulerX: 25,
    fontSize: 10,
    labelPadding: 5,
    labelRadius: 3,
    labelBackground: '#08162a',
    labelOpacity: 0.95,
    decimals: 0,
  },
  cardBounds: {
    visible: true,
    color: '#69acff',
    opacity: 0.95,
    showBounds: true,
    showCornerCircles: true,
    showRadiusLabels: true,
    showDimensions: false,
    lineWidth: 1,
    lineExtension: 10,
    circleLineWidth: 1,
    circleFill: '#08162a',
    circleFillOpacity: 0.65,
    radiusFontSize: 7,
    radiusLabelColor: '#b5d6ff',
    radiusPrefix: true,
    dimensionsFontSize: 10,
    dimensionsOffset: 12,
  },
}

const editable = target => target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')
const rectangle = element => {
  const r = element.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height }
}

export default function MeasureOverlay() {
  const p = settings
  const [pressed, setPressed] = useState(false)
  const backdropRef = useRef(null)
  const transitionRef = useRef(null)
  const motionActiveRef = useRef(false)
  motionActiveRef.current = p.enabled && (pressed || p.pinOverlay)
  const progressRef = useRef(0)
  const dimRef = useRef(p.dimPage)
  dimRef.current = p.dimPage
  const [held, setHeld] = useState(false)
  const [geometry, setGeometry] = useState(null)
  const id = useId().replace(/:/g, '')
  const active = p.enabled && p.showMeasurements && (held || p.pinOverlay)

  useEffect(() => listenForHold({
    windowTarget: window,
    documentTarget: document,
    delay: p.holdDelay,
    onChange: setHeld,
    onPress: setPressed,
    isEditable: editable,
  }), [p.holdDelay])

  useEffect(() => {
    const transition = createMediaTransition({
      onProgress: progress => {
        progressRef.current = progress
        setMotionRate(1 - 0.75 * progress)
        if (backdropRef.current) backdropRef.current.style.opacity = String(progress * dimRef.current)
      },
    })
    transitionRef.current = transition
    const visibility = () => {
      if (document.hidden) transition.reset()
      else transition.setActive(motionActiveRef.current)
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      transition.dispose()
      transitionRef.current = null
    }
  }, [])

  useEffect(() => {
    transitionRef.current?.setActive(p.enabled && (pressed || p.pinOverlay))
  }, [pressed, p.enabled, p.pinOverlay])

  useEffect(() => {
    if (backdropRef.current) backdropRef.current.style.opacity = String(progressRef.current * p.dimPage)
  }, [p.dimPage])

  useEffect(() => {
    if (!active) return
    let frame, previous = '', last = -Infinity
    const measure = now => {
      // Sample only while visible; also track animated/transformed cards.
      if (now - last >= 32) {
        last = now
        const grid = document.querySelector('.feed-grid--phase-feed .feed-grid__columns')
        if (!grid) { setGeometry(null); previous = '' }
        else {
          const width = document.documentElement.clientWidth, height = window.innerHeight
          const columns = [...grid.children].map(column => {
            const all = [...column.querySelectorAll('.video-card')]
            const boxes = all.map(card => {
              const r = rectangle(card), css = getComputedStyle(card)
              const scale = card.offsetWidth ? r.w / card.offsetWidth : 1
              const radii = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map(key => Math.min(parseFloat(css[key]) * scale || 0, r.w / 2, r.h / 2))
              return { ...r, radii, id: card.parentElement.dataset.gridId }
            })
            return { ...rectangle(column), cards: boxes.filter(r => r.y + r.h >= -60 && r.y <= height + 60) }
          })
          const next = { width, height, scrollY: window.scrollY, top: rectangle(grid).y, columns }
          const signature = JSON.stringify(next)
          if (signature !== previous) { previous = signature; setGeometry(next) }
        }
      }
      frame = requestAnimationFrame(measure)
    }
    frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [active])

  // Stay mounted after keyup so the background can finish its 400 ms return.
  const backdrop = <div key="backdrop" ref={backdropRef} className="measure-backdrop" aria-hidden="true" style={{ backgroundColor: p.dimColor }} />
  if (!active || !geometry) return <>{backdrop}</>
  const { width, height, columns, top, scrollY } = geometry
  const g = p.pixelGrid, l = p.layout, b = p.cardBounds
  const fmt = n => n.toFixed(l.decimals)
  const label = (x, y, text, key) => {
    const w = text.length * l.fontSize * 0.61 + l.labelPadding * 2
    const h = l.fontSize + l.labelPadding * 2
    x = Math.max(w / 2 + 2, Math.min(width - w / 2 - 2, x))
    return <g key={key} transform={`translate(${x}, ${y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={l.labelRadius} fill={l.labelBackground} fillOpacity={l.labelOpacity} />
      <text textAnchor="middle" dominantBaseline="central" fill={l.color} fontSize={l.fontSize}>{text}</text>
    </g>
  }
  const arrow = (x1, y1, x2, y2, key) => {
    const angle = Math.atan2(y2 - y1, x2 - x1)
    const size = Math.min(l.arrowSize, Math.hypot(x2 - x1, y2 - y1) / 3)
    const head = (x, y, a) => `M${x + Math.cos(a - 0.55) * size},${y + Math.sin(a - 0.55) * size} L${x},${y} L${x + Math.cos(a + 0.55) * size},${y + Math.sin(a + 0.55) * size}`
    return <g key={key} stroke={l.color} strokeWidth={l.lineWidth} fill="none">
      <path d={`M${x1},${y1} L${x2},${y2}`} />
      <path d={head(x1, y1, angle) + ' ' + head(x2, y2, angle + Math.PI)} />
    </g>
  }
  const major = g.cellSize * g.majorEvery
  const yOffset = g.offsetY - (g.followScroll ? scrollY : 0)
  const lastColumn = columns.at(-1)

  return <>{backdrop}<svg className="measure-overlay" data-testid="measure-overlay" aria-hidden="true" width={width} height={height} style={{ opacity: p.opacity, fontWeight: p.fontWeight }}>
    <defs>
      <pattern id={`${id}-minor`} width={g.cellSize} height={g.cellSize} patternUnits="userSpaceOnUse" x={g.offsetX} y={yOffset}>
        <path d={`M${g.cellSize} 0 H0 V${g.cellSize}`} fill="none" stroke={g.color} strokeWidth={g.lineWidth} />
      </pattern>
      <pattern id={`${id}-major`} width={major} height={major} patternUnits="userSpaceOnUse" x={g.offsetX} y={yOffset}>
        <path d={`M${major} 0 H0 V${major}`} fill="none" stroke={g.color} strokeWidth={g.majorWidth} />
      </pattern>
    </defs>
    {g.visible && <g data-layer="pixel-grid" opacity={g.opacity}>
      <rect width={width} height={height} fill={`url(#${id}-minor)`} />
      <rect width={width} height={height} fill={`url(#${id}-major)`} opacity={g.majorOpacity} />
    </g>}
    {l.visible && <g data-layer="layout" opacity={l.opacity}>
      {columns.map((col, i) => <g key={i}>
        <rect x={col.x} y={0} width={col.w} height={height} fill={l.color} fillOpacity={l.columnFill} />
        {l.guides && <path d={`M${col.x},0 V${height} M${col.x + col.w},0 V${height}`} stroke={l.color} strokeWidth={l.lineWidth} />}
        {l.showColumns && <>{arrow(col.x, l.rulerY, col.x + col.w, l.rulerY)}{label(col.x + col.w / 2, l.rulerY, `COL ${i + 1} · ${fmt(col.w)} px`)}</>}
        {l.showGaps && i < columns.length - 1 && <>
          {arrow(col.x + col.w, l.rulerY, columns[i + 1].x, l.rulerY)}
          {label((col.x + col.w + columns[i + 1].x) / 2, l.rulerY + l.gapLabelOffset, `${fmt(columns[i + 1].x - col.x - col.w)} px gap`)}
        </>}
        {l.showRowGaps && col.cards.slice(1).map((card, j) => {
          const prior = col.cards[j], gap = card.y - prior.y - prior.h
          if (gap < 0 || card.y < 0 || card.y > height) return null
          const x = col.x + col.w / 2, y = prior.y + prior.h
          return <g key={card.id}>{arrow(x, y, x, card.y)}{label(x + l.rowGapLabelOffset, y + gap / 2, `${fmt(gap)} px gap`)}</g>
        })}
      </g>)}
      {l.showPadding && columns.length > 0 && <>
        {arrow(0, l.rulerY, columns[0].x, l.rulerY)}
        {label(columns[0].x / 2, l.rulerY - l.gapLabelOffset, `${fmt(columns[0].x)} px pad`)}
        {arrow(lastColumn.x + lastColumn.w, l.rulerY, width, l.rulerY)}
        {label((lastColumn.x + lastColumn.w + width) / 2, l.rulerY - l.gapLabelOffset, `${fmt(width - lastColumn.x - lastColumn.w)} px pad`)}
      </>}
      {l.showTopPadding && top > 0 && <>
        {arrow(l.topRulerX, Math.max(0, -scrollY), l.topRulerX, top)}
        {label(l.topRulerX + l.topLabelOffset, top / 2, `${fmt(top + scrollY)} px top`)}
      </>}
    </g>}
    {b.visible && <g data-layer="card-bounds" opacity={b.opacity}>
      {columns.flatMap(col => col.cards).map(card => {
        const { x, y, w, h, radii } = card, e = b.lineExtension
        return <g key={card.id} data-card-id={card.id}>
          {b.showBounds && <path d={`M${x - e},${y} H${x + w + e} M${x - e},${y + h} H${x + w + e} M${x},${y - e} V${y + h + e} M${x + w},${y - e} V${y + h + e}`} fill="none" stroke={b.color} strokeWidth={b.lineWidth} strokeLinecap="round" />}
          {radii.map((r, i) => {
            const cx = i === 0 || i === 3 ? x + r : x + w - r
            const cy = i < 2 ? y + r : y + h - r
            return <g key={i}>
              {b.showCornerCircles && <circle cx={cx} cy={cy} r={r} fill={b.circleFill} fillOpacity={b.circleFillOpacity} stroke={b.color} strokeWidth={b.circleLineWidth} strokeLinecap="round" />}
              {b.showRadiusLabels && <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={b.radiusFontSize} fill={b.radiusLabelColor}>{b.radiusPrefix ? 'R' : ''}{Math.round(r)}</text>}
            </g>
          })}
          {b.showDimensions && <text x={x + w / 2} y={y + h / 2 + b.dimensionsOffset} textAnchor="middle" fill={b.color} fontSize={b.dimensionsFontSize}>{fmt(w)} × {fmt(h)} px</text>}
        </g>
      })}
    </g>}
  </svg></>
}
