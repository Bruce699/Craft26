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
        Work
      </a>
      <span className="nav-pill__current">Craft</span>
      <a className="nav-pill__link" href="#">
        About
      </a>
    </nav>
  )
}
