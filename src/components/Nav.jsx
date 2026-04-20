import './Nav.css'

export default function Nav() {
  return (
    <nav className="nav-pill">
      <a
        className="nav-pill__link"
        href="https://bruce-cao.com"
        target="_blank"
        rel="noopener noreferrer"
      >
        Site 25
      </a>
      <span className="nav-pill__current">Craft 26</span>
    </nav>
  )
}
