# Sulina Exclusive — Web Brand Kit

Based on the approved *sulina exclusive* luxury cosmetics wordmark. All SVG variants contain **editable vector paths** (not embedded raster images or external font dependencies). PNG and WebP files have transparent backgrounds unless specified otherwise.

## Suggested use

| File | Recommended use |
| --- | --- |
| `logo-full-dark.svg` | Main brand identity on light backgrounds |
| `logo-full-light.svg` | Main brand identity on dark backgrounds |
| `logo-full-burgundy.svg` | Burgundy accent version |
| `logo-header-dark.svg` / `logo-header-light.svg` | Website navigation / shop header |
| `logo-wordmark.svg` | Tight spaces and mobile menu |
| `icon-dark.svg`, `icon-light.svg`, `icon-transparent.svg` | Mobile icon, app icon, profile |
| `favicon.ico`, `favicon-32x32.png`, `favicon-16x16.png` | Browser favicon |
| `apple-touch-icon.png` | iPhone homescreen bookmark icon |
| `android-chrome-192x192.png`, `android-chrome-512x512.png` | PWA icons |
| `social-share-light.png`, `social-share-dark.png` | Open Graph / social media previews (1200×630) |
| `PREVIEW.png` | Visual overview of the asset set |

## Color palette

- Espresso: `#2B211A`
- Ivory: `#FBF5EF`
- Burgundy: `#77223D`
- Gold: `#B68D70`

## Website HTML

```html
<!-- Light navbar -->
<img src="/assets/logo-header-dark.svg" alt="Sulina Exclusive" width="240" height="88" />

<!-- Dark navbar -->
<img src="/assets/logo-header-light.svg" alt="Sulina Exclusive" width="240" height="88" />

<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:image" content="https://your-domain.com/social-share-light.png">
```

## Responsive suggestion

Set `width: 160px–220px; height: auto;` on the header mark for desktop and `width: 125px–155px; height: auto;` on narrow mobile layouts. Use the square icon for favicons and app icons. Prefer SVG over PNG for UI. For transparent assets, don't place the dark mark on a dark page or vice versa.

## Vectorization note

This kit faithfully traces the design from the generated reference image into actual vector shapes. It is production-usable for a student website project. It is not a manually typeset original vector master; extremely zoomed-in curves may have small traced imperfections. For future commercial registration, consider a professional final lettering cleanup and a trademark search.
