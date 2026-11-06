# CS308 Frontend — Sulina Exclusive

React + Vite storefront for the Sulina Exclusive cosmetics shop.

## Stack (SCRUM-64 / SCRUM-65)

- React 19
- Vite
- Bootstrap 5
- React Router
- Bootstrap Icons

## Setup

```bash
cd frontend
nvm use   # Node 24 (see .nvmrc)
npm install
npm run dev
```

App runs at `http://localhost:5173`.

## Scripts

| Command           | Description              |
|-------------------|--------------------------|
| `npm run dev`     | Start Vite dev server    |
| `npm run build`   | Production build         |
| `npm run preview` | Preview production build |

## Structure

```
src/
  components/   # Navbar, Footer (SCRUM-65)
  pages/        # Route pages for layout demo
  styles/       # theme.css (Sulina brand tokens)
  App.jsx       # Main layout + routes
  main.jsx      # Bootstrap + Router bootstrap
public/
  brand/        # Sulina Exclusive web brand kit
```
