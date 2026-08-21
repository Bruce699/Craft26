import { useEffect, useRef } from 'react'

// Renders an image as a field of colored particles (one per sampled pixel).
//
// Entry:  particles fall in from above, cascading top row → bottom row.
// Cursor: particles near the pointer inherit its momentum, then a damped
//         spring pulls them home.
// Swap:   the field never rebuilds between photos. Every source is sampled
//         onto the SAME particle grid, so switching photos just tweens each
//         particle's colour from where it is to the new photo's colour, with
//         a scatter impulse so the field visibly reorganises and re-forms.
//
// All tunables arrive via `params` (DialKit-driven); they're read through a
// ref each frame so dial drags never rebuild the field.
//
// The canvas is deliberately larger than the photo frame by `bleed` on every
// side, so stirred particles can travel outside the image without being
// clipped. The sampled image still occupies exactly the frame rect; `bleed`
// only adds room around it. Physics runs in CSS-pixel space (canvas-local,
// where the image's top-left corner sits at [bleed, bleed]); the backing store
// is scaled by devicePixelRatio.

const MAX_PARTICLES = 90000
const MAX_DPR = 2
const CURSOR_COUPLING = 6      // scales stirStrength into velocity transfer
const CURSOR_PUSH_RATIO = 0.35 // fraction of stir applied as radial push
const CURSOR_DECAY = 5         // 1/s — cursor momentum fade once it stops
const MAX_STEP = 1 / 30        // clamp dt so background tabs don't explode
const REST_SPEED = 0.6         // px/s below which the field counts as at rest
const ENTRY_CASCADE = 0.85     // share of stagger driven by row (vs. jitter)

// Photos can be dropped in as any of these; first hit wins.
const EXTENSIONS = ['.jpg', '.png', '.jpeg', '.webp']

// Resolves `/Experience/Google` against each extension in turn. Returns null
// if none load, so a not-yet-added photo falls back instead of breaking.
function loadSource(base) {
  if (!base) return Promise.resolve(null)
  // An explicit extension is used as-is.
  const candidates = /\.[a-z0-9]+$/i.test(base)
    ? [base]
    : EXTENSIONS.map((ext) => base + ext)

  return candidates.reduce(
    (chain, url) =>
      chain.then((found) => {
        if (found) return found
        return new Promise((resolve) => {
          const img = new Image()
          img.decoding = 'async'
          img.onload = () => resolve(img)
          img.onerror = () => resolve(null)
          img.src = url
        })
      }),
    Promise.resolve(null),
  )
}

