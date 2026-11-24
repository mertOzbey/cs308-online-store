import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchCategories } from '../api/products.js'
import './Home.css'

const categoryDetails = {
  skincare: {
    description: 'Cleansers, hydration, and daily care for every routine.',
    icon: 'bi-droplet',
  },
  makeup: {
    description: 'Considered color and complexion essentials for every look.',
    icon: 'bi-brush',
  },
  fragrance: {
    description: 'Distinctive scents selected for everyday and special moments.',
    icon: 'bi-flower1',
  },
}

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
    title: 'Find what fits',
    description: 'Compare products by price and narrow your search by category.',
    icon: 'bi-search',
  },
]

function Home() {
  const [categories, setCategories] = useState([])

  useEffect(() => {
    const controller = new AbortController()
    fetchCategories({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setCategories(data)
      })
      .catch(() => {
        // The link to browse all products is available if categories cannot load.
      })
    return () => controller.abort()
  }, [])

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

      {categories.length > 0 && (
        <section className="home-section" aria-labelledby="categories-heading">
          <div className="home-section__intro">
            <p className="home-section__eyebrow">Find your ritual</p>
            <h2 id="categories-heading">Shop by category</h2>
            <p>Explore products and check their current availability.</p>
          </div>

          <div className="home-category-grid">
            {categories.map(({ id, name }) => {
              const details = categoryDetails[name.toLowerCase()]
              return (
                <Link
                  className="home-category-card"
                  to={`/products?${new URLSearchParams({ category: String(id) })}`}
                  key={id}
                  aria-label={`Explore ${name} products`}
                >
                  <span className="home-category-card__icon" aria-hidden="true">
                    <i className={`bi ${details?.icon ?? 'bi-grid'}`} />
                  </span>
                  <span className="home-category-card__content">
                    <strong>{name}</strong>
                    {details?.description && <span>{details.description}</span>}
                  </span>
                  <i
                    className="bi bi-arrow-up-right home-category-card__arrow"
                    aria-hidden="true"
                  />
                </Link>
              )
            })}
          </div>
        </section>
      )}

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
