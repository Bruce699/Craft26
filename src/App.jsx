import { useCallback, useEffect, useRef, useState } from 'react'
import FeedGrid from './components/FeedGrid'
import Nav from './components/Nav'
import DesignPanel from './components/DesignPanel'
import CoordinateScene from './coordinate/CoordinateScene'
import { useCoordinatePoints } from './coordinate/useCoordinateData'
import './App.css'

// Transition phases:
//   feed         → normal grid
//   exploding    → non-origin items fade + fly outward; origin pauses + starts translating to center
//   centering    → origin has completed translate; now scaling down
//   coordinate   → R3F scene mounted, origin locked at screen center
//   uncentering  → (reverse of centering) origin scales back up; scene thumbnails fade out
//   unexploding  → (reverse of exploding) origin translates back; non-origin items fly in + fade in
const PHASE_DURATIONS = {
  exploding: 500,
  centering: 500,
  uncentering: 500,
  unexploding: 500,
}

const ORIGIN_WIDTH_RATIO = 120 / 1200

const DARK_PHASES = new Set(['exploding', 'centering', 'coordinate', 'uncentering'])

const MOBILE_BREAKPOINT = 480
const MOBILE_FOCUS_TRANSITION_MS = 340
const MOBILE_FOCUS_EXIT_MS = MOBILE_FOCUS_TRANSITION_MS

const DESKTOP_FOCUS_EXIT_MS = 300
const ABOUT_LOGO_EXIT_DISTANCE = 60
const ABOUT_LOGO_FRICTION = 0.9
const ABOUT_LOGO_ROTATION_FORCE = 0.0675
const ABOUT_LOGO_ROTATION_DAMPING = 0.9
const ABOUT_LOGO_ROTATION_RETURN = 0.0375
const ABOUT_LOGO_TRANSLATION_RATIO = 0.65
const GOOGLE_LOGO = { src: '/Logos/Google.png', alt: 'Google' }
const SHOPIFY_LOGOS = [
  { src: '/Logos/Shopify_1.png', alt: 'Shopify' },
  { src: '/Logos/Shopify_2.png', alt: 'Shopify' },
  { src: '/Logos/Shopify_3.png', alt: 'Shopify' },
  { src: '/Logos/Shopify_4.png', alt: 'Shopify' },
]

function getInitialPage() {
  return window.location.hash === '#about' ? 'about' : 'craft'
}

