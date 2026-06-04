# Kidcore - Design Reference

## Overview

Kidcore is a maximalist, nostalgia-fueled web aesthetic that celebrates
the unbridled joy and sensory overload of 1990s and early 2000s
childhood. Rooted in hyper-saturated primary colors, toy-box imagery,
and the visual language of Lisa Frank folders, Nickelodeon bumpers, and
cereal box packaging, Kidcore treats the screen as a playground where
more is always more. Layouts favor collage-style compositions with
tilted elements, sticker-like decorations, crayon textures, and chunky
rounded shapes that evoke arts-and-crafts tables and playroom floors.
Typography is bubbly, hand-drawn, and deliberately imperfect, rejecting
sophistication in favor of exuberant, childlike energy. Rainbow
gradients, checkerboard patterns, smiley faces, stars, hearts, and
cartoon doodles are layered without restraint, creating a scrapbook-like
density that rewards exploration. The philosophy is joyful maximalism --
every pixel should feel like it was decorated by a kid with unlimited
markers, stickers, and glitter glue.

---

## Visual Characteristics

### Core Design Traits

- **Hyper-saturated primary colors**: Pure reds, blues, and yellows
  dominate every surface, pushed to maximum saturation and paired with
  equally bold greens, oranges, and pinks to create a relentlessly
  vibrant palette
- **Collage-style layouts**: Elements are layered, overlapped, and
  slightly rotated as if pasted into a scrapbook, rejecting grid
  alignment in favor of intentional visual chaos
- **Sticker and doodle decorations**: Stars, hearts, smiley faces,
  rainbows, clouds, flowers, and squiggly lines are scattered across the
  design as decorative accents, mimicking the sticker sheets and
  notebook doodles of childhood
- **Rounded and bubbly shapes**: All containers, buttons, and decorative
  elements use exaggerated border-radius values, evoking toy blocks,
  gumballs, and inflatable furniture
- **Rainbow gradients**: Multi-color gradients spanning the full
  spectrum appear on backgrounds, borders, text, and decorative bands,
  reinforcing the more-is-more philosophy
- **Crayon and marker textures**: Rough, hand-drawn borders, wobbly
  lines, and textured fills simulate the imperfect mark-making of
  crayons, finger paint, and colored pencils
- **Toy and cartoon motifs**: Visual references to building blocks,
  alphabet magnets, board games, gummy bears, ball pits, and cartoon
  characters anchor the design in tactile childhood objects
- **Checkerboard and playful patterns**: Bold checkerboard grids, polka
  dots, zigzag borders, and rainbow stripes serve as background patterns
  and section dividers
- **Thick, visible outlines**: All elements carry heavy dark outlines
  reminiscent of coloring book illustrations and cartoon cel animation
- **Playful drop shadows**: Chunky, hard-offset shadows in contrasting
  colors give elements a sticker-peel or pop-up book dimensionality

### Design Principles

- **Joy over elegance**: Every design decision prioritizes fun, energy,
  and visual excitement over refinement, sophistication, or subtlety
- **Maximalism as philosophy**: Empty space is an opportunity for
  another sticker, another color, another pattern; whitespace is
  minimized in favor of visual density
- **Nostalgic authenticity**: References should feel genuine to the
  90s/Y2K childhood experience rather than ironic or cynical; the tone
  is warm and earnest
- **Imperfection is charm**: Slightly misaligned elements, wobbly
  borders, and hand-drawn textures are features, not bugs; over-polished
  designs lose the handmade quality
- **Accessibility through contrast**: Despite the visual complexity,
  text must remain readable through strong color contrast and generous
  sizing
- **Layered discovery**: Dense compositions should reward exploration,
  with decorative details that reveal themselves on closer inspection

---

## Color Palette

Kidcore demands a palette that hits like a box of 64 crayons spilled
across a table. Primary colors form the foundation, supported by a full
rainbow of secondary and accent hues at maximum saturation.

