import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import ProductListPage from './pages/ProductListPage.jsx'
import Placeholder from './pages/Placeholder'
import CartPage from './pages/CartPage.jsx'
import CheckoutPage from './pages/CheckoutPage.jsx'
import { LoginPage, RegisterPage } from './pages/AuthPage.jsx'
import { useCart } from './hooks/useCart.js'
import { getAccount, signOut } from './api/auth.js'
import { submitCheckout } from './api/checkout.js'

function CheckoutRoute({ account, cart }) {
  if (account === undefined) {
    return <p role="status">Checking your session…</p>
  }

  if (!account) {
    return <Navigate to="/login" replace state={{ returnTo: '/checkout' }} />
  }

  return (
    <CheckoutPage
      cart={cart}
      submitCheckout={submitCheckout}
      onSuccess={() => cart.clearCart()}
    />
  )
}

function App() {
  const cart = useCart()
  const [account, setAccount] = useState(undefined)

  useEffect(() => {
    const controller = new AbortController()
    getAccount(controller.signal)
      .catch(() => null)
      .then((user) => {
        if (!controller.signal.aborted) {
          setAccount((current) => current === undefined ? user : current)
        }
      })
    return () => controller.abort()
  }, [])

  async function handleSignOut() {
    await signOut()
    setAccount(null)
  }

  return (
    <div className="app-shell">
      <Navbar cartItemCount={cart.count} account={account} onSignOut={handleSignOut} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<ProductListPage onAddToCart={cart.addItem} cartBusy={cart.busy} cartMessage={cart.message} />} />
          <Route path="/cart" element={<CartPage cart={cart} account={account} />} />
          <Route path="/checkout" element={<CheckoutRoute account={account} cart={cart} />} />
          <Route path="/login" element={<LoginPage onLogin={setAccount} returnTo={cart.count > 0 ? '/cart' : '/products'} />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/about" element={<Placeholder title="About" />} />
          <Route path="/contact" element={<Placeholder title="Contact" />} />
          <Route path="/faq" element={<Placeholder title="FAQ" />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export default App