export default function ParticlePhoto({
  sources,
  activeIndex,
  params,
  radius,
  replayKey,
}) {
  const canvasRef = useRef(null)
  const paramsRef = useRef(params)
  paramsRef.current = params
  const radiusRef = useRef(radius)
  radiusRef.current = radius
  // Set by the main effect; called by the activeIndex effect below.
  const swapRef = useRef(null)

  const sourceKey = sources.join('|')

  useEffect(() => {
    const canvas = canvasRef.current
    const frame = canvas.parentElement
    const ctx = canvas.getContext('2d')
    let raf = 0
    let rebuildTimer = 0
    let disposed = false

    // Particle state (allocated in build())
    let n = 0
    let px, py, vx, vy, hx, hy, delay, spin
    let palettes = []   // one Uint8ClampedArray(n*3) per source
    let fromRgb = null  // colour each particle is tweening out of
    let toRgb = null    // colour each particle is tweening into
    let activeStrings = null // precomputed 'rgb(r,g,b)' for the settled photo
    let swapElapsed = 1e9    // ms into the current colour tween
    let swapSettled = true   // has the finished tween been cached to strings?
    let swapDuration = 1
    let current = 0

    let bleed = 0
    let canvasW = 0
    let canvasH = 0
    let builtW = 0
    let builtH = 0
    let entryStart = 0
    let entryDone = false
    let atRest = false
    let lastTime = 0

    const cursor = { x: -1e5, y: -1e5, vx: 0, vy: 0, t: 0 }
    const supportsRoundRect = typeof ctx.roundRect === 'function'
    let images = []

    // Corner test so the dot field keeps the frame's rounded corners even
    // though the frame itself no longer clips anything.
    function insideRounded(x, y, w, h, r) {
      if (r <= 0) return true
      const nearL = x < r
      const nearR = x > w - r
      const nearT = y < r
      const nearB = y > h - r
      if ((nearL || nearR) && (nearT || nearB)) {
        const cx = nearL ? r : w - r
        const cy = nearT ? r : h - r
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
      }
      return true
    }

    // Samples one image onto the existing particle grid.
    function samplePalette(img, w, h, step, cols, rows, keep) {
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const octx = off.getContext('2d', { willReadFrequently: true })
      // Replicate the object-fit: cover crop the <img> fallback shows.
      const cover = Math.max(w / img.naturalWidth, h / img.naturalHeight)
      const cropW = w / cover
      const cropH = h / cover
      octx.drawImage(
        img,
        (img.naturalWidth - cropW) / 2,
        (img.naturalHeight - cropH) / 2,
        cropW,
        cropH,
        0,
        0,
        w,
        h,
      )
      const data = octx.getImageData(0, 0, w, h).data

      const rgb = new Uint8ClampedArray(n * 3)
      let i = 0
      for (let row = 0; row < rows; row++) {
        for (let c = 0; c < cols; c++) {
          if (!keep[row * cols + c]) continue
          const x = c * step + step / 2
          const y = row * step + step / 2
          const d = (Math.min(y | 0, h - 1) * w + Math.min(x | 0, w - 1)) * 4
          rgb[i * 3] = data[d]
          rgb[i * 3 + 1] = data[d + 1]
          rgb[i * 3 + 2] = data[d + 2]
          i++
        }
      }
      return rgb
    }

    function cacheStrings(rgb) {
      const out = new Array(n)
      for (let i = 0; i < n; i++) {
        out[i] = `rgb(${rgb[i * 3]},${rgb[i * 3 + 1]},${rgb[i * 3 + 2]})`
      }
      return out
    }

    function build() {
      const base = images[0]
      const w = frame.clientWidth
      const h = frame.clientHeight
      if (!w || !h || !base) return

      const p = paramsRef.current
      builtW = w
      builtH = h
      bleed = Math.max(0, p.bleed)
      canvasW = w + bleed * 2
      canvasH = h + bleed * 2

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      canvas.width = Math.round(canvasW * dpr)
      canvas.height = Math.round(canvasH * dpr)
      canvas.style.width = `${canvasW}px`
      canvas.style.height = `${canvasH}px`
      canvas.style.left = `${-bleed}px`
      canvas.style.top = `${-bleed}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      let step = Math.max(2, Math.round(p.gap))
      while (Math.ceil(w / step) * Math.ceil(h / step) > MAX_PARTICLES) step++

      const cols = Math.floor(w / step)
      const rows = Math.floor(h / step)
      const r = Math.max(0, radiusRef.current || 0)

      // Two passes: count what survives the corner mask, then fill.
      const keep = new Uint8Array(cols * rows)
      let kept = 0
      for (let row = 0; row < rows; row++) {
        for (let c = 0; c < cols; c++) {
          const x = c * step + step / 2
          const y = row * step + step / 2
          if (insideRounded(x, y, w, h, r)) {
            keep[row * cols + c] = 1
            kept++
          }
        }
      }

      n = kept
      px = new Float32Array(n)
      py = new Float32Array(n)
      vx = new Float32Array(n)
      vy = new Float32Array(n)
      hx = new Float32Array(n)
      hy = new Float32Array(n)
      delay = new Float32Array(n)
      spin = new Float32Array(n)

      // Every source lands on this same grid — that's what makes the swap a
      // recolour rather than a rebuild. Missing photos reuse the base one.
      palettes = images.map((img) =>
        img ? samplePalette(img, w, h, step, cols, rows, keep) : null,
      )
      const basePalette = palettes[0]
      palettes = palettes.map((pal) => pal || basePalette)

      current = Math.min(current, palettes.length - 1)
      toRgb = palettes[current]
      fromRgb = new Uint8ClampedArray(toRgb)
      activeStrings = cacheStrings(toRgb)
      swapElapsed = 1e9
      swapSettled = true

      const { entrySpread, entryStagger } = p
      let i = 0
      for (let row = 0; row < rows; row++) {
        for (let c = 0; c < cols; c++) {
          if (!keep[row * cols + c]) continue
          const x = c * step + step / 2
          const y = row * step + step / 2
          hx[i] = x + bleed
          hy[i] = y + bleed
          // Enter from above: drop straight down with a little lateral drift.
          px[i] = hx[i] + (Math.random() - 0.5) * entrySpread * 0.15
          py[i] = hy[i] - entrySpread * (0.5 + Math.random() * 0.5)
          vx[i] = 0
          vy[i] = 0
          // Signed, uneven spin so the swirl shears instead of rotating as a
          // rigid disc — this is what makes the swap read as turbulent.
          spin[i] = (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.6)
          // Cascade top → bottom, with a touch of jitter so rows don't march.
          const rowFraction = rows > 1 ? row / (rows - 1) : 0
          delay[i] =
            rowFraction * entryStagger * ENTRY_CASCADE +
            Math.random() * entryStagger * (1 - ENTRY_CASCADE)
          i++
        }
      }
      entryStart = 0 // stamped on the first tick after build
      entryDone = false
      atRest = false
    }

    // Switch photos: snapshot whatever colour each particle shows right now as
    // the tween's starting point, aim at the new palette, and kick the field
    // so it scatters and re-forms.
    function swapTo(index) {
      if (!n || !palettes.length) return
      const next = Math.max(0, Math.min(index, palettes.length - 1))
      if (next === current && swapElapsed >= swapDuration) return

      const p = paramsRef.current
      const progress = Math.min(swapElapsed / swapDuration, 1)
      const snapshot = new Uint8ClampedArray(n * 3)
      for (let i = 0; i < n * 3; i++) {
        snapshot[i] = fromRgb[i] + (toRgb[i] - fromRgb[i]) * progress
      }
      fromRgb = snapshot
      toRgb = palettes[next]
      current = next
      swapElapsed = 0
      swapSettled = false
      swapDuration = Math.max(p.swapDuration, 1)

      const scatter = p.swapScatter
      if (scatter > 0) {
        for (let i = 0; i < n; i++) {
          const angle = Math.random() * Math.PI * 2
          const mag = scatter * (0.5 + Math.random() * 0.5)
          vx[i] += Math.cos(angle) * mag
          vy[i] += Math.sin(angle) * mag
        }
      }
      atRest = false
    }
    swapRef.current = swapTo

    function tick(now) {
      if (!n) return
      if (!entryStart) {
        entryStart = now
        lastTime = now
      }
      const dt = Math.min((now - lastTime) / 1000, MAX_STEP)
      lastTime = now
      const t = now - entryStart

      const p = paramsRef.current
      const k = p.stiffness
      const c = p.damping
      const stirRadius = p.stirRadius
      const r2 = stirRadius * stirRadius
      const stir = p.stirStrength * CURSOR_COUPLING

      // Cursor momentum fades once the pointer stops moving.
      const decay = Math.exp(-CURSOR_DECAY * dt)
      cursor.vx *= decay
      cursor.vy *= decay
      const cursorLive = Math.abs(cursor.vx) + Math.abs(cursor.vy) > 1

      swapElapsed += dt * 1000
      const swapping = swapElapsed < swapDuration
      const swapProgress = swapping ? swapElapsed / swapDuration : 1
      if (!swapping && !swapSettled) {
        fromRgb = new Uint8ClampedArray(toRgb)
        activeStrings = cacheStrings(toRgb)
        swapSettled = true
      }

      // Settled field, no cursor, no colour tween: nothing to redraw, so skip
      // the frame entirely. This is the common case and keeps idle cost at 0.
      if (atRest && !cursorLive && !swapping) return

      ctx.clearRect(0, 0, canvasW, canvasH)

      const size = p.size
      const half = size / 2
      const fade = Math.max(p.entryFade, 1)
      // Square dots take the fast fillRect path; rounded ones need a path per
      // particle, which costs more but only while the field is in motion.
      const corner = Math.min(p.cornerRadius, half)
      const rounded = corner > 0.05 && supportsRoundRect
      const drawDot = rounded
        ? (x, y) => {
            ctx.beginPath()
            ctx.roundRect(x, y, size, size, corner)
            ctx.fill()
          }
        : (x, y) => ctx.fillRect(x, y, size, size)
      let allSettled = true
      let maxSpeed = 0

      // Ease the colour tween on the same curve the rest of the page uses.
      const e = swapProgress
      const eased = e < 1 ? 1 - Math.pow(1 - e, 3) : 1

      // Swirl/turbulence ramp down over the tween; centre is the image middle.
      const decayCurve = swapping ? (1 - swapProgress) ** 2 : 0
      const swirlForce = p.swapSwirl * decayCurve
      const chaosForce = p.swapChaos * decayCurve
      const centerX = canvasW / 2
      const centerY = canvasH / 2
      const turbPhase = now * 0.004

      for (let i = 0; i < n; i++) {
        const wait = delay[i]
        if (!entryDone && t < wait) {
          allSettled = false
          continue // not born yet
        }

        // Damped spring toward home
        vx[i] += (k * (hx[i] - px[i]) - c * vx[i]) * dt
        vy[i] += (k * (hy[i] - py[i]) - c * vy[i]) * dt

        if (swapping) {
          // Tangential force about the field centre: particles orbit rather
          // than simply scatter. Both forces fade out across the tween so the
          // spring is unopposed by the time the new photo has fully resolved.
          const ox = px[i] - centerX
          const oy = py[i] - centerY
          const od = Math.hypot(ox, oy) || 1
          vx[i] += (-oy / od) * swirlForce * spin[i] * dt
          vy[i] += (ox / od) * swirlForce * spin[i] * dt
          // Cheap divergence-free-ish turbulence keyed off the home position,
          // so neighbouring particles drift as coherent eddies, not noise.
          vx[i] += Math.sin(hy[i] * 0.035 + turbPhase) * chaosForce * dt
          vy[i] += Math.cos(hx[i] * 0.035 + turbPhase) * chaosForce * dt
        }

        if (cursorLive) {
          const dx = px[i] - cursor.x
          const dy = py[i] - cursor.y
          const d2 = dx * dx + dy * dy
          if (d2 < r2) {
            const d = Math.sqrt(d2) || 1
            const falloff = 1 - d / stirRadius
            const f = stir * falloff * dt
            const push = Math.abs(cursor.vx + cursor.vy) * f * CURSOR_PUSH_RATIO
            vx[i] += cursor.vx * f + (dx / d) * push
            vy[i] += cursor.vy * f + (dy / d) * push
          }
        }

        px[i] += vx[i] * dt
        py[i] += vy[i] * dt

        const speed = Math.abs(vx[i]) + Math.abs(vy[i])
        if (speed > maxSpeed) maxSpeed = speed

        if (swapping) {
          const j = i * 3
          const r = fromRgb[j] + (toRgb[j] - fromRgb[j]) * eased
          const g = fromRgb[j + 1] + (toRgb[j + 1] - fromRgb[j + 1]) * eased
          const b = fromRgb[j + 2] + (toRgb[j + 2] - fromRgb[j + 2]) * eased
          ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`
        } else {
          ctx.fillStyle = activeStrings[i]
        }

        if (!entryDone) {
          const alpha = Math.min((t - wait) / fade, 1)
          if (alpha < 1) {
            allSettled = false
            ctx.globalAlpha = alpha
            drawDot((px[i] - half) | 0, (py[i] - half) | 0)
            ctx.globalAlpha = 1
            continue
          }
        }
        drawDot((px[i] - half) | 0, (py[i] - half) | 0)
      }

      if (!entryDone && allSettled) entryDone = true
      atRest = entryDone && !cursorLive && maxSpeed < REST_SPEED
    }

    function loop(now) {
      if (disposed) return
      tick(now)
      raf = requestAnimationFrame(loop)
    }

    // Listened on window, not the canvas: the canvas is pointer-events: none
    // so it never steals hover from the text column it now overlaps.
    function onPointerMove(event) {
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top
      const now = performance.now()
      const dt = (now - cursor.t) / 1000
      if (cursor.t && dt > 0 && dt < 0.2) {
        // Blend so a single jittery event doesn't spike the momentum.
        const nvx = (x - cursor.x) / dt
        const nvy = (y - cursor.y) / dt
        cursor.vx = cursor.vx * 0.5 + nvx * 0.5
        cursor.vy = cursor.vy * 0.5 + nvy * 0.5
      }
      cursor.x = x
      cursor.y = y
      cursor.t = now
    }

    function onBlur() {
      cursor.vx = 0
      cursor.vy = 0
      cursor.t = 0
    }

    Promise.all(sources.map(loadSource)).then((loaded) => {
      if (disposed) return
      images = loaded
      build()
      raf = requestAnimationFrame(loop)
    })

    const observer = new ResizeObserver(() => {
      clearTimeout(rebuildTimer)
      rebuildTimer = setTimeout(() => {
        if (disposed) return
        if (frame.clientWidth === builtW && frame.clientHeight === builtH) return
        build()
      }, 150)
    })
    observer.observe(frame)

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('blur', onBlur)

    if (import.meta.env.DEV) {
      // Headless verification: RAF is throttled in hidden tabs, so expose a
      // manual stepper. Harmless in dev, stripped from production builds.
      window.__aboutParticles = {
        step: (ms = 16, steps = 1) => {
          const base = lastTime || performance.now()
          for (let s = 1; s <= steps; s++) tick(base + ms * s)
        },
        stir: (x, y, velX, velY) => {
          cursor.x = x
          cursor.y = y
          cursor.vx = velX
          cursor.vy = velY
          cursor.t = performance.now()
          atRest = false
        },
        swap: (i) => swapTo(i),
        sources: () => images.map((img, i) => ({
          index: i,
          src: img ? img.currentSrc || img.src : null,
          loaded: !!img,
        })),
        colorAt: (i) => {
          const j = i * 3
          const e = Math.min(swapElapsed / swapDuration, 1)
          const eased = 1 - Math.pow(1 - e, 3)
          return [
            Math.round(fromRgb[j] + (toRgb[j] - fromRgb[j]) * eased),
            Math.round(fromRgb[j + 1] + (toRgb[j + 1] - fromRgb[j + 1]) * eased),
            Math.round(fromRgb[j + 2] + (toRgb[j + 2] - fromRgb[j + 2]) * eased),
          ]
        },
        info: () => {
          let maxOff = 0
          let minY = Infinity
          let maxY = -Infinity
          let minX = Infinity
          let maxX = -Infinity
          for (let i = 0; i < n; i++) {
            const off = Math.hypot(px[i] - hx[i], py[i] - hy[i])
            if (off > maxOff) maxOff = off
            if (py[i] < minY) minY = py[i]
            if (py[i] > maxY) maxY = py[i]
            if (px[i] < minX) minX = px[i]
            if (px[i] > maxX) maxX = px[i]
          }
          return {
            count: n,
            entryDone,
            atRest,
            maxOffset: maxOff,
            bleed,
            canvas: [canvasW, canvasH],
            yRange: [minY, maxY],
            xRange: [minX, maxX],
            activePhoto: current,
            palettes: palettes.length,
            swapProgress: Math.min(swapElapsed / swapDuration, 1),
          }
        },
        // Entry progress by row band, to confirm the top-down cascade.
        rowProgress: (t) => {
          const bands = [0, 0, 0, 0]
          const counts = [0, 0, 0, 0]
          const top = bleed
          const height = canvasH - bleed * 2
          for (let i = 0; i < n; i++) {
            const band = Math.min(3, Math.floor(((hy[i] - top) / height) * 4))
            counts[band]++
            if (t >= delay[i]) bands[band]++
          }
          return bands.map((b, i) => +(b / counts[i]).toFixed(2))
        },
      }
    }

    return () => {
      disposed = true
      swapRef.current = null
      cancelAnimationFrame(raf)
      clearTimeout(rebuildTimer)
      observer.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('blur', onBlur)
      if (import.meta.env.DEV && window.__aboutParticles) {
        delete window.__aboutParticles
      }
    }
    // Gap/bleed/radius reshape the field; everything else flows through refs.
  }, [sourceKey, replayKey, params.gap, params.bleed, radius])

  // Hovering an experience row drives this; the field recolours in place.
  useEffect(() => {
    swapRef.current?.(activeIndex)
  }, [activeIndex])

  return (
    <canvas
      ref={canvasRef}
      className="about-v2__particles"
      role="img"
      aria-label="Bruce Cao"
    />
  )
}
