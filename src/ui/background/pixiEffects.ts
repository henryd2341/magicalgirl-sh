// ============================================================
// PixiJS Background Effects — particles + theme-aware glow
// Uses persistent Graphics to avoid GC pressure.
// ============================================================
import { Application, Graphics, BlurFilter } from "pixi.js";

export interface PixiEffectsOptions {
  container: HTMLElement;
  colorScheme?: "e-girl" | "kidcore" | "pastel-brutalism";
}

const E_GIRL_COLORS = [0xff6b9d, 0xb24bf3, 0xff2d78, 0xc9a0dc];
const KIDCORE_COLORS = [0xff2d2d, 0xffd600, 0x2979ff, 0x00c853, 0xff6ec7, 0xff6d00, 0xaa00ff, 0x00e5ff];
const PASTEL_COLORS = [0xff6b9d, 0xa8d8ea, 0xc5b4e3, 0xffd6e0, 0xb8e8d0, 0xfff1c1];

/** Glow alpha per colorScheme: [primary, secondary]. Pastel skips glow entirely. */
const GLOW_ALPHA: Record<string, [number, number] | null> = {
  "e-girl": [0.04, 0.03],
  kidcore: [0.015, 0.01],
  "pastel-brutalism": null,
};

function pickPalette(scheme?: string): number[] {
  if (scheme === "kidcore") return KIDCORE_COLORS;
  if (scheme === "pastel-brutalism") return PASTEL_COLORS;
  return E_GIRL_COLORS;
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
  color: number;
  shape: "circle" | "heart" | "star";
}

const PARTICLE_COUNT = 35;
const MAX_PIXEL_BUDGET = 1280 * 720;
const GLOW_BLUR = 35;

export class PixiEffects {
  private app!: Application;
  private particleGfx!: Graphics;
  private glowGfx!: Graphics;
  private particles: Particle[] = [];
  private cssWidth = 0;
  private cssHeight = 0;
  private internalWidth = 0;
  private internalHeight = 0;
  private running = false;
  private frameSkip = 0;
  private palette: number[] = E_GIRL_COLORS;
  private glowAlpha: [number, number] | null = null;

  async init(options: PixiEffectsOptions) {
    this.palette = pickPalette(options.colorScheme);
    this.glowAlpha = GLOW_ALPHA[options.colorScheme || "e-girl"] ?? null;
    this.cssWidth = options.container.clientWidth;
    this.cssHeight = options.container.clientHeight;
    this.computeInternalSize();

    this.app = new Application();
    await this.app.init({
      width: this.internalWidth,
      height: this.internalHeight,
      backgroundAlpha: 0,
      antialias: false,
      resolution: 1,
      autoDensity: false,
    });

    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.imageRendering = "auto";
    options.container.appendChild(canvas);

    // Glow layer
    this.glowGfx = new Graphics();
    if (this.glowAlpha) {
      const blur = new BlurFilter();
      blur.strength = GLOW_BLUR;
      this.glowGfx.filters = [blur];
      this.drawGlow();
    }
    this.app.stage.addChild(this.glowGfx);

    // Particles layer
    this.particleGfx = new Graphics();
    this.initParticles();
    this.app.stage.addChild(this.particleGfx);

    this.running = true;
    this.app.ticker.add(() => this.update());

    const observer = new ResizeObserver(() => {
      this.cssWidth = options.container.clientWidth;
      this.cssHeight = options.container.clientHeight;
      this.computeInternalSize();
      this.app.renderer.resize(this.internalWidth, this.internalHeight);
      if (this.glowAlpha) this.drawGlow();
    });
    observer.observe(options.container);
  }

  private computeInternalSize() {
    const cssArea = this.cssWidth * this.cssHeight;
    if (cssArea <= MAX_PIXEL_BUDGET) {
      this.internalWidth = this.cssWidth;
      this.internalHeight = this.cssHeight;
      return;
    }
    const scale = Math.sqrt(MAX_PIXEL_BUDGET / cssArea);
    this.internalWidth = Math.round(this.cssWidth * scale);
    this.internalHeight = Math.round(this.cssHeight * scale);
  }

  private drawGlow() {
    if (!this.glowAlpha) return;
    const g = this.glowGfx;
    g.clear();
    const w = this.internalWidth;
    const h = this.internalHeight;
    const maxDim = Math.max(w, h);
    g.circle(w / 2, h * 0.35, maxDim * 0.4).fill({ color: this.palette[0], alpha: this.glowAlpha[0] });
    g.circle(w * 0.3, h * 0.55, maxDim * 0.25).fill({ color: this.palette[1], alpha: this.glowAlpha[1] });
  }

  private initParticles() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        x: Math.random() * this.internalWidth,
        y: Math.random() * this.internalHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.15 - Math.random() * 0.4,
        size: 1.5 + Math.random() * 2.5,
        alpha: 0.08 + Math.random() * 0.15,
        color: this.palette[Math.floor(Math.random() * this.palette.length)],
        shape: Math.random() > 0.6 ? "heart" : (Math.random() > 0.5 ? "star" : "circle"),
      });
    }
  }

  private update() {
    if (!this.running) return;
    this.frameSkip = (this.frameSkip + 1) % 2;
    if (this.frameSkip !== 0) return;

    // Glow pulse
    if (this.glowAlpha) {
      this.glowGfx.alpha = 0.5 + Math.sin(Date.now() * 0.0003) * 0.1;
    }

    // Particles
    const g = this.particleGfx;
    g.clear();
    for (const p of this.particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.y > this.internalHeight + 10) { p.y = -10; p.x = Math.random() * this.internalWidth; }
      if (p.x > this.internalWidth + 10) p.x = -10;
      if (p.x < -10) p.x = this.internalWidth + 10;

      if (p.shape === "heart") {
        const s = p.size * 2;
        g.moveTo(p.x, p.y + s);
        g.bezierCurveTo(p.x - s * 1.5, p.y - s * 0.3, p.x - s, p.y - s * 1.5, p.x, p.y - s * 0.4);
        g.bezierCurveTo(p.x + s, p.y - s * 1.5, p.x + s * 1.5, p.y - s * 0.3, p.x, p.y + s);
        g.fill({ color: p.color, alpha: p.alpha });
      } else if (p.shape === "star") {
        g.star(p.x, p.y, 5, p.size, p.size * 0.4).fill({ color: p.color, alpha: p.alpha });
      } else {
        g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
      }
    }
  }

  destroy() {
    this.running = false;
    this.app.destroy(true);
  }
}
