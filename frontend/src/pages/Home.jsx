import { Link } from 'react-router-dom'
import './Home.css'

const categories = [
  {
    name: 'Skincare',
    description: 'Cleansers, hydration, and daily care for every routine.',
    icon: 'bi-droplet',
  },
  {
    name: 'Makeup',
    description: 'Considered color and complexion essentials for every look.',
    icon: 'bi-brush',
  },
  {
    name: 'Fragrance',
    description: 'Distinctive scents selected for everyday and special moments.',
    icon: 'bi-flower1',
  },
]

const storeBenefits = [
  {
    title: 'Thoughtfully curated',
    description: 'A focused collection designed to make discovery feel simple.',
    icon: 'bi-stars',
  },
  {
    title: 'Stock you can see',
    description: 'Clear availability information before you add an item to cart.',
    icon: 'bi-box-seam',
  },
  {
    title: 'Orders you can follow',
    description: 'Track each order from processing through delivery.',
    icon: 'bi-truck',
  },
]

function Home() {
  return (
    <div className="home-page">
      <section className="home-hero" aria-labelledby="home-heading">
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
      </section>

      <section className="home-section" aria-labelledby="categories-heading">
        <div className="home-section__intro">
          <p className="home-section__eyebrow">Find your ritual</p>
          <h2 id="categories-heading">Shop by category</h2>
          <p>
            Start with the collection that fits your routine, then explore the
            full product details and current availability.
          </p>
        </div>

        <div className="home-category-grid">
          {categories.map((category) => (
            <Link
              className="home-category-card"
              to="/products"
              key={category.name}
              aria-label={`Explore ${category.name} products`}
            >
              <span className="home-category-card__icon" aria-hidden="true">
                <i className={`bi ${category.icon}`} />
              </span>
              <span className="home-category-card__content">
                <strong>{category.name}</strong>
                <span>{category.description}</span>
              </span>
              <i
                className="bi bi-arrow-up-right home-category-card__arrow"
                aria-hidden="true"
              />
            </Link>
          ))}
        </div>
      </section>

      <section className="home-benefits" aria-labelledby="benefits-heading">
        <div className="home-benefits__heading">
          <p>Designed around confidence</p>
          <h2 id="benefits-heading">A clearer way to shop beauty.</h2>
        </div>

        <div className="home-benefits__grid">
          {storeBenefits.map((benefit) => (
            <article className="home-benefit" key={benefit.title}>
              <i className={`bi ${benefit.icon}`} aria-hidden="true" />
              <h3>{benefit.title}</h3>
              <p>{benefit.description}</p>
            </article>
          ))}
        </div>

        <Link className="home-benefits__link" to="/products">
          Browse all products
          <i className="bi bi-arrow-right" aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}

export default Home
