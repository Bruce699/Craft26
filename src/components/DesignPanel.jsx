import { useState, useCallback, useEffect } from 'react'
import './DesignPanel.css'

const DEFAULTS = {
  bgColor: '#000000',
  cardRadius: 12,
  cardStrokeColor: '#1c1c1c',
  cardStrokeOpacity: 100,
  cardStrokeWidth: 1,
  navBg: '#1c1c1c',
  navBgOpacity: 100,
  navRadius: 8,
  navLinkColor: '#404040',
  navActiveColor: '#f0f0f0',
  navFontSize: 14,
  gridGap: 12,
  gridPadding: 48,
  gridTopOffset: 150,
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

function SliderControl({ value, onChange, label, min = 0, max = 100, step = 1, unit = '' }) {
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
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="design-panel__slider-value">
          {value}{unit}
        </span>
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
      <div className="design-panel-orb" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </div>
    )
  }

  return (
    <div className="design-panel">
      <div className="design-panel__header">
        <span className="design-panel__title">Design Panel</span>
        <button className="design-panel__close" onClick={() => setOpen(false)}>
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