export default function App() {
  const [page, setPage] = useState(getInitialPage)
  const [phase, setPhase] = useState('feed')
  const [originId, setOriginId] = useState(null)
  const [originRect, setOriginRect] = useState(null)
  const [sceneZoom, setSceneZoom] = useState(1)
  // { id, rect, exiting } — mobile focus overlay (tap a card to enlarge it)
  const [mobileFocus, setMobileFocus] = useState(null)
  // { id, rect, exiting } — desktop focus (click a card to zoom it to 80vh)
  const [desktopFocus, setDesktopFocus] = useState(null)
  const [aboutLogo, setAboutLogo] = useState(null)
  const mobileFocusScrollLockRef = useRef(0)
  const aboutLogoRef = useRef(null)
  const aboutLogoTargetRef = useRef({ x: 0, y: 0 })
  const aboutLogoOriginRef = useRef({ x: 0, y: 0 })
  const aboutLogoPositionRef = useRef({ x: 0, y: 0 })
  const aboutLogoRotationRef = useRef(0)
  const aboutLogoRotationVelocityRef = useRef(0)
  const aboutLogoLastCursorXRef = useRef(0)
  const aboutLogoBoundsRef = useRef(null)
  const aboutLogoRafRef = useRef(0)
  const aboutLogoVisibleRafRef = useRef(0)
  const shopifyLogoIndexRef = useRef(0)
  const [isMobile, setIsMobile] = useState(
    () => document.documentElement.clientWidth <= MOBILE_BREAKPOINT,
  )
  useEffect(() => {
    const onResize = () =>
      setIsMobile(document.documentElement.clientWidth <= MOBILE_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onHashChange = () => setPage(getInitialPage())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const hideAboutLogo = useCallback(() => {
    cancelAnimationFrame(aboutLogoVisibleRafRef.current)
    aboutLogoRotationVelocityRef.current = 0
    document.body.classList.remove('is-about-logo-hover')
    setAboutLogo((logo) => (logo ? { ...logo, visible: false } : logo))
  }, [])

  const showAboutLogo = useCallback((event, logo) => {
    if (isMobile) return
    const x = event.clientX
    const y = event.clientY
    aboutLogoTargetRef.current = { x, y }
    aboutLogoOriginRef.current = { x, y }
    aboutLogoPositionRef.current = { x, y }
    aboutLogoRotationRef.current = 0
    aboutLogoRotationVelocityRef.current = 0
    aboutLogoLastCursorXRef.current = x
    aboutLogoBoundsRef.current = event.currentTarget.getBoundingClientRect()
    document.body.classList.add('is-about-logo-hover')
    cancelAnimationFrame(aboutLogoVisibleRafRef.current)
    setAboutLogo({ ...logo, x, y, visible: false })
    aboutLogoVisibleRafRef.current = requestAnimationFrame(() => {
      aboutLogoVisibleRafRef.current = requestAnimationFrame(() => {
        setAboutLogo((current) =>
          current && current.src === logo.src
            ? { ...current, visible: true }
            : current,
        )
      })
    })
  }, [isMobile])

  const showNextShopifyLogo = useCallback((event) => {
    const currentIndex = shopifyLogoIndexRef.current
    shopifyLogoIndexRef.current = (currentIndex + 1) % SHOPIFY_LOGOS.length
    showAboutLogo(event, SHOPIFY_LOGOS[currentIndex])
  }, [showAboutLogo])

  const handleAboutLogoMove = useCallback((event) => {
    if (isMobile || !aboutLogoBoundsRef.current) return
    const x = event.clientX
    const y = event.clientY
    const deltaX = x - aboutLogoLastCursorXRef.current
    aboutLogoLastCursorXRef.current = x
    const origin = aboutLogoOriginRef.current
    aboutLogoTargetRef.current = {
      x: origin.x + (x - origin.x) * ABOUT_LOGO_TRANSLATION_RATIO,
      y: origin.y + (y - origin.y) * ABOUT_LOGO_TRANSLATION_RATIO,
    }
    aboutLogoRotationVelocityRef.current += deltaX * ABOUT_LOGO_ROTATION_FORCE

    const rect = aboutLogoBoundsRef.current
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0
    if (Math.hypot(dx, dy) > ABOUT_LOGO_EXIT_DISTANCE) hideAboutLogo()
  }, [hideAboutLogo, isMobile])

  useEffect(() => {
    if (!aboutLogo) return
    let running = true

    const tick = () => {
      const el = aboutLogoRef.current
      const pos = aboutLogoPositionRef.current
      const target = aboutLogoTargetRef.current
      pos.x += (target.x - pos.x) * ABOUT_LOGO_FRICTION
      pos.y += (target.y - pos.y) * ABOUT_LOGO_FRICTION
      aboutLogoPositionRef.current = pos
      aboutLogoRotationRef.current += aboutLogoRotationVelocityRef.current
      aboutLogoRotationVelocityRef.current *= ABOUT_LOGO_ROTATION_DAMPING
      aboutLogoRotationRef.current +=
        (0 - aboutLogoRotationRef.current) * ABOUT_LOGO_ROTATION_RETURN

      if (el) {
        el.style.setProperty('--about-logo-x', `${pos.x}px`)
        el.style.setProperty('--about-logo-y', `${pos.y}px`)
        el.style.setProperty('--about-logo-rotation', `${aboutLogoRotationRef.current}deg`)
      }
      if (running) aboutLogoRafRef.current = requestAnimationFrame(tick)
    }

    aboutLogoRafRef.current = requestAnimationFrame(tick)
    return () => {
      running = false
      cancelAnimationFrame(aboutLogoRafRef.current)
    }
  }, [aboutLogo])

  useEffect(() => {
    if (!aboutLogo) return undefined
    if (aboutLogo.visible) return undefined
    const t = setTimeout(() => setAboutLogo(null), 400)
    return () => clearTimeout(t)
  }, [aboutLogo])

  useEffect(() => {
    if (!aboutLogo?.visible || isMobile) return undefined
    window.addEventListener('mousemove', handleAboutLogoMove)
    window.addEventListener('blur', hideAboutLogo)
    return () => {
      window.removeEventListener('mousemove', handleAboutLogoMove)
      window.removeEventListener('blur', hideAboutLogo)
    }
  }, [aboutLogo, handleAboutLogoMove, hideAboutLogo, isMobile])

  const points = useCoordinatePoints()
  // Target pixel width of the centered origin item (and every coordinate thumbnail)
  const [originTargetWidth, setOriginTargetWidth] = useState(
    () => window.innerWidth * ORIGIN_WIDTH_RATIO,
  )
  useEffect(() => {
    const onResize = () => setOriginTargetWidth(window.innerWidth * ORIGIN_WIDTH_RATIO)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const handleItemDoubleClick = useCallback((id, rect) => {
    if (phase === 'feed') {
      setOriginId(id)
      setOriginRect(rect)
      setPhase('exploding')
      return
    }
    // Origin double-clicked in coordinate phase → reverse transition.
    if (phase === 'coordinate' && id === originId) {
      setPhase('uncentering')
    }
  }, [phase, originId])

  const handleMobileFocus = useCallback((id, rect, name, date) => {
    if (!isMobile || phase !== 'feed') return
    setMobileFocus({
      id,
      rect,
      name,
      date,
      scrollY: window.scrollY,
      exiting: false,
      previousId: null,
      direction: 0,
      phase: 'enter',
    })
  }, [isMobile, phase])

  const exitMobileFocus = useCallback(() => {
    setMobileFocus((f) => (f && !f.exiting ? { ...f, exiting: true } : f))
  }, [])

  const handleDesktopFocus = useCallback((id, rect, name, date) => {
    if (isMobile || phase !== 'feed') return
    setDesktopFocus({ id, rect, name, date, exiting: false })
  }, [isMobile, phase])

  const exitDesktopFocus = useCallback(() => {
    setDesktopFocus((f) => (f && !f.exiting ? { ...f, exiting: true } : f))
  }, [])

  useEffect(() => {
    if (!desktopFocus || !desktopFocus.exiting) return
    const t = setTimeout(() => setDesktopFocus(null), DESKTOP_FOCUS_EXIT_MS)
    return () => clearTimeout(t)
  }, [desktopFocus])

  // Lock page scroll while a card is desktop-focused so the fixed-position
  // card still lines up with its grid slot when it returns.
  useEffect(() => {
    document.body.classList.toggle(
      'is-desktop-focus',
      !!desktopFocus && !desktopFocus.exiting,
    )
    document.body.classList.toggle(
      'is-desktop-focus-exiting',
      !!desktopFocus?.exiting,
    )
  }, [desktopFocus])

  useEffect(() => {
    if (!mobileFocus || !mobileFocus.exiting) return
    const t = setTimeout(() => setMobileFocus(null), MOBILE_FOCUS_EXIT_MS)
    return () => clearTimeout(t)
  }, [mobileFocus])

  useEffect(() => {
    if (!mobileFocus || mobileFocus.exiting) return
    if (mobileFocus.phase !== 'enter' && mobileFocus.phase !== 'anim') return
    const t = setTimeout(() => {
      setMobileFocus((current) => {
        if (!current || current.exiting) return current
        if (current.id !== mobileFocus.id || current.phase !== mobileFocus.phase) return current
        return {
          ...current,
          previousId: null,
          direction: 0,
          phase: 'idle',
        }
      })
    }, MOBILE_FOCUS_TRANSITION_MS)
    return () => clearTimeout(t)
  }, [mobileFocus])

  const isAboutPage = page === 'about'
  const mobileFocusVisible = phase === 'feed' && !isAboutPage && !!mobileFocus
  const showMobileFocusOverlay = mobileFocusVisible && isMobile

  useEffect(() => {
    document.body.classList.toggle(
      'is-mobile-focus',
      mobileFocusVisible && !mobileFocus.exiting,
    )
    document.body.classList.toggle(
      'is-mobile-focus-exiting',
      mobileFocusVisible && mobileFocus.exiting,
    )
  }, [mobileFocus, mobileFocusVisible])

  useEffect(() => {
    if (!isMobile) return
    const shouldLockScroll = !!mobileFocus
    if (!shouldLockScroll) return

    const scrollY = window.scrollY
    mobileFocusScrollLockRef.current = scrollY
    let restoreRaf = 0

    const restoreScroll = () => {
      if (window.scrollY !== mobileFocusScrollLockRef.current) {
        window.scrollTo(0, mobileFocusScrollLockRef.current)
      }
    }

    const handleTouchMove = (event) => {
      event.preventDefault()
    }

    const handleWheel = (event) => {
      event.preventDefault()
    }

    const handleKeyDown = (event) => {
      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'PageUp' ||
        event.key === 'PageDown' ||
        event.key === 'Home' ||
        event.key === 'End' ||
        event.key === ' ' ||
        event.key === 'Spacebar'
      ) {
        event.preventDefault()
      }
    }

    const handleScroll = () => {
      cancelAnimationFrame(restoreRaf)
      restoreRaf = requestAnimationFrame(restoreScroll)
    }

    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      cancelAnimationFrame(restoreRaf)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('wheel', handleWheel)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll)
      window.scrollTo(0, mobileFocusScrollLockRef.current)
    }
  }, [isMobile, mobileFocus])

  // Phase timing. We advance phase via setTimeout so CSS transitions can run
  // in sequence without fighting each other.
  useEffect(() => {
    if (phase === 'exploding') {
      const t = setTimeout(() => setPhase('centering'), PHASE_DURATIONS.exploding)
      return () => clearTimeout(t)
    }
    if (phase === 'centering') {
      const t = setTimeout(() => setPhase('coordinate'), PHASE_DURATIONS.centering)
      return () => clearTimeout(t)
    }
    if (phase === 'uncentering') {
      const t = setTimeout(() => setPhase('unexploding'), PHASE_DURATIONS.uncentering)
      return () => clearTimeout(t)
    }
    if (phase === 'unexploding') {
      const t = setTimeout(() => {
        setPhase('feed')
        setOriginId(null)
        setOriginRect(null)
        setSceneZoom(1)
      }, PHASE_DURATIONS.unexploding)
      return () => clearTimeout(t)
    }
  }, [phase])

  // Dark background while in the 3D coordinate mode (including reverse enter).
  // Removed on `unexploding` so the bg fades back to normal alongside items
  // flying back in (body has a 0.6s bg-color transition).
  useEffect(() => {
    document.body.classList.toggle('is-dark', DARK_PHASES.has(phase))
  }, [phase])

  // Scene is mounted for forward centering/coordinate AND reverse uncentering
  // so thumbnails can fade out. Unmounts once we reach `unexploding`.
  const showScene =
    phase === 'centering' || phase === 'coordinate' || phase === 'uncentering'

  return (
    <>
      {phase === 'feed' && <Nav currentPage={page} />}
      {isAboutPage ? (
        <main className="about-page">
          <img className="about-page__photo" src="/Myself.png" alt="" />
          <p className="about-page__copy">
            I’m Bruce Cao. I’m currently designing at<br />
            <a
              className="about-page__link"
              href="https://design.google/"
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={(event) => showAboutLogo(event, GOOGLE_LOGO)}
              onMouseMove={handleAboutLogoMove}
            >
              Google
            </a>. I will be joining the{' '}
            <a
              className="about-page__link"
              href="https://shopify.design"
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={showNextShopifyLogo}
              onMouseMove={handleAboutLogoMove}
            >
              Product Design
            </a>
            <br />
            <a
              className="about-page__link"
              href="https://shopify.design"
              target="_blank"
              rel="noopener noreferrer"
              onMouseEnter={showNextShopifyLogo}
              onMouseMove={handleAboutLogoMove}
            >
              Studio at Shopify
            </a>{' '}
            in Fall 2026.
          </p>
          {aboutLogo && (
            <div
              ref={aboutLogoRef}
              className={`about-page__logo${aboutLogo.visible ? ' about-page__logo--visible' : ''}`}
              style={{
                '--about-logo-x': `${aboutLogo.x}px`,
                '--about-logo-y': `${aboutLogo.y}px`,
              }}
            >
              <img src={aboutLogo.src} alt={aboutLogo.alt} />
            </div>
          )}
        </main>
      ) : (
        <FeedGrid
          phase={phase}
          originId={originId}
          originRect={originRect}
          originTargetWidth={originTargetWidth}
          sceneZoom={sceneZoom}
          onItemDoubleClick={handleItemDoubleClick}
          mobileFocus={mobileFocus}
          onMobileFocus={handleMobileFocus}
          onExitMobileFocus={exitMobileFocus}
          desktopFocus={desktopFocus}
          onDesktopFocus={handleDesktopFocus}
        />
      )}
      {showMobileFocusOverlay && (
        <div
          className={`mobile-focus-overlay${mobileFocus.exiting ? ' mobile-focus-overlay--exiting' : ''}`}
          onClick={exitMobileFocus}
        />
      )}
      {showMobileFocusOverlay && (() => {
        const r = mobileFocus.rect
        const scale = (window.innerWidth - 8) / r.width
        const visualWidth = r.width * scale
        const visualHeight = r.height * scale
        const visualLeft = (window.innerWidth - visualWidth) / 2
        const visualTop = (window.innerHeight - visualHeight) / 2
        const exitingCls = mobileFocus.exiting ? ' mobile-focus-label--exiting' : ''
        return (
          <>
            <div
              className={`mobile-focus-label mobile-focus-label--name${exitingCls}`}
              style={{
                left: '50%',
                bottom: `${window.innerHeight - visualTop + 20}px`,
                width: `${visualWidth}px`,
                transform: 'translateX(-50%)',
              }}
            >
              {mobileFocus.name}
            </div>
            <div
              className={`mobile-focus-label mobile-focus-label--date${exitingCls}`}
              style={{
                left: '50%',
                top: `${visualTop + visualHeight + 20}px`,
                width: `${visualWidth}px`,
                transform: 'translateX(-50%)',
              }}
            >
              {mobileFocus.date}
            </div>
          </>
        )
      })()}
      {desktopFocus && (
        <div
          className={`desktop-focus-overlay${desktopFocus.exiting ? ' desktop-focus-overlay--exiting' : ''}`}
          onClick={exitDesktopFocus}
        />
      )}
      {desktopFocus && (() => {
        const r = desktopFocus.rect
        const scale = Math.min(
          (window.innerHeight * 0.8) / r.height,
          (window.innerWidth * 0.9) / r.width,
        )
        const visualWidth = r.width * scale
        const visualHeight = r.height * scale
        const visualLeft = (window.innerWidth - visualWidth) / 2
        const visualBottom = (window.innerHeight + visualHeight) / 2
        const exitingCls = desktopFocus.exiting ? ' desktop-focus-label--exiting' : ''
        return (
          <div
            className={`desktop-focus-labels${desktopFocus.exiting ? ' desktop-focus-labels--exiting' : ''}`}
            style={{
              left: `${visualLeft}px`,
              top: `${visualBottom + 12}px`,
              width: `${visualWidth}px`,
            }}
          >
            <span className={`desktop-focus-label desktop-focus-label--name${exitingCls}`}>
              {desktopFocus.name}
            </span>
            <span className={`desktop-focus-label desktop-focus-label--date${exitingCls}`}>
              {desktopFocus.date}
            </span>
          </div>
        )
      })()}
      {!isAboutPage && <DesignPanel />}
      {!isAboutPage && showScene && (
        <CoordinateScene
          points={points}
          originId={originId}
          thumbnailWidth={originTargetWidth}
          onZoomChange={setSceneZoom}
          exiting={phase === 'uncentering'}
        />
      )}
    </>
  )
}
