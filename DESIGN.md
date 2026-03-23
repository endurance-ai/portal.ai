# Design System Strategy: The Digital Atelier

## 1. Overview & Creative North Star
This design system is built upon the North Star of **"The Digital Atelier."** Much like a high-end fashion house, the interface must feel curated, bespoke, and ethereal. We are moving beyond the "standard SaaS" look by rejecting rigid, boxy layouts in favor of an editorial experience that breathes. 

The system utilizes high-contrast typography scales and generous whitespace (inspired by Vercel and Linear) to establish a sense of authority and calm. By leveraging **intentional asymmetry**—such as off-grid imagery placement and overlapping glass layers—we break the "template" feel, ensuring the UI feels like a premium fashion tool rather than a generic utility.

## 2. Colors: The Tonal Spectrum
Our palette is a sophisticated blend of soft lavenders and muted peaches, grounded by a clean, architectural grayscale.

### The "No-Line" Rule
**Explicit Instruction:** Traditional 1px solid borders for sectioning are prohibited. Boundaries must be defined solely through background color shifts or tonal transitions. To separate a sidebar from a main content area, place a `surface-container-low` section against a `surface` background. This creates a "soft-edge" architecture that feels modern and expensive.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of materials. 
- **Base Layer:** `surface` (#f8f9fb).
- **Secondary Areas:** `surface-container-low` (#f2f4f6) for subtle grouping.
- **Interactive Elements:** `surface-container-lowest` (#ffffff) for cards to provide a "lifted" appearance.
- **Nesting:** When placing a card within a section, use the tiering logic: a `surface-container-lowest` card should sit inside a `surface-container-low` section.

### The "Glass & Gradient" Rule
To inject "soul" into the interface:
- **Floating Elements:** Use `surface-container-lowest` with an opacity of 70% and a `backdrop-blur` of 20px to create a glassmorphism effect.
- **Signature Gradients:** For primary CTAs and hero highlights, utilize a linear gradient transitioning from `primary` (#6e3bd8) to `primary-container` (#cbb6ff).

## 3. Typography: Editorial Authority
We utilize **Inter** as our geometric foundation. The hierarchy is designed to mimic a high-end lookbook.

*   **Display & Headlines:** Use `display-lg` and `headline-lg` with a "tight" letter-spacing (-0.02em) and bold weights. This provides the "editorial punch" required for fashion analysis.
*   **Body:** `body-md` is our workhorse. Ensure a line-height of 1.6 for maximum readability against white space.
*   **Subtext:** Use `on-surface-variant` (#5a6063) for secondary metadata. This muted gray prevents the UI from looking cluttered and keeps the focus on primary content.

## 4. Elevation & Depth: Tonal Layering
Depth in this design system is achieved through "Tonal Layering" rather than heavy drop shadows.

*   **The Layering Principle:** Place `surface-container-lowest` cards on `surface-container-low` backgrounds. The contrast is enough to define the shape without the need for visual "noise."
*   **Ambient Shadows:** Where a floating effect is vital (e.g., a modal or dropdown), use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(46, 51, 54, 0.06);`. The shadow color must be a tinted version of `on-surface` at a very low opacity (4–8%) to mimic natural light.
*   **The "Ghost Border" Fallback:** If a container requires a border for accessibility, use the `outline-variant` token at 20% opacity. **Never use 100% opaque borders.**
*   **Glassmorphism:** Apply a subtle `outline` (#767b7f) at 10% opacity to the edges of glass containers to simulate the "catch-light" on the edge of a pane of glass.

## 5. Components

### Buttons
- **Primary:** Gradient background (`primary` to `primary-container`), white text (`on-primary`), `full` roundedness. 
- **Secondary:** `surface-container-high` background with `on-surface` text. No border.
- **States:** On hover, increase the gradient saturation. On click, scale the button down slightly (98%) for a tactile, "springy" feel.

### Gradient Pill Chips
Used for fashion "moods" or tags. Use a soft pastel gradient (Lavender `primary-container` to Peach `secondary-container`) with `label-md` typography. Always use `full` roundedness.

### Dash-Upload Areas
For the AI image uploaders, use a `1.5` (0.5rem) dashed stroke using the `outline-variant` token. The background should be `surface-container-low`. This is the only exception to the "No-Line" rule, serving as a functional affordance for "drop zones."

### Input Fields
Avoid the "box" look. Use `surface-container-highest` with a `none` border, and a `sm` (0.25rem) corner radius. When focused, transition the background to `surface-container-lowest` and add a subtle `primary` ghost-border (20% opacity).

### Cards & Lists
**Strict Rule:** No dividers. Use `spacing-6` (2rem) of vertical white space to separate list items, or alternating background tints (`surface` vs `surface-container-low`).

### AI Mood Indicator (Unique Component)
A floating glass orb or card using a mesh gradient of `primary`, `secondary`, and `tertiary`. It should use the `glassmorphism` blur effect to feel like it is "analyzing" the content beneath it.

## 6. Do's and Don'ts

### Do:
*   **Do** use asymmetrical margins. For example, a wider left margin than right can make a landing page feel like a magazine spread.
*   **Do** embrace "White Space as a Feature." If a layout feels cramped, double the spacing token (e.g., move from `8` to `16`).
*   **Do** use `primary` and `secondary` tints in shadows to keep the "light theme" feeling vibrant rather than muddy.

### Don't:
*   **Don't** use pure black (#000000) for text. Always use `on-surface` (#2e3336) to maintain the soft aesthetic.
*   **Don't** use standard `0.5rem` corners for everything. Use `full` for interactive chips and `xl` (1.5rem) for large content cards to create a "friendly" but high-end silhouette.
*   **Don't** add shadows to every card. Only shadow the "Active" or "Floating" state.
*   **Don't** use high-contrast dividers. If you must separate content, use a `px` height `surface-variant` line at 30% opacity.