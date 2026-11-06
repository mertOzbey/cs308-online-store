import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Home from './pages/Home'
import Products from './pages/Products'
import Placeholder from './pages/Placeholder'

function App() {
  return (
    <div className="app-shell">
      <Navbar cartItemCount={0} />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/products" element={<Products />} />
          <Route path="/cart" element={<Placeholder title="Cart" />} />
          <Route path="/login" element={<Placeholder title="Login" />} />
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
