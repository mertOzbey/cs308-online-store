import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { registerAccount, signIn } from '../api/auth.js'
import './AuthPage.css'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMPTY_FORM = { fullName: '', taxId: '', email: '', homeAddress: '', password: '', confirmPassword: '' }

function validate(values, isRegister) {
  const errors = {}

  if (isRegister) {
    if (!values.fullName.trim()) errors.fullName = 'Please enter your full name.'
    if (!values.taxId.trim()) errors.taxId = 'Please enter your tax ID.'
    if (!values.homeAddress.trim()) errors.homeAddress = 'Please enter your home address.'
  }
  if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Please enter a valid email address.'
  }
  if (!values.password) {
    errors.password = 'Please enter your password.'
  } else if (isRegister && [...values.password].length < 12) {
    errors.password = 'Use at least 12 characters.'
  }
  if (isRegister && values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Passwords do not match.'
  }

  return errors
}

function AuthPage({ mode, onLogin, returnTo }) {
  const isRegister = mode === 'register'
  const navigate = useNavigate()
  const { state } = useLocation()
  const [values, setValues] = useState(() => ({
    ...EMPTY_FORM,
    email: isRegister ? '' : (state?.email ?? ''),
  }))
  const [errors, setErrors] = useState({})
  const [showPassword, setShowPassword] = useState(false)
  const [message, setMessage] = useState('')
  const [pending, setPending] = useState(false)

  function update(event) {
    const { name, value } = event.target
    setValues((previous) => ({ ...previous, [name]: value }))
    setErrors((previous) => ({
      ...previous,
      [name]: undefined,
      ...(name === 'password' ? { confirmPassword: undefined } : {}),
    }))
    setMessage('')
  }

  async function submit(event) {
    event.preventDefault()
    if (pending) return
    const nextErrors = validate(values, isRegister)
    setErrors(nextErrors)
    setMessage('')
    if (Object.keys(nextErrors).length > 0) return

    const credentials = { email: values.email.trim(), password: values.password }
    setPending(true)
    try {
      if (isRegister) {
        const user = await registerAccount({
          ...credentials,
          name: values.fullName.trim(),
          taxId: values.taxId.trim(),
          homeAddress: values.homeAddress.trim(),
        })
        navigate('/login', { replace: true, state: { registered: true, email: user.email } })
      } else {
        const user = await signIn(credentials)
        onLogin(user)
        navigate(returnTo, { replace: true })
      }
    } catch (error) {
      setMessage(error.message)
    } finally {
      setPending(false)
    }
  }

  function field({ name, label, type = 'text', autoComplete, hint, maxLength }) {
    const errorId = `${mode}-${name}-error`
    const id = `${mode}-${name}`
    const isPasswordField = type === 'password'
    const actualType = isPasswordField && showPassword ? 'text' : type

    return (
      <div className="auth-field" key={name}>
        <label className="auth-label" htmlFor={id}>{label}</label>
        <div className="auth-input-wrap">
          <input
            id={id}
            className={`auth-input${errors[name] ? ' auth-input--invalid' : ''}`}
            name={name}
            type={actualType}
            value={values[name]}
            onChange={update}
            autoComplete={autoComplete}
            autoCapitalize="off"
            aria-invalid={Boolean(errors[name])}
            aria-describedby={errors[name] ? errorId : undefined}
            placeholder={hint}
            maxLength={maxLength}
            disabled={pending}
          />
          {name === 'password' && (
            <button
              className="auth-toggle"
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`} aria-hidden="true" />
            </button>
          )}
        </div>
        {errors[name] && <p className="auth-error" id={errorId} role="alert">{errors[name]}</p>}
      </div>
    )
  }

  return (
    <section className="auth-layout" aria-labelledby="auth-page-title">
      <aside className="auth-editorial" aria-label="Sulina Exclusive brand message">
        <div className="auth-editorial__frame">
          <div className="auth-editorial__top">SULINA EXCLUSIVE <span>✦</span> THE BEAUTY EDIT</div>
          <div className="auth-editorial__body">
            <span className="auth-eyebrow">CURATED FOR YOU</span>
            <h2>Where beauty feels personal.</h2>
            <p>Discover exquisite skincare, makeup, and everyday rituals, chosen with care.</p>
            <div className="auth-editorial__rule" />
            <span className="auth-editorial__signature">A more beautiful everyday.</span>
          </div>
          <div className="auth-editorial__bottom">EST. 2026 &nbsp; • &nbsp; SULINA EXCLUSIVE</div>
        </div>
      </aside>

      <div className="auth-panel">
        <div className="auth-panel__inner">
          <Link className="auth-back" to="/"><i className="bi bi-arrow-left" aria-hidden="true" /> Back to shop</Link>
          <p className="auth-eyebrow">YOUR SULINA ACCOUNT</p>
          <h1 id="auth-page-title">{isRegister ? 'Create an account' : 'Welcome back'}</h1>
          <p className="auth-subtitle">{isRegister
            ? 'Join Sulina Exclusive to begin your beauty journey.'
            : 'Sign in to continue your beauty journey.'}</p>

          <form className="auth-form" onSubmit={submit} noValidate>
            {!isRegister && state?.registered && <p className="auth-notice" role="status">Account created. Sign in to continue.</p>}
            {isRegister && field({ name: 'fullName', label: 'Full name', autoComplete: 'name', hint: 'Your full name', maxLength: 200 })}
            {field({ name: 'email', label: 'Email address', type: 'email', autoComplete: 'email', hint: 'you@example.com', maxLength: 254 })}
            {isRegister && field({ name: 'taxId', label: 'Tax ID', maxLength: 100 })}
            {isRegister && field({ name: 'homeAddress', label: 'Home address', autoComplete: 'street-address', maxLength: 1000 })}
            {field({ name: 'password', label: 'Password', type: 'password', autoComplete: isRegister ? 'new-password' : 'current-password', hint: isRegister ? 'At least 12 characters' : 'Enter your password' })}
            {isRegister && field({ name: 'confirmPassword', label: 'Confirm password', type: 'password', autoComplete: 'new-password', hint: 'Repeat your password' })}

            <button className="auth-submit" type="submit" disabled={pending}>
              {isRegister ? 'Create account' : 'Sign in'} <i className="bi bi-arrow-right" aria-hidden="true" />
            </button>
            {message && <p className="auth-notice" role="alert">{message}</p>}
          </form>

          <p className="auth-switch">
            {isRegister ? 'Already have an account?' : 'New to Sulina Exclusive?'}{' '}
            <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link>
          </p>
        </div>
      </div>
    </section>
  )
}

export function LoginPage({ onLogin, returnTo = '/products' }) {
  return <AuthPage mode="login" onLogin={onLogin} returnTo={returnTo} />
}

export function RegisterPage() {
  return <AuthPage mode="register" />
}
