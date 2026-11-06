# Sulina Exclusive UI Style Guide

This guide defines the shared visual language for the Sulina Exclusive storefront.
It documents the brand tokens already present in `frontend/src/styles/theme.css`
without changing the frontend setup, shared layout components, or another
contributor's implementation.

## Design principles

1. **Elegant, not ornamental.** Use the editorial typeface and warm palette to
   communicate a premium cosmetics brand, while keeping controls and product
   information easy to scan.
2. **Product-first.** Decoration must not compete with product names, prices,
   stock information, or primary actions.
3. **Consistent.** Reuse the semantic color, typography, spacing, radius, and
   shadow tokens instead of adding one-off values.
4. **Responsive by default.** Every layout must work from a 320 px viewport to
   a wide desktop without horizontal scrolling.
5. **Accessible.** Text, controls, keyboard navigation, and motion must meet the
   accessibility rules in this guide.

## Color palette

Use semantic tokens in components. Raw hex values are included here for design
reference only.

| Role | Token | Value | Intended use |
| --- | --- | --- | --- |
| Primary | `--color-primary` | `#77223D` | Primary buttons, active links, important accents |
| Primary hover | `--color-primary-dark` | `#5C1A2F` | Hover and active states for primary controls |
| Primary tint | `--color-primary-light` | `#F7E9EE` | Selected or highlighted light surfaces |
| Accent | `--color-accent` | `#C45B7A` | Decorative accents and large-format emphasis |
| Accent hover | `--color-accent-hover` | `#A84868` | Accessible accent action background with white text |
| Gold | `--color-gold` | `#B68D70` | Premium-detail accents on dark surfaces |
| Page background | `--color-bg` | `#FBF6F8` | Main page background |
| Surface | `--color-surface` | `#FFFFFF` | Cards, forms, and raised content |
| Primary text | `--color-text` | `#3A2430` | Body copy and headings |
| Muted text | `--color-text-muted` | `#7A6570` | Secondary information and helper text |
| Border | `--color-border` | `#EDDFE6` | Dividers, card edges, and form borders |
| Danger | `--color-danger` | `#9B2C2C` | Destructive actions and error messages |

### Contrast requirements

The following combinations were checked using the WCAG relative-luminance
formula:

| Foreground / background | Contrast | Usage |
| --- | ---: | --- |
| Primary `#77223D` / white | 10.09:1 | Passes AAA for normal text |
| Text `#3A2430` / background `#FBF6F8` | 13.32:1 | Passes AAA for normal text |
| Muted text `#7A6570` / background `#FBF6F8` | 5.01:1 | Passes AA for normal text |
| Gold `#B68D70` / plum `#3A2430` | 4.77:1 | Passes AA for normal text |
| White / accent `#C45B7A` | 4.10:1 | Use only for large text or decorative content |
| White / accent hover `#A84868` | 5.54:1 | Passes AA for normal text |

Do not place normal-size white text on `--color-accent`. Use
`--color-accent-hover` for an accent-colored action with white text, or use the
primary burgundy treatment.

## Typography

| Role | Family | Weight | Recommended size |
| --- | --- | ---: | ---: |
| Display / hero | Cormorant Garamond | 600-700 | 36-64 px, responsive |
| Page heading | Cormorant Garamond | 600 | 32-48 px |
| Section heading | Cormorant Garamond | 600 | 24-36 px |
| Body | Source Sans 3 | 400 | 16 px |
| Emphasized body | Source Sans 3 | 600 | 16 px |
| Supporting text | Source Sans 3 | 400-500 | 14 px minimum |
| Eyebrow / label | Source Sans 3 | 600 | 12-14 px, uppercase sparingly |

- Keep body copy at least 16 px where space allows.
- Keep line length between 45 and 75 characters for descriptive text.
- Use the heading font for headings and brand moments, not form fields or long
  paragraphs.
- Do not use all caps for sentences. Reserve it for short labels with increased
  letter spacing.

## Spacing and layout

Use a 4 px base unit and prefer the following spacing steps:

| Step | Value | Typical use |
| --- | ---: | --- |
| `1` | 4 px | Icon and label micro-spacing |
| `2` | 8 px | Closely related inline elements |
| `3` | 12 px | Compact control spacing |
| `4` | 16 px | Default component padding and mobile gutter |
| `6` | 24 px | Card padding and grid gaps |
| `8` | 32 px | Subsection separation |
| `12` | 48 px | Default section padding |
| `16` | 64 px | Major desktop section separation |

- Maximum content width: `1140px` (`--layout-max-width`).
- Mobile horizontal gutter: `16px`.
- Tablet and desktop horizontal gutter: `24px` where space allows.
- Default section separation: `48px`; large marketing sections may use `64px`.
- Prefer CSS Grid for repeated cards and Flexbox for one-dimensional alignment.
- Keep product cards equal in height within the same row.

### Responsive breakpoints

Follow the Bootstrap breakpoints already used by the frontend:

| Name | Minimum width | Expected layout |
| --- | ---: | --- |
| `xs` | 0 px | Single column; compact navigation and controls |
| `sm` | 576 px | Wider cards and optional two-column content |
| `md` | 768 px | Two-column sections and expanded footer |
| `lg` | 992 px | Desktop navigation and multi-column product grids |
| `xl` | 1200 px | Full `1140px` content container |

The layout must also remain usable at 320 px even though it is below the first
named breakpoint.

## Shape, elevation, and imagery

- Use `--radius-sm` for form controls and compact buttons.
- Use `--radius-md` for cards and content panels.
- Use `--shadow-sm` for persistent navigation and subtle separation.
- Use `--shadow-md` only for elevated cards, menus, or promotional panels.
- Avoid combining a heavy shadow, strong border, and colored background on the
  same component.
- Product images should use a consistent aspect ratio and `object-fit: cover`.
- Logos must use the supplied variants from `frontend/public/brand/`; do not
  recolor or stretch them.

## Component rules

### Buttons and links

- One primary action per section.
- Primary buttons use burgundy with white text.
- Secondary actions use a light surface with a burgundy border and text.
- Text links must remain visually distinguishable from surrounding copy without
  relying on color alone when embedded in paragraphs.
- Disabled controls must remain readable and must not respond to pointer or
  keyboard activation.

### Cards

- Use a white surface, the shared border color, and one radius value.
- Keep title, supporting information, price, stock, and action order consistent.
- Do not communicate stock state by color alone; include text such as
  “In stock” or “Out of stock.”

### Forms

- Every input needs a persistent label; a placeholder is not a label.
- Display validation feedback next to the relevant field.
- Required fields must be identified in text and programmatically.
- Preserve user-entered values after validation errors.

## Homepage layout blueprint (SCRUM-66)

The homepage should follow this order without duplicating the product-listing
task:

1. **Hero:** concise brand statement and a primary link to `/products`.
2. **Shop by category:** responsive navigation cards for the main catalog
   categories; these are navigation, not a second product listing.
3. **Brand benefits:** three short, factual benefits such as curated products,
   secure checkout, and delivery tracking.
4. **Featured collection entry:** a lightweight call-to-action that sends users
   to the product listing rather than owning its data-fetching logic.

Navbar, footer, product cards, API integration, and product-listing behavior
remain owned by their existing components and tasks. The homepage must consume
those shared pieces without copying or replacing them.

## Accessibility checklist

- All interactive elements are reachable and operable by keyboard.
- Focus is always visible and is not indicated by color alone.
- Normal text meets a contrast ratio of at least 4.5:1; large text meets 3:1.
- Controls have a minimum target size of approximately 44 by 44 px where
  practical.
- Images have useful alternative text, or empty alternative text when purely
  decorative.
- Heading levels form a logical hierarchy with one page-level `h1`.
- Motion respects `prefers-reduced-motion`.
- Layout remains readable at 200% zoom and does not introduce horizontal
  scrolling at 320 px.
- Loading, empty, error, and unavailable states are communicated with text.

## Definition of done for SCRUM-63

- The palette, type scale, spacing, layout, responsive behavior, and component
  rules are documented.
- Color usage includes verified contrast guidance.
- The guide matches the existing Sulina brand assets and theme tokens.
- The guide defines boundaries for the homepage and product-listing work.
- No existing contributor implementation is replaced or modified by this task.