| Color Name             | Hex                                               | Role / Usage                                            |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Crayon Red             | `#FF2D2D`{.language-plaintext .highlighter-rouge} | Primary accent, buttons, hearts, alert states           |
| Sunshine Yellow        | `#FFD600`{.language-plaintext .highlighter-rouge} | Backgrounds, highlights, star decorations, hover states |
| True Blue              | `#2979FF`{.language-plaintext .highlighter-rouge} | Links, headers, borders, sky elements                   |
| Grass Green            | `#00C853`{.language-plaintext .highlighter-rouge} | Success states, nature motifs, checkerboard fills       |
| Bubblegum Pink         | `#FF6EC7`{.language-plaintext .highlighter-rouge} | Decorative accents, badges, sticker outlines            |
| Tangerine Orange       | `#FF6D00`{.language-plaintext .highlighter-rouge} | Secondary buttons, callouts, warm accents               |
| Grape Purple           | `#AA00FF`{.language-plaintext .highlighter-rouge} | Tags, decorative shadows, alternating pattern fills     |
| Cloud White            | `#FFFEF5`{.language-plaintext .highlighter-rouge} | Page background, card surfaces, breathing room          |
| Chalkboard Black       | `#1A1A2E`{.language-plaintext .highlighter-rouge} | Text, outlines, thick borders, cartoon strokes          |
| Robin Egg Blue         | `#00E5FF`{.language-plaintext .highlighter-rouge} | Secondary links, decorative borders, water motifs       |
| Candy Apple            | `#D50000`{.language-plaintext .highlighter-rouge} | Deep accent, important labels, bold emphasis            |
| Lemon Lime             | `#C6FF00`{.language-plaintext .highlighter-rouge} | Highlight backgrounds, tag fills, energetic accents     |
| Cotton Candy           | `#F8BBD0`{.language-plaintext .highlighter-rouge} | Soft backgrounds, alternating rows, gentle sections     |
| Royal Blue             | `#304FFE`{.language-plaintext .highlighter-rouge} | Dark link variant, footer backgrounds, contrast text    |
| Rainbow Gradient Start | `#FF0000`{.language-plaintext .highlighter-rouge} | Left/top edge of rainbow gradient bands                 |
| Rainbow Gradient End   | `#8B00FF`{.language-plaintext .highlighter-rouge} | Right/bottom edge of rainbow gradient bands             |

### CSS Custom Properties

```css
:root {
  /* Primary colors */
  --kid-red: #FF2D2D;
  --kid-yellow: #FFD600;
  --kid-blue: #2979FF;
  --kid-green: #00C853;

  /* Secondary colors */
  --kid-pink: #FF6EC7;
  --kid-orange: #FF6D00;
  --kid-purple: #AA00FF;
  --kid-cyan: #00E5FF;

  /* Supporting colors */
  --kid-candy-red: #D50000;
  --kid-lime: #C6FF00;
  --kid-cotton-candy: #F8BBD0;
  --kid-royal-blue: #304FFE;

  /* Neutrals */
  --kid-white: #FFFEF5;
  --kid-black: #1A1A2E;

  /* Rainbow gradient */
  --kid-rainbow: linear-gradient(
    90deg,
    #FF0000, #FF8800, #FFD600,
    #00C853, #2979FF, #AA00FF, #8B00FF
  );

  /* Functional tokens */
  --kid-bg: var(--kid-white);
  --kid-text: var(--kid-black);
  --kid-border: var(--kid-black);
  --kid-accent: var(--kid-red);
  --kid-highlight: var(--kid-yellow);
  --kid-link: var(--kid-blue);
  --kid-shadow-color: var(--kid-pink);
  --kid-radius: 20px;
  --kid-radius-lg: 30px;
  --kid-radius-pill: 999px;
  --kid-outline: 3px;
  --kid-shadow-offset: 5px;
}
```

---

## Typography

Kidcore typography should feel hand-drawn, bubbly, and exuberant.
Letters should look like they were written with fat markers, stamped
with alphabet blocks, or inflated like balloons. Readability matters,
but personality matters more.

### Typeface Characteristics

- **Rounded terminals and stroke endings** -- no sharp serifs or angular
  cuts; every letterform should feel soft and approachable
- **Heavy weight bias** -- bold and extra-bold weights dominate; thin or
  light weights feel too delicate for the playful energy required
- **Irregular or hand-drawn quality** -- slight variation in stroke
  width, baseline alignment, or letter spacing mimics real handwriting
  and hand-lettering
- **Large x-heights** -- generous lowercase proportions improve
  readability at the smaller sizes used in body text while maintaining a
  childlike openness
- **Decorative display faces for headings** -- headings can push into
  novelty territory with bubble letters, block shapes, or crayon
  textures that would be unreadable at small sizes

