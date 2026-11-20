import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import ProductListPage from './pages/ProductListPage.jsx'
import Placeholder from './pages/Placeholder'
import CartPage from './pages/CartPage.jsx'
import { LoginPage, RegisterPage } from './pages/AuthPage.jsx'
import { useCart } from './hooks/useCart.js'

function App() {
  const cart = useCart()
  return (
    <div className="app-shell">
      <Navbar cartItemCount={cart.count} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<ProductListPage onAddToCart={cart.addItem} cartBusy={cart.busy} cartMessage={cart.message} />} />
          <Route path="/cart" element={<CartPage cart={cart} />} />
          <Route path="/login" element={<LoginPage />} />
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
