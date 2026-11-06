import { useLocation } from 'react-router-dom'

function Placeholder({ title }) {
  const location = useLocation()

  return (
    <section>
      <h1
        style={{
          fontFamily: 'var(--font-heading)',
          fontSize: 'var(--font-size-display)',
        }}
      >
        {title}
      </h1>
      <p style={{ color: 'var(--color-text-muted)' }}>
        This page (<code>{location.pathname}</code>) is a placeholder for a
        future sprint.
      </p>
    </section>
  )
}

export default Placeholder