### Recommended Web Fonts (Google Fonts)

  | Font           | Style                    | Best For                                  |
  | -------------- | ------------------------ | ----------------------------------------- |
  | Bubblegum Sans | Rounded, playful display | Headlines, hero text, feature titles      |
  | Fredoka        | Variable weight, rounded | Headings, subheadings, UI labels          |
  | Gaegu          | Childlike handwriting    | Body text, captions, personal notes       |
  | Patrick Hand   | Casual handwritten       | Body text, descriptions, informal content |
  | Bungee         | Bold block display       | Hero titles, banners, large display text  |
  | Sniglet        | Rounded, friendly sans   | Navigation, buttons, card titles          |
  | Schoolbell     | Notebook handwriting     | Decorative text, annotations, asides      |
  | Baloo 2        | Heavy rounded sans       | Subheadings, callouts, badge labels       |

### Font Pairing Suggestions

| Heading        | Body         | Vibe                                                                         |
| -------------- | ------------ | ------- |
| Bubblegum Sans | Patrick Hand | Toy packaging meets notebook scribbles; playful and readable                 |
| Fredoka (700)  | Gaegu        | Chunky rounded headers with casual handwritten body; arts-and-crafts         |
| Bungee         | Patrick Hand | Bold block-letter impact paired with friendly handwriting; cereal box energy |
| Sniglet        | Gaegu        | Friendly rounded headers with childlike body text; storybook feel            |

### Typography CSS Example

```css
@import url('https://fonts.googleapis.com/css2?family=Bubblegum+Sans&family=Fredoka:wght@400;500;600;700&family=Patrick+Hand&display=swap');

/* === Base Typography === */
body {
  font-family: 'Patrick Hand', 'Comic Sans MS', 'Segoe Print', cursive;
  font-size: 18px;
  line-height: 1.7;
  color: var(--kid-text);
  background-color: var(--kid-bg);
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Bubblegum Sans', 'Fredoka', 'Comic Sans MS', cursive;
  line-height: 1.2;
  color: var(--kid-text);
  text-shadow: 3px 3px 0 var(--kid-yellow);
}

h1 {
  font-size: clamp(2.5rem, 8vw, 5rem);
  text-shadow: 4px 4px 0 var(--kid-pink);
}

h2 {
  font-family: 'Fredoka', 'Comic Sans MS', cursive;
  font-weight: 700;
  font-size: clamp(1.8rem, 4vw, 3rem);
}

h3 {
  font-family: 'Fredoka', 'Comic Sans MS', cursive;
  font-weight: 600;
  font-size: clamp(1.3rem, 3vw, 2rem);
}

a {
  color: var(--kid-link);
  text-decoration: underline wavy;
  text-underline-offset: 4px;
  transition: color 0.2s, transform 0.2s;
}

a:hover {
  color: var(--kid-pink);
  transform: scale(1.05);
}

.rainbow-text {
  background: var(--kid-rainbow);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

---

## Layout Principles

### Grid and Structure

- **Collage over grid**: Prefer overlapping, rotated, and irregularly
  placed elements over strict grid alignment; use CSS Grid and Flexbox
  as foundations but break the regularity with transforms and negative
  margins
- **Generous border-radius everywhere**: All containers, cards, buttons,
  and images should use rounded corners (20px minimum) to maintain the
  soft, toylike feel
- **Thick dark outlines on every element**: A 3px solid border in the
  dark color around cards, images, and interactive elements creates the
  coloring-book look essential to the aesthetic
- **Sticker-style layering**: Use absolute positioning, z-index
  stacking, and slight rotations (2 to 5 degrees) to create a pasted-on,
  scrapbook depth
- **Rainbow dividers between sections**: Replace standard horizontal
  rules with gradient bars spanning the full width in the rainbow
  spectrum
- **Visible, chunky spacing**: Padding and margins should be generous
  and visually obvious; tight spacing feels adult and corporate

### Section Organization

- **Hero with oversized display text**: Lead with a massive, colorful
  headline surrounded by floating decorative elements (stars, clouds,
  hearts)
- **Card-based content zones**: Present information in rounded, outlined
  cards with colored backgrounds that alternate through the palette
- **Feature strips with alternating colors**: Full-width colored bands
  that alternate between palette colors, each containing a single
  feature or content block
- **Sticker sidebar or floating elements**: Decorative elements
  positioned in margins or overlapping section boundaries to break the
  rectangular monotony
- **Footer as a playground**: The footer continues the playful energy
  with bright colors, doodle borders, and a rainbow gradient cap

### Responsive Approach

- **Stack and scale rather than hide**: On smaller screens, collage
  elements stack vertically but maintain their rotations, colors, and
  decorative elements
- **Maintain border-radius proportions**: Round corners should scale
  with the viewport but never drop below 12px; sharp corners break the
  aesthetic
- **Fluid typography with generous minimums**: Use clamp() for all text
  sizes with minimum values large enough to remain bubbly and readable
  on mobile
- **Preserve decorative elements**: Unlike minimal designs that strip
  decoration on mobile, Kidcore should keep its stickers, doodles, and
  color variety at all breakpoints
- **Touch-friendly oversized targets**: Buttons and interactive elements
  should be large (minimum 48px tap targets) which naturally aligns with
  the chunky, oversized aesthetic

---

## CSS / Design Techniques {#css--design-techniques}

### Kidcore Card

A bubbly content card with thick outlines, colored shadow, and rounded
corners that looks like a sticker peeled off a sheet.

```css
.kid-card {
  background-color: var(--kid-white);
  border: var(--kid-outline) solid var(--kid-black);
  border-radius: var(--kid-radius);
  padding: 1.5rem;
  box-shadow: var(--kid-shadow-offset) var(--kid-shadow-offset) 0 var(--kid-shadow-color);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  overflow: visible;
}

