import { useEffect, useState } from 'react'
import ParticlePhoto from './ParticlePhoto'
import './AboutV2.css'

// About page (v2) — sandbox at #about-v2 while #about stays live.

const CONTACT_LINKS = [
  { label: 'Email', href: 'mailto:qitiancao@outlook.com' },
  { label: 'Twitter', href: 'https://x.com/bruce_CQT' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/qitian-bruce-cao/' },
  {
    label: 'Resume',
    href: 'https://drive.google.com/file/d/1qQ3BhrDJtzt9CG_FBqa_PFli2kZDScNV/view?usp=sharing',
  },
]

// `tile` backs logos that ship on a transparent canvas; Shopify's is baked in.
const EXPERIENCE = [
  {
    org: 'Shopify Product Design Studio',
    title: 'First Design Intern',
    logo: '/Logos/Shopify_1.png',
    photo: '/Experience/Shopify Experience.png',
  },
  {
    org: 'Google',
    title: 'Product Design Intern',
    logo: '/Logos/Google.png',
    tile: '#ffffff',
    photo: '/Experience/Google Experience.png',
  },
  {
    org: 'Fellou',
    title: 'Product Design Intern',
    logo: '/Logos/Fellou.png',
    tile: '#ffffff',
    photo: '/Experience/Fellou Experience.png',
  },
  {
    org: 'Silicon Valley School of Design',
    title: 'Product Design Fellow',
    logo: '/Logos/Svsd.png',
    tile: '#ffffff',
    photo: '/Experience/Svsd Experience.png',
  },
]

// Index 0 is the resting portrait; each experience photo follows in order, so
// hovering row i shows PHOTO_SOURCES[i + 1].
const BASE_PHOTO = '/Myself.png'
const PHOTO_SOURCES = [BASE_PHOTO, ...EXPERIENCE.map((e) => e.photo)]
const MOBILE_QUERY = '(max-width: 768px)'

// A logo that hasn't been dropped into /public/Logos yet leaves its tile empty
// rather than rendering a broken-image glyph.
const hideMissingLogo = (event) => {
  event.currentTarget.style.visibility = 'hidden'
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    // Belt and braces: some environments (and devtools viewport overrides)
    // resize without dispatching a matchMedia change event.
    window.addEventListener('resize', onChange)
    return () => {
      mql.removeEventListener('change', onChange)
      window.removeEventListener('resize', onChange)
    }
  }, [query])
  return matches
}

// Fixed design and particle settings for the About page.
const ABOUT_SETTINGS = {
  layout: {
    margin: 48,
    navGap: 36,
    photoRadius: 12,
    mobileMargin: 20,
    mobileNavGap: 72,
    mobilePhotoGap: 48,
    background: '#0F0F0F',
  },
  columnWidth: {
    // Width = the window-width ratio, held between min and max.
    // Set min and max to the same number for a fixed-width column.
    ratio: 0.24,
    min: 440,
    max: 720,
  },
  contact: {
    fontSize: 13,
    fontWeight: '300',
    lineHeight: 20,
    gap: 12,
    color: '#616161',
    hoverColor: '#ffffff',
    hoverShift: 8,
    hoverDuration: 400,
    mobileGap: 16,
    mobileFontSize: 16,
    mobileLineHeight: 24,
  },
  about: {
    showHeading: false,
    headingSize: 16,
    headingWeight: '400',
    headingLineHeight: 16,
    headingColor: '#404040',
    headingGap: 12,
    bodySize: 16,
    bodyWeight: '300',
    bodyLineHeight: 24,
    bodyColor: '#ffffff',
    paragraphGap: 16,
  },
  experience: {
    gapFromAbout: 48,
    rowGap: 20,
    rowLineHeight: 24,
    orgRoleGap: 4,
    orgSize: 16,
    orgWeight: '300',
    orgColor: '#ffffff',
    roleSize: 16,
    roleWeight: '300',
    roleColor: '#616161',
    logoSize: 40,
    logoRadius: 8,
    hoverShift: 12,
    hoverDuration: 400,
  },
  particles: {
    enabled: true,
    gap: 4,
    size: 3,
    entrySpread: 1200,
    entryStagger: 3000,
    entryFade: 250,
    stirRadius: 120,
    stirStrength: 2,
    stiffness: 170,
    damping: 9,
    bleed: 100,
    cornerRadius: 4,
    swapDuration: 700,
    swapScatter: 150,
    swapSwirl: 1400,
    swapChaos: 700,
  },
}

