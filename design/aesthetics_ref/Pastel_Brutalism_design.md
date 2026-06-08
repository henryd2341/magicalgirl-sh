# Pastel Brutalism Design Reference

Pastel Brutalism is a contemporary design aesthetic that fuses the raw,
unapologetic structural language of brutalist design with a softened,
candy-toned color palette. Where traditional web brutalism reveled in
monochrome harshness, exposed grids, and deliberately unpolished
interfaces, Pastel Brutalism retains all of that structural honesty
while swapping the aggression for warmth. The result is a style that
feels simultaneously bold and approachable -- thick black borders and
hard-offset box shadows sit atop backgrounds of lavender, mint, baby
pink, and buttercream, creating a visual tension that is both playful
and architecturally rigorous.

---

## Overview

Pastel Brutalism emerged as a natural evolution of the neobrutalism
(also called neubrutalism) trend that gained significant traction in web
and UI design from 2020 onward. Platforms like Gumroad popularized the
neobrutalist look -- thick black outlines, flat color fills, hard drop
shadows with zero blur, and a rejection of the glossy, gradient-heavy
aesthetic that dominated the 2010s. As the style matured, designers
began exploring a softer variant: retaining the structural DNA of
brutalism (blocky layouts, exposed grid mechanics, stark typographic
hierarchy, zero-blur shadows) while replacing the aggressive
primary-color palettes with pastels, muted tones, and candy hues. This
"soft brutalism" subgenre is what we now call Pastel Brutalism.

The aesthetic draws philosophical inspiration from architectural
brutalism, where raw concrete (beton brut) was left exposed rather than
hidden behind decorative facades. In the digital translation, this means
UI elements do not pretend to be something they are not. Buttons look
like buttons -- chunky, bordered, obviously clickable. Cards are flat
rectangles with visible edges. Shadows are hard and offset, as if the
element were a physical cutout hovering above the page. There is no
attempt at photorealism, no subtle gradients mimicking depth, no
neumorphic softness. The honesty is structural.

What makes Pastel Brutalism distinctive is the emotional register that
the color palette introduces. Pastels -- soft pinks, lilacs, sage
greens, powder blues, peachy corals -- carry associations of gentleness,
nostalgia, and playfulness. When these tones fill the rigid, angular
containers of brutalist layout, the contrast creates something
memorable: designs that feel both strong and tender, confident and
friendly. The thick black borders act as a grounding force, preventing
the pastels from reading as insipid or precious. Conversely, the pastels
prevent the brutalist structure from feeling hostile or inaccessible.

This aesthetic has found particular traction in startups,
creator-economy platforms, portfolio sites, educational tools, and
lifestyle brands -- contexts where approachability matters but generic
corporate smoothness feels inauthentic. It pairs naturally with bold,
oversized display typography, generous whitespace, and a willingness to
let individual UI elements breathe within their stark frames. The
overall impression is of a design that takes its structure seriously but
does not take itself too seriously.

---

## Visual Characteristics

### Core Design Traits

- **Thick black borders (2-4px)** -- every major element is outlined
  with solid, unapologetic black strokes that define shapes with
  absolute clarity
- **Hard-offset box shadows** -- shadows use zero blur and a fixed pixel
  offset (typically 4-8px), creating a flat, cutout-paper effect rather
  than realistic depth
- **Pastel background fills** -- cards, sections, and containers use
  soft candy tones (lavender, mint, baby pink, buttercream, powder blue)
  as their primary fill colors