.kid-card:hover {
  transform: translateY(-4px) rotate(-1deg);
  box-shadow: 8px 8px 0 var(--kid-purple);
}

.kid-card::before {
  content: '';
  position: absolute;
  top: -10px;
  right: -10px;
  width: 40px;
  height: 40px;
  background: var(--kid-yellow);
  border: 2px solid var(--kid-black);
  border-radius: 50%;
  z-index: 1;
}

.kid-card h3 {
  font-family: 'Fredoka', cursive;
  font-weight: 700;
  font-size: 1.4rem;
  margin-bottom: 0.75rem;
  color: var(--kid-blue);
}

.kid-card p {
  font-size: 1rem;
  line-height: 1.6;
  margin-bottom: 1rem;
}

.kid-card .tag {
  display: inline-block;
  font-family: 'Fredoka', cursive;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.75rem;
  border-radius: var(--kid-radius-pill);
  border: 2px solid var(--kid-black);
  background-color: var(--kid-lime);
  margin-right: 0.4rem;
  margin-bottom: 0.4rem;
}
```

### Kidcore Button

Chunky, rounded buttons with bold outlines and a playful press effect
that feels like pushing a toy.

```css
.kid-btn {
  display: inline-block;
  font-family: 'Fredoka', 'Comic Sans MS', cursive;
  font-size: 1.1rem;
  font-weight: 600;
  padding: 0.8rem 2rem;
  border: var(--kid-outline) solid var(--kid-black);
  border-radius: var(--kid-radius-pill);
  background-color: var(--kid-red);
  color: var(--kid-white);
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  box-shadow: 4px 4px 0 var(--kid-black);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  position: relative;
}

.kid-btn:hover {
  transform: translateY(-2px);
  box-shadow: 6px 6px 0 var(--kid-black);
}

.kid-btn:active {
  transform: translateY(3px);
  box-shadow: 1px 1px 0 var(--kid-black);
}

.kid-btn--blue { background-color: var(--kid-blue); }
.kid-btn--green { background-color: var(--kid-green); color: var(--kid-black); }
.kid-btn--pink { background-color: var(--kid-pink); }
.kid-btn--yellow { background-color: var(--kid-yellow); color: var(--kid-black); }
.kid-btn--orange { background-color: var(--kid-orange); }

.kid-btn--outline {
  background-color: var(--kid-white);
  color: var(--kid-black);
}
```

### Kidcore Navigation

A colorful top navigation bar with pill-shaped links and rainbow
underline, like alphabet magnets on a fridge.

```css
.kid-nav {
  background-color: var(--kid-yellow);
  border-bottom: var(--kid-outline) solid var(--kid-black);
  padding: 0.75rem 1.5rem;
  position: relative;
}

.kid-nav::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 0;
  right: 0;
  height: 5px;
  background: var(--kid-rainbow);
}

.kid-nav ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.kid-nav .logo {
  font-family: 'Bubblegum Sans', cursive;
  font-size: 1.5rem;
  color: var(--kid-black);
  text-decoration: none;
  margin-right: 1rem;
}

