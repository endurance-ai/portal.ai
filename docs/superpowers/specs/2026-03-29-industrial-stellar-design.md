# MOODFIT "Industrial Stellar" Design Overhaul

## Overview

Complete visual redesign of MOODFIT from the current "Digital Atelier" (lavender/peach M3 theme) to an "Industrial Stellar" dark theme inspired by spacecraft cockpits, industrial blueprints, and metallic aesthetics.

**Design Philosophy**: "Mission Control for Fashion" — analyzing fashion through the lens of a spacecraft control panel. Vercel's minimalism meets industrial precision.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Accent Color | Stellar Amber `#F59E0B` | Interstellar warmth, spacecraft instrument glow |
| Base Tone | Dark `#09090B` | Spacecraft cockpit, maximum amber impact |
| Texture Style | Industrial Grid | Grid lines, corner brackets, monospace labels |
| Typography | Geist Sans + Geist Mono | Already in project, Vercel-native, mono for data |
| Result Layout | Accordion | 4-col product grid per item, expand/collapse |
| Analyzing Screen | Technical Readout | Terminal-style line-by-line typing |
| Language | English only | International feel, no Korean UI text |

## Color System

```
Background:     #09090B   — Page base (near-black)
Surface:        #18181B   — Cards, panels
Surface-dim:    #0f0f12   — Nested containers, product cards
Border:         #27272A   — Default borders
Border-active:  #F59E0B30 — Focused/active elements
Foreground:     #FAFAFA   — Primary text
Muted:          #A1A1AA   — Secondary text (brands, metadata)
Dimmed:         #71717A   — Tertiary text
Ghost:          #52525B   — Labels, hints, inactive
Accent:         #F59E0B   — Stellar Amber — CTAs, prices, active
Accent-dim:     #F59E0B60 — Inactive numbering
Accent-bg:      #F59E0B20 — Chip/badge backgrounds
```

## Typography

| Role | Font | Weight | Letter-spacing | Notes |
|------|------|--------|---------------|-------|
| Headings | Geist Sans | 800 | -0.6px | Tight, editorial |
| Body | Geist Sans | 500-600 | normal | Clean readability |
| Labels/System | Geist Mono | 700 | 1-1.5px | Uppercase, technical |
| Index Numbers | Geist Mono | 800 | normal | Amber color |
| Prices | Geist Mono or Sans | 700 | normal | Amber color |

## Industrial Grid Texture

Applied as a CSS pseudo-element or background on key containers:

- **Grid pattern**: 32px cells, `linear-gradient` using accent at 3% opacity
- **Corner brackets**: Positioned absolute `::before`/`::after` on image panels — 1px borders in `accent` at 25% opacity, top-left and bottom-right corners
- **System labels**: Monospace, uppercase, wide letter-spacing — e.g., `SYS.ANALYSIS // ACTIVE`, `01 // OUTER`

## Screen Specifications

### Header
- Fixed, dark background with backdrop-blur
- Logo: "MOODFIT" in Geist Sans 800, foreground color
- Minimal nav — user icon only, accent border on hover
- Thin bottom border (#27272A)

### Upload Screen
- Full-height centered layout
- Hero: "Drop your fit." (foreground) + "We'll read the vibe." (accent)
- Subtitle: ghost color, smaller
- Upload zone: dashed border (#27272A), dark surface bg, amber upload icon
- Mood chips: surface bg, border stroke, muted text — "Street", "Minimal", "Avant-garde"
- Subtle grid texture on background

### Analyzing Screen (Technical Readout)
- Two-column layout (60/40)
- **Left**: Uploaded image with corner brackets, scan overlay (amber tint), scanning line animation
- **Right**: Monospace text appearing line-by-line with typing effect:
  ```
  INITIALIZING SCAN...
  DETECTING SILHOUETTE...
  MAPPING FABRIC TEXTURE...
  EXTRACTING COLOR PALETTE...
  ANALYZING MOOD SIGNATURE...
  ```
- Loading dots in amber below text
- Skeleton cards at bottom with shimmer (dark surface bg)

### Result Screen (Accordion Layout)
- **Top bar**: Compact — mini image thumbnail + vibe signature (italic quote) + mood tag chips (amber-bg for top, surface for rest)
- **Garment Index**: Accordion list
  - **Collapsed row**: `[01] OUTER — Wool Overcoat [4 mini thumbs] ▼`
    - Index number in accent-dim mono, category in ghost mono, name in foreground
    - Mini 24px square thumbnails on right
    - Chevron indicator
  - **Expanded row**: Active border (#F59E0B30), shows:
    - Header: index + category + name + attribute chips (fit, fabric, color)
    - **4-column product grid**: Large square (1:1) product images
      - Card: surface-dim bg, border
      - Image: full-width square
      - Brand: mono uppercase muted
      - Title: foreground, 600 weight
      - Price: amber + Platform link (ghost, ↗ icon)
- **Color Map**: Compact palette bar with extracted colors
- **Actions**: "Try Another Look" (outline amber) + "Save This Look" (solid amber bg)
- First item auto-expanded on load

### Footer
- Dark surface background
- "MOODFIT" logo, "Powered by AI" in ghost mono
- Links in ghost, hover to accent
- Copyright text

## Component Patterns

- **No visible borders by default** — use surface color shifts for depth
- **Active states**: accent-30% border + optional `box-shadow: 0 0 20px accent/3%`
- **Hover on cards**: border lightens to `#3f3f46`, subtle `-translate-y-1`
- **Buttons**: `rounded-lg` (not fully round), amber for primary
- **Transitions**: 200-300ms ease for all interactive states
- **Grid background**: Applied to main content area, not inside cards

## Migration Notes

### Files to Modify
1. `src/app/globals.css` — Replace color tokens, remove moodfit-* colors
2. `src/components/layout/header.tsx` — Dark theme, simplified
3. `src/components/layout/footer.tsx` — Dark theme, monospace labels
4. `src/components/upload/upload-zone.tsx` — Dark upload area
5. `src/components/upload/mood-chips.tsx` — Dark chips, remove gradients
6. `src/components/analysis/analyzing-view.tsx` — Technical readout rewrite
7. `src/components/result/look-breakdown.tsx` — Accordion layout rewrite
8. `src/app/page.tsx` — Remove gradient blobs, update background

### What Gets Removed
- All `moodfit-*` color tokens
- Gradient pill chips (lavender/peach)
- SVG connector lines between image and items
- Hotspot dots on image
- Glassmorphism (white/70 + backdrop-blur) cards
- Background gradient blobs

### What Gets Added
- Industrial grid CSS utility class
- Corner bracket CSS utility
- Monospace system label pattern
- Accordion expand/collapse with framer-motion
- Technical readout typing animation
- New dark color token set