- **High-contrast text on soft backgrounds** -- near-black (#1a1a1a or
  #2b2b2b) text sits directly on pastel surfaces, maintaining WCAG
  accessibility while preserving the soft palette
- **Flat, non-gradient color application** -- colors are applied as
  solid fills with no gradients, transparencies, or blending; each
  surface is a single tone
- **Oversized, heavyweight display typography** -- headings use
  extra-bold or black weight fonts at large sizes, creating a
  typographic brutality that contrasts with the gentle colors
- **Minimal or zero border-radius** -- corners are sharp (0-4px radius),
  preserving the angular, architectural quality of brutalist design;
  occasionally slightly rounded (6-8px) in the softer variant
- **Generous whitespace and padding** -- despite the dense visual weight
  of borders and shadows, internal padding is ample (24-40px), letting
  content breathe inside its frames
- **Visible grid structure** -- the underlying layout grid is not
  hidden; columns, rows, and gutters are often perceptible through
  consistent alignment and deliberate spacing
- **Monospace or system-font accents** -- secondary text elements
  (labels, tags, metadata) may use monospace or intentionally
  "un-designed" typefaces to reinforce the raw aesthetic
- **Stacked, offset interactive states** -- hover effects shift elements
  by reducing or increasing the shadow offset, creating a tactile
  "press" sensation
- **Bold iconography with thick strokes** -- icons match the weight of
  the borders, using 2-3px stroke widths and simple geometric forms

### Design Principles

- **Structural honesty** -- every element reveals what it is; buttons
  look pressable, cards look like contained surfaces, links look like
  links
- **Tension through contrast** -- the visual identity derives from the
  deliberate mismatch between soft color and hard structure
- **Hierarchy through scale and weight** -- importance is communicated
  via size and typographic boldness, not through color intensity or
  decorative embellishment
- **Consistency of construction** -- all elements share the same border
  weight, shadow offset, and padding rhythm, creating a unified visual
  system
- **Playfulness within discipline** -- the pastel palette invites whimsy
  and personality, but the brutalist grid keeps everything anchored and
  organized
- **Accessibility by default** -- the high contrast between dark
  borders/text and light pastel backgrounds naturally produces
  accessible color ratios
- **Function before decoration** -- every visual choice serves a
  structural or communicative purpose; nothing is purely ornamental
- **Deliberate imperfection** -- slight asymmetries, bold mismatches in
  element sizing, and raw edges are features, not flaws

---

## Color Palette

### Pastel Brutalism Core Palette

The palette balances soft, desaturated candy tones with stark neutrals.
Every pastel is chosen to maintain sufficient contrast against dark text
and thick black borders. The key principle is that no single pastel
dominates -- instead, different pastels are assigned to different UI
regions or component types, creating a patchwork quilt effect held
together by the consistent black framework.

  | Swatch   | Hex       | Role / Usage                                                               |
  | -------- | --------- | -------------------------------------------------------------------------- |
  | !#FFD6E0 | `#FFD6E0` | Baby Pink -- primary accent cards, hero backgrounds, CTA sections          |
  | !#C5B4E3 | `#C5B4E3` | Soft Lavender -- secondary cards, featured content blocks, tag backgrounds |
  | !#B8E8D0 | `#B8E8D0` | Mint Cream -- success states, positive indicators, alternate section fills |
  | !#FFF1C1 | `#FFF1C1` | Buttercream -- warning states, highlight badges, warm accent areas         |
  | !#B6D8F2 | `#B6D8F2` | Powder Blue -- info states, link highlights, cool accent sections          |
  | !#FFCBA4 | `#FFCBA4` | Peach Sorbet -- tertiary accent, illustration backgrounds, hover fills     |
  | !#F0F0F0 | `#F0F0F0` | Concrete -- page canvas, neutral background, structural base               |
  | !#FFFFFF | `#FFFFFF` | Pure White -- card backgrounds (alternate), modal surfaces, input fields   |
  | !#1A1A1A | `#1A1A1A` | Near Black -- primary text, borders, shadows, structural lines             |
  | !#2B2B2B | `#2B2B2B` | Charcoal -- secondary text, body copy, descriptions                        |
  | !#6B6B6B | `#6B6B6B` | Slate -- tertiary text, captions, disabled labels                          |
  | !#E8C5E8 | `#E8C5E8` | Orchid Mist -- decorative accents, secondary badges, alternate tags        |
  | !#D4F0B4 | `#D4F0B4` | Lime Sorbet -- positive metrics, growth indicators, fresh accents          |
  | !#F5C6C6 | `#F5C6C6` | Blush -- error states, destructive action warnings, alert backgrounds      |
  | !#D0D0D0 | `#D0D0D0` | Silver -- borders (alternate), dividers, disabled elements                 |

### CSS Custom Properties

```css
:root {
  /* Pastel Fills */
  --pb-pink: #ffd6e0;
  --pb-lavender: #c5b4e3;
  --pb-mint: #b8e8d0;
  --pb-buttercream: #fff1c1;
  --pb-blue: #b6d8f2;
  --pb-peach: #ffcba4;
  --pb-orchid: #e8c5e8;
  --pb-lime: #d4f0b4;
  --pb-blush: #f5c6c6;

  /* Neutrals */
  --pb-canvas: #f0f0f0;
  --pb-white: #ffffff;
  --pb-black: #1a1a1a;
  --pb-charcoal: #2b2b2b;
  --pb-slate: #6b6b6b;
  --pb-silver: #d0d0d0;

  /* Structural Tokens */
  --pb-border-width: 3px;
  --pb-border-color: #1a1a1a;
  --pb-shadow-offset: 6px;
  --pb-shadow: var(--pb-shadow-offset) var(--pb-shadow-offset) 0 var(--pb-border-color);
  --pb-shadow-sm: 4px 4px 0 var(--pb-border-color);
  --pb-shadow-lg: 8px 8px 0 var(--pb-border-color);
  --pb-radius: 0px;
  --pb-radius-soft: 6px;
  --pb-padding: 28px;
  --pb-gap: 20px;
}
```

---

## Typography

### Typeface Characteristics

Pastel Brutalism typography is aggressive in scale and weight while
remaining legible and modern. The contrast between oversized,
black-weight display headings and compact, clean body text mirrors the
broader aesthetic tension between raw structure and soft color.
Monospace typefaces are frequently introduced for labels, code snippets,
or metadata to reinforce the "exposed-construction" ethos. System fonts
or intentionally plain sans-serifs are also common, echoing early-web
and brutalist traditions where typography was functional rather than
decorative.

### Recommended Web Fonts (Google Fonts)

  Font                 Style                                  Best For
  -------------------- -------------------------------------- --------------------------------------------
  **Space Grotesk**    Monospace-inspired proportional sans   Display headings, navigation, hero text
  **Space Mono**       True monospace with character          Labels, tags, metadata, code-like accents
  **Inter**            Highly legible screen sans-serif       Body text, descriptions, form labels
  **DM Sans**          Clean geometric with warmth            Subheadings, card titles, button text
  **Syne**             Bold, expressive display face          Hero headlines, impactful statements
  **Outfit**           Geometric variable-weight sans         Headlines, metrics, callout numbers
  **JetBrains Mono**   Developer-friendly monospace           Code blocks, technical labels, raw accents
  **Work Sans**        Versatile humanist sans                Body text, navigation, general-purpose

### Font Pairing Suggestions

  Heading Font              Body Font              Character
  ------------------------- ---------------------- ------------------------------------------------
  **Space Grotesk** (700)   **Inter** (400)        Technical, structured, modern brutalism
  **Syne** (800)            **Work Sans** (400)    Expressive, bold, high-contrast editorial
  **Outfit** (800)          **DM Sans** (400)      Clean, geometric, friendly yet strong
  **Space Grotesk** (700)   **Space Mono** (400)   Full monospace family, raw developer aesthetic
  **DM Sans** (700)         **Inter** (400)        Warm, approachable, softer pastel variant

### Typography CSS Example

:::: {.language-css .highlighter-rouge}
::: highlight

``` highlight
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap');

h1, h2, h3, h4, h5, h6 {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  color: var(--pb-black);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.pb-display {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(2.5rem, 6vw, 5rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.0;
  text-transform: uppercase;
}

body {
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  font-size: 1rem;
  line-height: 1.65;
  color: var(--pb-charcoal);
}

.pb-mono {
  font-family: 'Space Mono', monospace;
  font-weight: 400;
  font-size: 0.85rem;
  letter-spacing: 0.02em;
}

.pb-label {
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pb-black);
}

.pb-caption {
  font-family: 'Inter', sans-serif;
  font-weight: 400;
  font-size: 0.85rem;
  color: var(--pb-slate);
}
```

:::
::::

---

## Layout Principles

- **Flat, exposed grid structure** -- use CSS Grid with visible
  alignment; columns and rows should feel intentional and architectural,
  not hidden behind smooth surfaces
- **Asymmetric but balanced** -- mix card sizes and column spans to
  create visual interest, but distribute visual weight evenly across the
  layout
- **Generous padding inside rigid containers** -- internal padding of
  24-40px keeps content from feeling trapped within the thick borders
- **Consistent gap spacing (16-24px)** -- gaps between cards and
  sections are uniform, acting as the structural mortar between building
  blocks
- **Full-bleed sections with contrasting pastels** -- alternate page
  sections use different pastel backgrounds (pink section, then mint
  section, then lavender) to create a color-blocked rhythm
- **Stacked vertical rhythm** -- sections flow top-to-bottom with clear
  delineation; horizontal scrolling or complex overlapping layouts are
  avoided
- **Max-width containment (1100-1200px)** -- content is centered within
  a max-width wrapper, with the canvas color visible on either side
- **Cards as primary content unit** -- nearly all content lives inside
  bordered, shadowed card components; very little "free-floating" text
- **Explicit hover/active states** -- every interactive element must
  visibly change on hover (shadow shift, color swap, border thickening)
  to maintain the tactile, physical metaphor
- **Mobile-first stacking** -- on narrow viewports, the grid collapses
  to a single column with cards stacking vertically; borders and shadows
  are preserved at all breakpoints
- **No overlapping or layering** -- elements do not overlap; the hard
  shadows create an illusion of depth, but actual z-index stacking is
  avoided in favor of flat, honest placement

---

## CSS / Design Techniques {#css--design-techniques}

### Card Component

:::: {.language-css .highlighter-rouge}
::: highlight

``` highlight
.pb-card {
  background: var(--pb-pink);
  border: var(--pb-border-width) solid var(--pb-border-color);
  box-shadow: var(--pb-shadow);
  padding: var(--pb-padding);
  position: relative;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}

.pb-card:hover {
  box-shadow: var(--pb-shadow-sm);
  transform: translate(2px, 2px);
}

.pb-card--lavender { background: var(--pb-lavender); }
.pb-card--mint { background: var(--pb-mint); }
.pb-card--buttercream { background: var(--pb-buttercream); }
.pb-card--blue { background: var(--pb-blue); }
.pb-card--peach { background: var(--pb-peach); }
.pb-card--white { background: var(--pb-white); }

.pb-card h3 {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 1.3rem;
  margin-bottom: 12px;
  color: var(--pb-black);
}

.pb-card p {
  font-family: 'Inter', sans-serif;
  font-size: 0.95rem;
  color: var(--pb-charcoal);
  line-height: 1.6;
}
```

:::
::::

### Button Component

:::: {.language-css .highlighter-rouge}
::: highlight

``` highlight
.pb-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 14px 32px;
  border: var(--pb-border-width) solid var(--pb-border-color);
  box-shadow: var(--pb-shadow-sm);
  cursor: pointer;
  text-decoration: none;
  transition: box-shadow 0.12s ease, transform 0.12s ease;
  background: var(--pb-buttercream);
  color: var(--pb-black);
}

.pb-button:hover {
  box-shadow: 2px 2px 0 var(--pb-border-color);
  transform: translate(2px, 2px);
}

.pb-button:active {
  box-shadow: 0px 0px 0 var(--pb-border-color);
  transform: translate(4px, 4px);
}

.pb-button--pink { background: var(--pb-pink); }
.pb-button--lavender { background: var(--pb-lavender); }
.pb-button--mint { background: var(--pb-mint); }
.pb-button--blue { background: var(--pb-blue); }

.pb-button--dark {
  background: var(--pb-black);
  color: var(--pb-white);
}

.pb-button--outline {
  background: transparent;
  color: var(--pb-black);
}
```

:::
::::

### Navigation Bar

:::: {.language-css .highlighter-rouge}
::: highlight

``` highlight
.pb-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 24px;
  border-bottom: var(--pb-border-width) solid var(--pb-border-color);
}

.pb-nav__logo {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 1.5rem;
  color: var(--pb-black);
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.pb-nav__links {
  display: flex;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.pb-nav__links a {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--pb-black);
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 8px 16px;
  border: 2px solid transparent;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.pb-nav__links a:hover {
  border: 2px solid var(--pb-border-color);
  background: var(--pb-buttercream);
}

.pb-nav__links a.active {
  border: 2px solid var(--pb-border-color);
  background: var(--pb-pink);
  box-shadow: 2px 2px 0 var(--pb-border-color);
}
```

:::
::::

### Hero Section

:::: {.language-css .highlighter-rouge}
::: highlight

``` highlight
.pb-hero {
  background: var(--pb-lavender);
  border: var(--pb-border-width) solid var(--pb-border-color);
  box-shadow: var(--pb-shadow-lg);
  padding: 60px 48px;
  text-align: center;
  margin-bottom: var(--pb-gap);
}

.pb-hero__title {
  font-family: 'Space Grotesk', sans-serif;
  font-size: clamp(2.5rem, 7vw, 5.5rem);
  font-weight: 700;
  line-height: 1.0;
  letter-spacing: -0.03em;
  text-transform: uppercase;
  color: var(--pb-black);
  margin-bottom: 20px;
}

.pb-hero__subtitle {
  font-family: 'Inter', sans-serif;
  font-size: 1.15rem;
  font-weight: 400;
  color: var(--pb-charcoal);
  max-width: 550px;
  margin: 0 auto 32px;
  line-height: 1.6;
}

.pb-hero__tag {
  display: inline-block;
  font-family: 'Space Mono', monospace;
  font-size: 0.8rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 6px 16px;
  border: 2px solid var(--pb-border-color);
  background: var(--pb-buttercream);
  margin-bottom: 20px;
}
```

:::
::::

### Grid Container

:::: {.language-css .highlighter-rouge}
::: highlight

``` highlight
.pb-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--pb-gap);
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
}

.pb-grid--2col { grid-template-columns: repeat(2, 1fr); }
.pb-grid--4col { grid-template-columns: repeat(4, 1fr); }
.pb-grid .pb-card--wide { grid-column: span 2; }
.pb-grid .pb-card--full { grid-column: 1 / -1; }

@media (max-width: 900px) {
  .pb-grid { grid-template-columns: repeat(2, 1fr); }
  .pb-grid .pb-card--wide { grid-column: span 2; }
}

@media (max-width: 600px) {
  .pb-grid {
    grid-template-columns: 1fr;
    padding: 0 16px;
    gap: 16px;
  }
  .pb-grid .pb-card--wide,
  .pb-grid .pb-card--full { grid-column: span 1; }
}
```

:::
::::

### Tag / Badge Component {#tag--badge-component}

:::: {.language-css .highlighter-rouge}
::: highlight

``` highlight
.pb-tag {
  display: inline-block;
  font-family: 'Space Mono', monospace;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 12px;
  border: 2px solid var(--pb-border-color);
  background: var(--pb-mint);
  color: var(--pb-black);
}

.pb-tag--pink { background: var(--pb-pink); }
.pb-tag--blue { background: var(--pb-blue); }
.pb-tag--buttercream { background: var(--pb-buttercream); }
.pb-tag--lavender { background: var(--pb-lavender); }
```

:::
::::

### Input / Form Field {#input--form-field}

:::: {.language-css .highlighter-rouge}
::: highlight

``` highlight
.pb-input {
  font-family: 'Inter', sans-serif;
  font-size: 1rem;
  padding: 12px 16px;
  border: var(--pb-border-width) solid var(--pb-border-color);
  box-shadow: var(--pb-shadow-sm);
  background: var(--pb-white);
  color: var(--pb-black);
  outline: none;
  width: 100%;
  transition: box-shadow 0.12s ease, transform 0.12s ease;
}

.pb-input:focus {
  box-shadow: var(--pb-shadow);
  background: var(--pb-buttercream);
}

.pb-input::placeholder {
  color: var(--pb-slate);
  font-style: italic;
}

.pb-input-label {
  display: block;
  font-family: 'Space Mono', monospace;
  font-weight: 700;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--pb-black);
  margin-bottom: 8px;
}
```

:::
::::

### Footer Section

:::: {.language-css .highlighter-rouge}
::: highlight

``` highlight
.pb-footer {
  background: var(--pb-black);
  color: var(--pb-silver);
  border-top: var(--pb-border-width) solid var(--pb-border-color);
  padding: 40px 24px;
  text-align: center;
}

.pb-footer__brand {
  font-family: 'Space Grotesk', sans-serif;
  font-weight: 700;
  font-size: 1.3rem;
  color: var(--pb-white);
  text-transform: uppercase;
  margin-bottom: 12px;
}

.pb-footer__links {
  display: flex;
  justify-content: center;
  gap: 24px;
  list-style: none;
  margin: 0 0 16px;
  padding: 0;
}

.pb-footer__links a {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--pb-silver);
  text-decoration: none;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition: color 0.15s ease;
}

.pb-footer__links a:hover {
  color: var(--pb-pink);
}

.pb-footer__copy {
  font-family: 'Space Mono', monospace;
  font-size: 0.75rem;
  color: var(--pb-slate);
}
```

:::
::::

---

## Design Do's and Don'ts

### Do's

- **Use consistent border weight** across all elements -- if your cards
  use 3px borders, your buttons, inputs, tags, and nav links should
  share that same weight
- **Assign different pastels to different content types** -- give cards,
  sections, and interactive elements distinct pastel fills to create a
  color-blocked, quilt-like visual rhythm
- **Maintain hard, zero-blur box shadows** -- the flat, offset shadow is
  the signature of this aesthetic; never add blur or spread that softens
  the shadow into realism
- **Keep typography bold and oversized** -- headlines should feel
  architecturally scaled; do not shy away from clamp-based sizes that
  reach 4-5rem on desktop
- **Test contrast ratios** -- pastel backgrounds with dark text
  naturally produce high contrast, but always verify that color
  combinations meet WCAG AA (4.5:1 for body text)
- **Embrace the tactile hover interaction** -- make buttons and cards
  visually "press in" on hover by reducing the shadow offset and
  translating the element toward the shadow
- **Use monospace accents for labels and metadata** -- a monospace font
  for tags, dates, and technical labels reinforces the raw, structural
  honesty of the design
- **Let the black framework unify everything** -- the thick borders and
  shadows are the connective tissue; as long as they are consistent,
  even a wide variety of pastel fills will feel cohesive

### Don'ts

- **Do not use gradients** -- the aesthetic depends on flat, solid color
  fills; introducing gradients undermines the brutalist honesty and
  muddies the pastel clarity
- **Do not add blur to shadows** -- blurred box shadows belong to
  material design, neumorphism, and glassmorphism; Pastel Brutalism
  demands zero-blur, hard-edge shadows only
- **Do not use too many pastels on a single screen** -- limit each view
  to 3-4 pastel tones plus neutrals; a full rainbow of candy colors
  becomes overwhelming and loses cohesion
- **Do not round corners excessively** -- border-radius above 8px starts
  to soften the brutalist edge; keep radii at 0-6px to preserve the
  angular, architectural feel
- **Do not hide the grid** -- resist the urge to create "seamless"
  layouts; the visible structure (gaps, borders, alignment) is a
  deliberate part of the aesthetic
- **Do not use thin or light-weight typography for headings** --
  delicate, thin fonts contradict the boldness of the structural
  elements; headings need weight 600-800 minimum
- **Do not combine with glossy or realistic effects** -- reflections, 3D
  transforms, parallax depth, and photorealistic textures clash with the
  flat, honest construction
- **Do not forget hover and active states** -- static, unresponsive
  elements break the physical metaphor; every interactive element must
  react to user input with visible state changes