.kid-nav a {
  display: block;
  padding: 0.5rem 1rem;
  font-family: 'Fredoka', cursive;
  font-weight: 600;
  font-size: 1rem;
  color: var(--kid-black);
  text-decoration: none;
  border-radius: var(--kid-radius-pill);
  border: 2px solid transparent;
  transition: background-color 0.2s, border-color 0.2s;
}

.kid-nav a:hover {
  background-color: var(--kid-white);
  border-color: var(--kid-black);
}

.kid-nav a.active {
  background-color: var(--kid-red);
  color: var(--kid-white);
  border-color: var(--kid-black);
}
```

### Kidcore Hero Section

A loud, celebratory hero with oversized rainbow text, floating
decorative elements, and a patterned background.

```css
.kid-hero {
  min-height: 85vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 3rem 2rem;
  background-color: var(--kid-cyan);
  background-image:
    radial-gradient(circle, var(--kid-white) 1px, transparent 1px),
    radial-gradient(circle, var(--kid-white) 1px, transparent 1px);
  background-size: 30px 30px;
  background-position: 0 0, 15px 15px;
  border-bottom: var(--kid-outline) solid var(--kid-black);
  position: relative;
  overflow: hidden;
}

.kid-hero h1 {
  font-family: 'Bubblegum Sans', cursive;
  font-size: clamp(3rem, 10vw, 7rem);
  line-height: 1.1;
  color: var(--kid-black);
  text-shadow:
    4px 4px 0 var(--kid-yellow),
    -2px -2px 0 var(--kid-pink);
  position: relative;
  z-index: 2;
}

.kid-hero p {
  font-family: 'Patrick Hand', cursive;
  font-size: clamp(1.1rem, 2.5vw, 1.6rem);
  max-width: 50ch;
  margin-top: 1.5rem;
  color: var(--kid-black);
  position: relative;
  z-index: 2;
  background-color: rgba(255, 254, 245, 0.85);
  padding: 1rem 2rem;
  border-radius: var(--kid-radius);
  border: 2px solid var(--kid-black);
}

.kid-hero .btn-row {
  margin-top: 2rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: center;
  position: relative;
  z-index: 2;
}

/* Floating decorative star */
.kid-hero .deco-star {
  position: absolute;
  font-size: 3rem;
  animation: float 3s ease-in-out infinite;
  z-index: 1;
  filter: drop-shadow(2px 2px 0 var(--kid-black));
}

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-15px) rotate(10deg); }
}
```

### Rainbow Divider

A full-width gradient strip that replaces boring horizontal rules with
childhood energy.

```css
.kid-divider {
  height: 8px;
  border: none;
  background: var(--kid-rainbow);
  border-top: 2px solid var(--kid-black);
  border-bottom: 2px solid var(--kid-black);
  margin: 0;
}

.kid-divider--thick {
  height: 16px;
  border-radius: 8px;
  margin: 2rem 1rem;
  border: 2px solid var(--kid-black);
}

.kid-divider--wavy {
  height: 20px;
  background: var(--kid-rainbow);
  border: 2px solid var(--kid-black);
  border-radius: 10px;
  margin: 2rem 1rem;
  position: relative;
}
```

### Sticker Badge

Small decorative labels that mimic adhesive stickers, used for tags,
categories, and decorative callouts.

```css
.kid-sticker {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-family: 'Fredoka', cursive;
  font-weight: 600;
  font-size: 0.85rem;
  padding: 0.4rem 1rem;
  border: 2px solid var(--kid-black);
  border-radius: var(--kid-radius-pill);
  background-color: var(--kid-pink);
  color: var(--kid-black);
  box-shadow: 2px 2px 0 var(--kid-black);
  transform: rotate(-2deg);
  transition: transform 0.2s;
  white-space: nowrap;
}

.kid-sticker:hover {
  transform: rotate(2deg) scale(1.08);
}

.kid-sticker--red { background-color: var(--kid-red); color: var(--kid-white); }
.kid-sticker--blue { background-color: var(--kid-blue); color: var(--kid-white); }
.kid-sticker--green { background-color: var(--kid-green); }
.kid-sticker--yellow { background-color: var(--kid-yellow); }
.kid-sticker--purple { background-color: var(--kid-purple); color: var(--kid-white); }
.kid-sticker--orange { background-color: var(--kid-orange); }
```

### Checkerboard Section

A patterned background section using CSS-generated checkerboard, a
signature Kidcore texture.

```css
.kid-checkerboard {
  padding: 3rem 2rem;
  background-color: var(--kid-white);
  background-image:
    linear-gradient(45deg, var(--kid-yellow) 25%, transparent 25%),
    linear-gradient(-45deg, var(--kid-yellow) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--kid-yellow) 75%),
    linear-gradient(-45deg, transparent 75%, var(--kid-yellow) 75%);
  background-size: 40px 40px;
  background-position: 0 0, 0 20px, 20px -20px, -20px 0;
  border-top: var(--kid-outline) solid var(--kid-black);
  border-bottom: var(--kid-outline) solid var(--kid-black);
}

