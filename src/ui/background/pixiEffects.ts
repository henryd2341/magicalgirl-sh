// ============================================================
// PixiJS Background Effects — Lightweight WebGL particles + glow
// Uses persistent Graphics to avoid GC pressure.
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

export class PixiEffects {
  private app!: Application;
  private particleGfx!: Graphics;
  private glowGfx!: Graphics;
  private particles: Particle[] = [];
  private width = 0;
  private height = 0;
  private running = false;

  async init(options: PixiEffectsOptions) {
    this.width = options.container.clientWidth;
    this.height = options.container.clientHeight;

    this.app = new Application();
    await this.app.init({
      width: this.width,
      height: this.height,
      backgroundAlpha: 0,
      antialias: false,
      resolution: 1,
      autoDensity: false,
    });

    options.container.appendChild(this.app.canvas);

    // Glow — single Graphics + blur, never recreated
    this.glowGfx = new Graphics();
    const blur = new BlurFilter();
    blur.blur = 80;
    this.glowGfx.filters = [blur];
    this.drawGlow();
    this.app.stage.addChild(this.glowGfx);

    // Particles — single Graphics cleared/redrawn each frame
    this.particleGfx = new Graphics();
    this.initParticles();
    this.app.stage.addChild(this.particleGfx);

    this.running = true;
    this.app.ticker.add(() => this.update());

    // Resize
    const observer = new ResizeObserver(() => {
      this.width = options.container.clientWidth;
      this.height = options.container.clientHeight;
      this.app.renderer.resize(this.width, this.height);
      this.drawGlow();
    });
    observer.observe(options.container);
  }

  private drawGlow() {
    const g = this.glowGfx;
    g.clear();
    g.circle(this.width / 2, this.height * 0.35, Math.max(this.width, this.height) * 0.4)
      .fill({ color: 0xff6b9d, alpha: 0.03 });
    g.circle(this.width * 0.3, this.height * 0.55, Math.max(this.width, this.height) * 0.25)
      .fill({ color: 0xb24bf3, alpha: 0.02 });
  }

  private initParticles() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
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

    // Glow pulse (just alpha modulation, no geometry recreation)
    this.glowGfx.alpha = 0.6 + Math.sin(Date.now() * 0.0003) * 0.15;

    // Redraw particles in place
    const g = this.particleGfx;
    g.clear();

    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.y > this.height + 10) { p.y = -10; p.x = Math.random() * this.width; }
      if (p.x > this.width + 10) p.x = -10;
      if (p.x < -10) p.x = this.width + 10;

      g.circle(p.x, p.y, p.size).fill({ color: p.color, alpha: p.alpha });
    }
  }

  destroy() {
    this.running = false;
    this.app.destroy(true);
  }
}
