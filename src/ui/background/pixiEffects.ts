// ============================================================
// PixiJS Background Effects — Lightweight WebGL particles + glow
// Uses persistent Graphics to avoid GC pressure.
// Internal resolution capped to limit GPU fill-rate on wide screens.
// ============================================================
import { Application, Graphics, BlurFilter } from "pixi.js";

export interface PixiEffectsOptions {
  container: HTMLElement;
  particles?: boolean;
  glow?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
}

const PARTICLE_COUNT = 25;

/** Maximum internal pixel budget: ~921K pixels (1280×720). */
const MAX_PIXEL_BUDGET = 1280 * 720;

/** Blur radius — reduced from 80; still reads as a soft glow. */
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

  async init(options: PixiEffectsOptions) {
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

    // Let CSS scale the canvas to fill the container (bilinear, free on GPU).
    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.imageRendering = "auto";

    options.container.appendChild(canvas);

    // Glow — single Graphics + blur, never recreated
    this.glowGfx = new Graphics();
    const blur = new BlurFilter();
    blur.strength = GLOW_BLUR;
    this.glowGfx.filters = [blur];
    this.drawGlow();
    this.app.stage.addChild(this.glowGfx);

    // Particles — single Graphics cleared/redrawn each frame
    this.particleGfx = new Graphics();
    this.initParticles();
    this.app.stage.addChild(this.particleGfx);

    this.running = true;
    this.app.ticker.add(() => this.update());

    // Resize handler — recalculate internal resolution and redraw glow
    const observer = new ResizeObserver(() => {
      this.cssWidth = options.container.clientWidth;
      this.cssHeight = options.container.clientHeight;
      this.computeInternalSize();
      this.app.renderer.resize(this.internalWidth, this.internalHeight);
      this.drawGlow();
    });
    observer.observe(options.container);
  }

  /** Cap internal resolution so GPU fill-rate stays bounded. */
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
    const g = this.glowGfx;
    g.clear();
    const w = this.internalWidth;
    const h = this.internalHeight;
    const maxDim = Math.max(w, h);
    g.circle(w / 2, h * 0.35, maxDim * 0.4).fill({ color: 0xff6b9d, alpha: 0.03 });
    g.circle(w * 0.3, h * 0.55, maxDim * 0.25).fill({ color: 0xb24bf3, alpha: 0.02 });
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
        color: Math.random() > 0.7 ? 0xb24bf3 : 0xff6b9d,
      });
    }
  }

  private update() {
    if (!this.running) return;

    // Throttle to ~30 fps — halved fill-rate & blur cost.
    this.frameSkip = (this.frameSkip + 1) % 2;
    if (this.frameSkip !== 0) return;

    // Glow pulse (alpha modulation only, no geometry changes)
    this.glowGfx.alpha = 0.6 + Math.sin(Date.now() * 0.0003) * 0.15;

    // Redraw particles in place
    const g = this.particleGfx;
    g.clear();

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y > this.internalHeight + 10) {
        p.y = -10;
        p.x = Math.random() * this.internalWidth;
      }
      if (p.x > this.internalWidth + 10) p.x = -10;
      if (p.x < -10) p.x = this.internalWidth + 10;

      g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
    }
  }

  destroy() {
    this.running = false;
    this.app.destroy(true);
  }
}