.kid-checkerboard .content-box {
  max-width: 800px;
  margin: 0 auto;
  background-color: var(--kid-white);
  border: var(--kid-outline) solid var(--kid-black);
  border-radius: var(--kid-radius-lg);
  padding: 2.5rem;
  box-shadow: 6px 6px 0 var(--kid-black);
}
```

### Kidcore Feature Strip

Full-width colored bands for showcasing features, alternating through
the palette.

```css
.kid-feature-strip {
  padding: 3rem 2rem;
  border-bottom: var(--kid-outline) solid var(--kid-black);
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2rem;
}

.kid-feature-strip:nth-child(odd) { background-color: var(--kid-cotton-candy); }
.kid-feature-strip:nth-child(even) { background-color: var(--kid-lime); }

.kid-feature-strip .icon-circle {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  border: var(--kid-outline) solid var(--kid-black);
  background-color: var(--kid-yellow);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.5rem;
  flex-shrink: 0;
  box-shadow: 4px 4px 0 var(--kid-black);
}

.kid-feature-strip .feature-text {
  flex: 1;
  min-width: 200px;
}

.kid-feature-strip .feature-text h3 {
  font-family: 'Fredoka', cursive;
  font-weight: 700;
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  color: var(--kid-black);
}

.kid-feature-strip .feature-text p {
  font-size: 1.05rem;
  line-height: 1.6;
}
```

---

## Design Do's and Don'ts

### Do

- **Saturate everything** -- push colors to their brightest, boldest
  values; muted or pastel-leaning tones weaken the toy-box energy
- **Round every corner** -- cards, buttons, images, and containers all
  need generous border-radius; sharp corners feel corporate and adult
- **Layer decorative elements** -- scatter stars, hearts, smiley faces,
  and doodle accents across the layout like stickers on a notebook cover
- **Use thick dark outlines** -- a consistent 3px solid border on all
  major elements creates the coloring-book look essential to the
  aesthetic
- **Mix multiple colors per section** -- each card, button, or badge can
  be a different color; chromatic variety is a feature, not a bug
- **Include rainbow gradients** -- use them for dividers, borders, text
  highlights, and background accents wherever energy feels low
- **Embrace CSS animations** -- gentle bounces, wobbles, and floats on
  decorative elements add the kinetic, alive quality of a toy store
- **Keep text large and readable** -- chunky fonts at generous sizes
  maintain both the playful look and practical accessibility
- **Use emoji and Unicode symbols** -- stars, hearts, sparkles, and
  smiley faces as inline text decorations reinforce the childlike tone
- **Test with real content** -- the design should feel joyful even with
  actual text and images, not just with placeholder lorem ipsum

### Don't

- **Don't use thin, elegant typefaces** -- serif fonts, light weights,
  and tightly tracked lettering contradict the bubbly, handmade
  aesthetic
- **Don't pursue minimal whitespace** -- Kidcore is maximalist, but
  don't confuse density with cramped text; generous padding inside
  elements is essential
- **Don't default to grayscale** -- gray text, gray borders, and gray
  backgrounds drain the life from the palette; use the full color
  spectrum instead
- **Don't use subtle hover states** -- interactions should be obvious
  and delightful with noticeable color changes, scale bumps, and
  rotations
- **Don't add ironic or cynical tone** -- Kidcore nostalgia should feel
  warm and sincere; sarcasm and dark humor undercut the joyful spirit
- **Don't forget accessibility** -- despite the visual complexity,
  maintain WCAG contrast ratios, keyboard navigation, and screen reader
  support
- **Don't use stock corporate photography** -- if images are needed,
  lean toward illustrations, cartoon-style graphics, or photos with
  heavy color filters and sticker overlays
- **Don't create perfectly symmetrical layouts** -- slight rotations,
  offset elements, and intentional irregularity maintain the handmade,
  scrapbook energy
- **Don't neglect mobile** -- the dense, layered aesthetic needs careful
  responsive adjustment so elements do not overlap into unreadable piles
  on small screens
  