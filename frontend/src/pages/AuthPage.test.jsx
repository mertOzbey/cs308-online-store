// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom/vitest'
import { LoginPage, RegisterPage } from './AuthPage.jsx'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

function renderPage(Component) {
  render(<MemoryRouter><Component /></MemoryRouter>)
}

it('shows login form and its registration link', () => {
  renderPage(LoginPage)
  expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', '/register')
})

it('prevents empty login submission and shows validation errors', () => {
  renderPage(LoginPage)
  fireEvent.click(screen.getByRole('button', { name: /Sign in/i }))
  expect(screen.getByText('Please enter a valid email address.')).toBeInTheDocument()
  expect(screen.getByText('Please enter your password.')).toBeInTheDocument()
})

it('rejects registration when the passwords differ', () => {
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  renderPage(RegisterPage)
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada Example' } })
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByLabelText('Tax ID'), { target: { value: '001' } })
  fireEvent.change(screen.getByLabelText('Home address'), { target: { value: 'Test street 1' } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password2026!' } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'Password2027!' } })
  fireEvent.click(screen.getByRole('button', { name: /Create account/i }))
  expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
  expect(fetchSpy).not.toHaveBeenCalled()
})

it('toggles login password visibility', () => {
  renderPage(LoginPage)
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
  expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
})