export default function AboutV2() {
  // 0 = resting portrait; i + 1 = the i-th experience's photo.
  const [activePhoto, setActivePhoto] = useState(0)
  const isMobile = useMediaQuery(MOBILE_QUERY)

  const { layout, columnWidth, contact, about, experience, particles } = ABOUT_SETTINGS

  const style = {
    '--dp-about-margin': `${layout.margin}px`,
    '--dp-about-nav-gap': `${layout.navGap}px`,
    '--dp-about-column-ratio': columnWidth.ratio,
    '--dp-about-column-min': `${columnWidth.min}px`,
    '--dp-about-column-max': `${columnWidth.max}px`,
    '--dp-about-photo-radius': `${layout.photoRadius}px`,
    '--dp-about-bg': layout.background,

    '--dp-about-link-size': `${contact.fontSize}px`,
    '--dp-about-link-weight': contact.fontWeight,
    '--dp-about-link-line-height': `${contact.lineHeight}px`,
    '--dp-about-link-gap': `${contact.gap}px`,
    '--dp-about-link-color': contact.color,
    '--dp-about-link-hover-color': contact.hoverColor,
    '--dp-about-link-hover-shift': `${contact.hoverShift}px`,
    '--dp-about-link-hover-duration': `${contact.hoverDuration}ms`,
    '--dp-about-mobile-link-gap': `${contact.mobileGap}px`,
    '--dp-about-mobile-link-size': `${contact.mobileFontSize}px`,
    '--dp-about-mobile-link-line-height': `${contact.mobileLineHeight}px`,
    '--dp-about-mobile-photo-gap': `${layout.mobilePhotoGap}px`,
    '--dp-about-mobile-margin': `${layout.mobileMargin}px`,
    '--dp-about-mobile-nav-gap': `${layout.mobileNavGap}px`,

    '--dp-about-heading-size': `${about.headingSize}px`,
    '--dp-about-heading-weight': about.headingWeight,
    '--dp-about-heading-line-height': `${about.headingLineHeight}px`,
    '--dp-about-heading-color': about.headingColor,
    '--dp-about-heading-gap': `${about.headingGap}px`,
    '--dp-about-body-size': `${about.bodySize}px`,
    '--dp-about-body-weight': about.bodyWeight,
    '--dp-about-body-line-height': `${about.bodyLineHeight}px`,
    '--dp-about-body-color': about.bodyColor,
    '--dp-about-paragraph-gap': `${about.paragraphGap}px`,

    '--dp-about-experience-gap': `${experience.gapFromAbout}px`,
    '--dp-about-row-gap': `${experience.rowGap}px`,
    '--dp-about-row-line-height': `${experience.rowLineHeight}px`,
    '--dp-about-org-role-gap': `${experience.orgRoleGap}px`,
    '--dp-about-org-size': `${experience.orgSize}px`,
    '--dp-about-org-weight': experience.orgWeight,
    '--dp-about-org-color': experience.orgColor,
    '--dp-about-role-size': `${experience.roleSize}px`,
    '--dp-about-role-weight': experience.roleWeight,
    '--dp-about-role-color': experience.roleColor,
    '--dp-about-logo-size': `${experience.logoSize}px`,
    '--dp-about-logo-radius': `${experience.logoRadius}px`,
    '--dp-about-role-hover-shift': `${experience.hoverShift}px`,
    '--dp-about-role-hover-duration': `${experience.hoverDuration}ms`,
  }

  return (
    <main className="about-v2" style={style}>
      <div className="about-v2__column">
        <div className="about-v2__links">
          {CONTACT_LINKS.map(({ label, href }) => (
            <a
              key={label}
              className="about-v2__link"
              href={href}
              target={href.startsWith('mailto:') ? undefined : '_blank'}
              rel="noopener noreferrer"
            >
              {label}
            </a>
          ))}
        </div>

        <div className="about-v2__bottom">
          <div>
            {about.showHeading && <h1 className="about-v2__heading">About</h1>}
            <p className="about-v2__copy">
              Hey - I’m Bruce Cao, a product &amp; interaction designer and
              sound engineer who thinks in rhythm and builds in motion.
            </p>
            <p className="about-v2__copy">
              I’m currently a fourth-year undergrad @Duke, studying Computer
              Science and Visual Media.
            </p>
          </div>

          <div className="about-v2__experience">
            {EXPERIENCE.map(({ org, title, logo, tile }, index) => (
              <div
                className="about-v2__role"
                key={org}
                onMouseEnter={() => setActivePhoto(index + 1)}
                onMouseLeave={() => setActivePhoto(0)}
              >
                <div className="about-v2__role-text">
                  <span className="about-v2__role-org">{org}</span>
                  <span className="about-v2__role-title">{title}</span>
                </div>
                <div
                  className="about-v2__role-logo"
                  style={tile ? { '--about-tile': tile } : undefined}
                >
                  <img src={logo} alt="" onError={hideMissingLogo} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="about-v2__frame">
        {particles.enabled && !isMobile ? (
          <ParticlePhoto
            sources={PHOTO_SOURCES}
            activeIndex={activePhoto}
            params={particles}
            radius={layout.photoRadius}
          />
        ) : (
          /* Phones get the plain photo: no canvas, no swap, and only this one
             image is fetched instead of all five. */
          <img className="about-v2__photo" src={BASE_PHOTO} alt="Bruce Cao" />
        )}
      </div>
    </main>
  )
}
