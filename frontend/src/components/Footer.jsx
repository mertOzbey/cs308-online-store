import { Link } from 'react-router-dom'

function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      className="mt-auto"
      style={{
        backgroundColor: 'var(--color-footer-bg)',
        color: 'var(--color-footer-text)',
        paddingTop: 'var(--footer-padding-y)',
        paddingBottom: '1.5rem',
      }}
    >
      <div className="container" style={{ maxWidth: 'var(--layout-max-width)' }}>
        <div className="row g-4 pb-4 align-items-start">
          <div className="col-md-4">
            <Link to="/" aria-label="Sulina Exclusive home">
              <img
                src="/brand/logo-header-light.svg"
                alt="Sulina Exclusive"
                style={{ width: '180px', height: 'auto' }}
              />
            </Link>
            <p
              className="mt-3 mb-0"
              style={{ fontSize: 'var(--font-size-sm)', maxWidth: '18rem' }}
            >
              Luxury cosmetics and skincare — curated for everyday glow.
            </p>
          </div>

          <div className="col-6 col-md-4">
            <h6
              className="text-uppercase mb-3"
              style={{
                color: '#fff',
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--font-size-sm)',
                letterSpacing: 'var(--letter-spacing-wide)',
              }}
            >
              Help
            </h6>
            <ul className="list-unstyled mb-0 d-flex flex-column gap-2">
              <li>
                <Link to="/about" className="footer-link">
                  About
                </Link>
              </li>
              <li>
                <Link to="/contact" className="footer-link">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/faq" className="footer-link">
                  FAQ
                </Link>
              </li>
            </ul>
          </div>

          <div className="col-6 col-md-4">
            <h6
              className="text-uppercase mb-3"
              style={{
                color: '#fff',
                fontFamily: 'var(--font-heading)',
                fontSize: 'var(--font-size-sm)',
                letterSpacing: 'var(--letter-spacing-wide)',
              }}
            >
              Follow us
            </h6>
            <div className="d-flex gap-3">
              <a
                href="https://instagram.com"
                className="footer-social"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Instagram"
              >
                <i className="bi bi-instagram fs-5" aria-hidden="true" />
              </a>
              <a
                href="https://facebook.com"
                className="footer-social"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook"
              >
                <i className="bi bi-facebook fs-5" aria-hidden="true" />
              </a>
              <a
                href="https://pinterest.com"
                className="footer-social"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Pinterest"
              >
                <i className="bi bi-pinterest fs-5" aria-hidden="true" />
              </a>
              <a
                href="https://tiktok.com"
                className="footer-social"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="TikTok"
              >
                <i className="bi bi-tiktok fs-5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>

        <hr style={{ borderColor: 'rgba(251, 245, 239, 0.12)' }} />

        <p
          className="mb-0 text-center"
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          &copy; {year} Sulina Exclusive. All rights reserved.
        </p>
      </div>
    </footer>
  )
}

export default Footer
