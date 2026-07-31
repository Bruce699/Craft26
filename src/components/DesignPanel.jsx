import { useState, useCallback, useEffect } from 'react'
import './DesignPanel.css'

const DEFAULTS = {
  bgColor: '#0F0F0F',
  cardRadius: 12,
  cardStrokeColor: '#1c1c1c',
  cardStrokeOpacity: 100,
  cardStrokeWidth: 1,
  navBg: '#1c1c1c',
  navBgOpacity: 100,
  navRadius: 8,
  navLinkColor: '#404040',
  navActiveColor: '#d8d8d8',
  navFontSize: 14,
  gridGap: 12,
  gridPadding: 48,
  gridTopOffset: 150,
  entryDurationDesktop: 500,
  entryDurationMobile: 550,
  entryDistance: 400,
  entryScale: 0.4,
  entryBezierX1: 0,
  entryBezierY1: 0.91,
  entryBezierX2: 0,
  entryBezierY2: 1,
  hoverTagBg: '#000000',
  hoverTagOpacity: 75,
  hoverTagNameColor: '#f0f0f0',
  hoverTagDateColor: '#949494',
  hoverTagFontSize: 14,
  hoverTagHeight: 41,
}

function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`
}

function ColorControl({ value, onChange, label }) {
  return (
    <div className="design-panel__row">
      <span className="design-panel__label">{label}</span>
      <div className="design-panel__control">
        <div
          className="design-panel__color-swatch"
          style={{ backgroundColor: value }}
        >
          <input
            className="design-panel__color-input"
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <input
          className="design-panel__color-hex"
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
          }}
          onBlur={(e) => {
            let v = e.target.value.trim()
            if (!v.startsWith('#')) v = '#' + v
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
          }}
        />
      </div>
    </div>
  )
}

function SliderControl({
  value,
  onChange,
  label,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  editable = false,
}) {
  return (
    <div className="design-panel__row">
      <span className="design-panel__label">{label}</span>
      <div className="design-panel__slider-wrap">
        <input
          className="design-panel__slider"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {editable ? (
          <input
            className="design-panel__slider-number"
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label={`${label} value`}
            onChange={(e) => {
              const next = Number(e.target.value)
              if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)))
            }}
          />
        ) : (
          <span className="design-panel__slider-value">
            {value}{unit}
          </span>
        )}
      </div>
    </div>
  )
}

function BezierPreview({ x1, y1, x2, y2 }) {
  const [replayKey, setReplayKey] = useState(0)
  const [copied, setCopied] = useState(false)
  const curve = `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`

  useEffect(() => {
    setReplayKey((key) => key + 1)
  }, [x1, y1, x2, y2])

  const graphLeft = 14
  const graphRight = 226
  const graphTop = 10
  const graphBottom = 130
  const graphWidth = graphRight - graphLeft
  const graphHeight = graphBottom - graphTop
  const point = (x, y) => ({
    x: graphLeft + x * graphWidth,
    y: graphBottom - ((y + 1) / 3) * graphHeight,
  })
  const start = point(0, 0)
  const end = point(1, 1)
  const control1 = point(x1, y1)
  const control2 = point(x2, y2)

  const copyCurve = () => {
    navigator.clipboard.writeText(curve).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="design-panel__bezier-preview">
      <svg
        className="design-panel__curve-graph"
        viewBox="0 0 240 140"
        role="img"
        aria-label={`Preview of ${curve}`}
      >
        <line className="design-panel__curve-guide" x1={graphLeft} y1={start.y} x2={graphRight} y2={start.y} />
        <line className="design-panel__curve-guide" x1={graphLeft} y1={end.y} x2={graphRight} y2={end.y} />
        <line className="design-panel__curve-handle" x1={start.x} y1={start.y} x2={control1.x} y2={control1.y} />
        <line className="design-panel__curve-handle" x1={end.x} y1={end.y} x2={control2.x} y2={control2.y} />
        <path
          className="design-panel__curve-path"
          d={`M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`}
        />
        <circle className="design-panel__curve-endpoint" cx={start.x} cy={start.y} r="3" />
        <circle className="design-panel__curve-endpoint" cx={end.x} cy={end.y} r="3" />
        <circle className="design-panel__curve-control design-panel__curve-control--one" cx={control1.x} cy={control1.y} r="4" />
        <circle className="design-panel__curve-control design-panel__curve-control--two" cx={control2.x} cy={control2.y} r="4" />
      </svg>

      <button
        type="button"
        className="design-panel__motion-track"
        onClick={() => setReplayKey((key) => key + 1)}
        aria-label="Replay curve preview"
      >
        <span
          key={`${curve}-${replayKey}`}
          className="design-panel__motion-dot"
          style={{ animationTimingFunction: curve }}
        />
      </button>

      <div className="design-panel__curve-code">
        <code>{curve}</code>
        <button type="button" onClick={copyCurve}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function applyStyles(s) {
  document.body.style.backgroundColor = s.bgColor

  document.documentElement.style.setProperty('--dp-card-radius', s.cardRadius + 'px')
  document.documentElement.style.setProperty(
    '--dp-card-stroke',
    `inset 0 0 0 ${s.cardStrokeWidth}px ${hexToRgba(s.cardStrokeColor, s.cardStrokeOpacity)}`,
  )
  document.documentElement.style.setProperty('--dp-nav-bg', hexToRgba(s.navBg, s.navBgOpacity))
  document.documentElement.style.setProperty('--dp-nav-radius', s.navRadius + 'px')
  document.documentElement.style.setProperty('--dp-nav-link-color', s.navLinkColor)
  document.documentElement.style.setProperty('--dp-nav-active-color', s.navActiveColor)
  document.documentElement.style.setProperty('--dp-nav-font-size', s.navFontSize + 'px')
  document.documentElement.style.setProperty('--dp-grid-gap', s.gridGap + 'px')
  document.documentElement.style.setProperty('--dp-grid-padding', s.gridPadding + 'px')
  document.documentElement.style.setProperty('--dp-grid-top-offset', s.gridTopOffset + 'px')
  document.documentElement.style.setProperty('--dp-entry-duration-desktop', s.entryDurationDesktop + 'ms')
  document.documentElement.style.setProperty('--dp-entry-duration-mobile', s.entryDurationMobile + 'ms')
  document.documentElement.style.setProperty('--dp-entry-distance', s.entryDistance + 'px')
  document.documentElement.style.setProperty('--dp-entry-scale', String(s.entryScale))
  document.documentElement.style.setProperty(
    '--dp-entry-easing',
    `cubic-bezier(${s.entryBezierX1}, ${s.entryBezierY1}, ${s.entryBezierX2}, ${s.entryBezierY2})`,
  )
  document.documentElement.style.setProperty('--dp-hover-tag-bg', hexToRgba(s.hoverTagBg, s.hoverTagOpacity))
  document.documentElement.style.setProperty('--dp-hover-tag-name-color', s.hoverTagNameColor)
  document.documentElement.style.setProperty('--dp-hover-tag-date-color', s.hoverTagDateColor)
  document.documentElement.style.setProperty('--dp-hover-tag-font-size', s.hoverTagFontSize + 'px')
  document.documentElement.style.setProperty('--dp-hover-tag-height', s.hoverTagHeight + 'px')
}

export default function DesignPanel() {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(DEFAULTS)

  const set = useCallback((key, val) => {
    setValues((prev) => ({ ...prev, [key]: val }))
  }, [])

  useEffect(() => {
    applyStyles(values)
    window.dispatchEvent(
      new CustomEvent('dp-grid-update', {
        detail: {
          gap: values.gridGap,
          padding: values.gridPadding,
          topOffset: values.gridTopOffset,
        },
      }),
    )
  }, [values])

  const reset = () => setValues(DEFAULTS)
  const replayEntrance = () => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('dp-replay-entry'))
    })
  }

  const [copied, setCopied] = useState(false)
  const copySettings = () => {
    const lines = Object.entries(values).map(
      ([k, v]) => `  ${k}: ${JSON.stringify(v)}`,
    )
    const text = `{\n${lines.join(',\n')}\n}`
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        className="design-panel-orb"
        aria-label="Open design controls"
        onClick={() => setOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
    )
  }

  return (
    <div className="design-panel">
      <div className="design-panel__header">
        <span className="design-panel__title">Design Panel</span>
        <button type="button" className="design-panel__close" aria-label="Close design controls" onClick={() => setOpen(false)}>
          &times;
        </button>
      </div>
      <div className="design-panel__body">

        <div className="design-panel__section">
          <div className="design-panel__section-title">Background</div>
          <ColorControl label="Color" value={values.bgColor} onChange={(v) => set('bgColor', v)} />
        </div>

        <div className="design-panel__section">
          <div className="design-panel__section-title">Card Stroke</div>
          <ColorControl label="Color" value={values.cardStrokeColor} onChange={(v) => set('cardStrokeColor', v)} />
          <SliderControl label="Opacity" value={values.cardStrokeOpacity} onChange={(v) => set('cardStrokeOpacity', v)} unit="%" />
          <SliderControl label="Width" value={values.cardStrokeWidth} onChange={(v) => set('cardStrokeWidth', v)} min={0} max={4} step={0.5} unit="px" />
          <SliderControl label="Radius" value={values.cardRadius} onChange={(v) => set('cardRadius', v)} min={0} max={32} unit="px" />
        </div>

        <div className="design-panel__section">
          <div className="design-panel__section-title">Navigation</div>
          <ColorControl label="Background" value={values.navBg} onChange={(v) => set('navBg', v)} />
          <SliderControl label="BG Opacity" value={values.navBgOpacity} onChange={(v) => set('navBgOpacity', v)} unit="%" />
          <SliderControl label="Radius" value={values.navRadius} onChange={(v) => set('navRadius', v)} min={0} max={49} unit="px" />
          <ColorControl label="Link Color" value={values.navLinkColor} onChange={(v) => set('navLinkColor', v)} />
          <ColorControl label="Active Color" value={values.navActiveColor} onChange={(v) => set('navActiveColor', v)} />
          <SliderControl label="Font Size" value={values.navFontSize} onChange={(v) => set('navFontSize', v)} min={10} max={20} unit="px" />
        </div>

        <div className="design-panel__section">
          <div className="design-panel__section-title">Grid Layout</div>
          <SliderControl label="Gap" value={values.gridGap} onChange={(v) => set('gridGap', v)} min={0} max={24} unit="px" />
          <SliderControl label="Padding" value={values.gridPadding} onChange={(v) => set('gridPadding', v)} min={0} max={48} unit="px" />
          <SliderControl label="Top Offset" value={values.gridTopOffset} onChange={(v) => set('gridTopOffset', v)} min={60} max={200} unit="px" />
        </div>

        <div className="design-panel__section">
          <div className="design-panel__section-title">Entry Motion Curve</div>
          <SliderControl label="Desktop · ms" value={values.entryDurationDesktop} onChange={(v) => set('entryDurationDesktop', v)} min={100} max={2500} step={25} editable />
          <SliderControl label="Mobile · ms" value={values.entryDurationMobile} onChange={(v) => set('entryDurationMobile', v)} min={100} max={2500} step={25} editable />
          <SliderControl label="Move Up · px" value={values.entryDistance} onChange={(v) => set('entryDistance', v)} min={0} max={500} step={1} editable />
          <SliderControl label="Start Scale" value={values.entryScale} onChange={(v) => set('entryScale', v)} min={0.1} max={1} step={0.01} editable />
          <BezierPreview
            x1={values.entryBezierX1}
            y1={values.entryBezierY1}
            x2={values.entryBezierX2}
            y2={values.entryBezierY2}
          />
          <SliderControl label="P1 · X" value={values.entryBezierX1} onChange={(v) => set('entryBezierX1', v)} min={0} max={1} step={0.01} editable />
          <SliderControl label="P1 · Y" value={values.entryBezierY1} onChange={(v) => set('entryBezierY1', v)} min={-1} max={2} step={0.01} editable />
          <SliderControl label="P2 · X" value={values.entryBezierX2} onChange={(v) => set('entryBezierX2', v)} min={0} max={1} step={0.01} editable />
          <SliderControl label="P2 · Y" value={values.entryBezierY2} onChange={(v) => set('entryBezierY2', v)} min={-1} max={2} step={0.01} editable />
          <button type="button" className="design-panel__replay" onClick={replayEntrance}>
            Replay Cards
          </button>
        </div>

        <div className="design-panel__section">
          <div className="design-panel__section-title">Hover Tag</div>
          <ColorControl label="Background" value={values.hoverTagBg} onChange={(v) => set('hoverTagBg', v)} />
          <SliderControl label="BG Opacity" value={values.hoverTagOpacity} onChange={(v) => set('hoverTagOpacity', v)} unit="%" />
          <ColorControl label="Name Color" value={values.hoverTagNameColor} onChange={(v) => set('hoverTagNameColor', v)} />
          <ColorControl label="Date Color" value={values.hoverTagDateColor} onChange={(v) => set('hoverTagDateColor', v)} />
          <SliderControl label="Font Size" value={values.hoverTagFontSize} onChange={(v) => set('hoverTagFontSize', v)} min={10} max={20} unit="px" />
          <SliderControl label="Height" value={values.hoverTagHeight} onChange={(v) => set('hoverTagHeight', v)} min={28} max={60} unit="px" />
        </div>

        <button className="design-panel__copy" onClick={copySettings}>
          {copied ? 'Copied!' : 'Copy All Settings'}
        </button>
        <button className="design-panel__reset" onClick={reset}>
          Reset All to Defaults
        </button>
      </div>
    </div>
  )
}
