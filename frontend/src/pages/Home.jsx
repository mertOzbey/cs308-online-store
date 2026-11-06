import { Link } from 'react-router-dom'
import './Home.css'

function Home() {
  return (
    <section className="home-page" aria-labelledby="home-heading">
      <div className="home-hero">
        <div className="home-hero__content">
          <p className="home-hero__eyebrow">Sulina Exclusive</p>
          <h1 id="home-heading" className="home-hero__title">
            Beauty, curated for your everyday ritual.
          </h1>
          <p className="home-hero__description">
            Explore a considered collection of cosmetics and skincare, with
            clear product details and stock information before you shop.
          </p>

          <Link className="btn btn-primary home-hero__action" to="/products">
            Explore the collection
            <i className="bi bi-arrow-right" aria-hidden="true" />
          </Link>

          <ul className="home-hero__highlights" aria-label="Store highlights">
            <li>
              <i className="bi bi-stars" aria-hidden="true" />
              Curated beauty
            </li>
            <li>
              <i className="bi bi-box-seam" aria-hidden="true" />
              Clear stock details
            </li>
          </ul>
        </div>

        <div className="home-hero__visual" aria-hidden="true">
          <span className="home-hero__orb home-hero__orb--large" />
          <span className="home-hero__orb home-hero__orb--small" />
          <div className="home-hero__brand-card">
            <img src="/brand/icon-transparent.svg" alt="" />
            <span>Exclusive beauty, thoughtfully selected.</span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default Home
