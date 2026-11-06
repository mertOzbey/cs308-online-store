import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'

function Navbar({ cartItemCount = 0 }) {
  const [isOpen, setIsOpen] = useState(false)

  const closeMenu = () => setIsOpen(false)

  return (
    <nav
      className="navbar navbar-expand-lg sticky-top"
      style={{
        backgroundColor: 'var(--color-navbar-bg)',
        minHeight: 'var(--navbar-height)',
        borderBottom: '1px solid var(--color-border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <div className="container" style={{ maxWidth: 'var(--layout-max-width)' }}>
        <Link
          className="navbar-brand d-flex align-items-center py-1"
          to="/"
          onClick={closeMenu}
          aria-label="Sulina Exclusive home"
        >
          <img
            src="/brand/logo-header-dark.svg"
            alt="Sulina Exclusive"
            className="d-none d-sm-block"
            style={{ width: '180px', height: 'auto' }}
          />
          <img
            src="/brand/logo-wordmark.svg"
            alt="Sulina Exclusive"
            className="d-sm-none"
            style={{ width: '130px', height: 'auto' }}
          />
        </Link>

        <button
          className="navbar-toggler border-0"
          type="button"
          aria-controls="mainNavbar"
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
          onClick={() => setIsOpen((open) => !open)}
          style={{ color: 'var(--color-plum)' }}
        >
          <i className={`bi ${isOpen ? 'bi-x-lg' : 'bi-list'} fs-3`} />
        </button>

        <div
          className={`collapse navbar-collapse ${isOpen ? 'show' : ''}`}
          id="mainNavbar"
        >
          <ul className="navbar-nav me-auto mb-2 mb-lg-0 gap-lg-1">
            <li className="nav-item">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `nav-link px-3 ${isActive ? 'fw-semibold' : ''}`
                }
                style={{ color: 'var(--color-navbar-link)' }}
                onClick={closeMenu}
              >
                Home
              </NavLink>
            </li>
            <li className="nav-item">
              <NavLink
                to="/products"
                className={({ isActive }) =>
                  `nav-link px-3 ${isActive ? 'fw-semibold' : ''}`
                }
                style={{ color: 'var(--color-navbar-link)' }}
                onClick={closeMenu}
              >
                Products
              </NavLink>
            </li>
          </ul>

          <form
            className="d-flex my-3 my-lg-0 me-lg-3"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <div className="input-group">
              <input
                type="search"
                className="form-control"
                placeholder="Search beauty products..."
                aria-label="Search beauty products"
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                }}
              />
              <button
                className="btn btn-primary"
                type="submit"
                aria-label="Submit search"
              >
                <i className="bi bi-search" aria-hidden="true" />
              </button>
            </div>
          </form>

          <div className="d-flex align-items-center gap-3 pb-3 pb-lg-0">
            <Link
              to="/cart"
              className="position-relative text-decoration-none"
              aria-label={`Cart with ${cartItemCount} items`}
              onClick={closeMenu}
              style={{ color: 'var(--color-navbar-link)' }}
            >
              <i className="bi bi-bag fs-4" aria-hidden="true" />
              {cartItemCount > 0 && (
                <span
                  className="position-absolute top-0 start-100 translate-middle badge rounded-pill"
                  style={{
                    backgroundColor: 'var(--color-badge)',
                    fontSize: '0.65rem',
                  }}
                >
                  {cartItemCount > 99 ? '99+' : cartItemCount}
                </span>
              )}
            </Link>

            <Link
              to="/login"
              className="btn btn-sm btn-primary px-3"
              onClick={closeMenu}
            >
              Login
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
