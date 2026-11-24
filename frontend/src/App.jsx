import { useEffect, useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import ProductListPage from './pages/ProductListPage.jsx'
import Placeholder from './pages/Placeholder'
import CartPage from './pages/CartPage.jsx'
import { LoginPage, RegisterPage } from './pages/AuthPage.jsx'
import { useCart } from './hooks/useCart.js'
import { getAccount, signOut } from './api/auth.js'

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
          <Route path="/cart" element={<CartPage cart={cart} />} />
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
