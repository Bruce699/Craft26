import './Nav.css'

export default function Nav({ currentPage = 'craft' }) {
  return (
    <nav className={`nav-pill ${currentPage === 'about' ? 'nav-pill--fixed' : ''}`}>
      <span className="nav-pill__link" role="link" aria-disabled="true">
        Work
      </span>
      <a
        className={currentPage === 'craft' ? 'nav-pill__current' : 'nav-pill__link'}
        href="#craft"
      >
        Craft
      </a>
      <a
        className={currentPage === 'about' ? 'nav-pill__current' : 'nav-pill__link'}
        href="#about"
      >
        About
      </a>
    </nav>
  )
}
