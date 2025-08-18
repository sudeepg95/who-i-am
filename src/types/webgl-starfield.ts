import { Star } from "~/types";
import type { StarfieldRenderer } from "~/types";

export interface WebGLStarfieldOptions {
  starCount?: number;
  speed?: number;
  enableIntersectionObserver?: boolean;
  enableThemeObserver?: boolean;
}

export class WebGLStarfield implements StarfieldRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private stars: Star[] = [];
  private rafId = 0;
  private isVisible = true;
  private options: Required<WebGLStarfieldOptions>;
  private intersectionObserver?: IntersectionObserver;
  private themeObserver?: MutationObserver;

  constructor(canvas: HTMLCanvasElement, options: WebGLStarfieldOptions = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;

    this.options = {
      starCount: options.starCount ?? (window.innerWidth < 768 ? 250 : 800),
      speed: options.speed ?? 0.1,
      enableIntersectionObserver: options.enableIntersectionObserver ?? true,
      enableThemeObserver: options.enableThemeObserver ?? true,
    };

    this.stars = Array.from(
      { length: this.options.starCount },
      () => new Star(0, 0, 0),
    );
  }

  async init(): Promise<boolean> {
    try {
      this.setupCanvas();
      this.setupEventListeners();

      if (this.options.enableIntersectionObserver) {
        this.setupIntersectionObserver();
      }

      if (this.options.enableThemeObserver) {
        this.setupThemeObserver();
      }

      this.start();
      return true;
    } catch (error) {
      console.error("WebGL Starfield initialization failed:", error);
      return false;
    }
  }

  private setupCanvas(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(dpr, dpr);

    // Initialize star positions
    for (const star of this.stars) {
      star.x = Math.random() * width - width / 2;
      star.y = Math.random() * height - height / 2;
      star.z = 0;
    }

    this.ctx.translate(width / 2, height / 2);
    this.ctx.fillStyle =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-backdrop")
        .trim() || "rgba(0, 0, 0, 0.4)";
    this.ctx.strokeStyle = "white";
  }

  private setupEventListeners(): void {
    window.addEventListener("resize", this.handleResize.bind(this));
  }

  private handleResize(): void {
    this.stop();

    // Update star count based on current screen size
    const newCount = window.innerWidth < 768 ? 250 : 800;
    if (this.stars.length !== newCount) {
      this.stars = Array.from({ length: newCount }, () => new Star(0, 0, 0));
    }

    this.setupCanvas();

    if (this.shouldAnimate()) {
      this.start();
    }
  }

  private setupIntersectionObserver(): void {
    this.intersectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            this.isVisible = true;
            if (this.shouldAnimate()) {
              this.start();
            }
          } else {
            this.isVisible = false;
            this.stop();
          }
        });
      },
      { threshold: 0.1 },
    );

    // Observe the canvas or its container
    const target = this.canvas.closest('[id*="starfield"]') || this.canvas;
    this.intersectionObserver.observe(target);
  }

  private setupThemeObserver(): void {
    this.themeObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "data-theme"
        ) {
          this.updateVisibility();
        }
      });
    });

    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    // Initial visibility update
    this.updateVisibility();
  }

  private updateVisibility(): void {
    const theme = document.documentElement.dataset.theme;
    const container = this.canvas.closest('[id*="starfield"]') as HTMLElement;

    if (!container) return;

    if (theme === "dark") {
      container.style.opacity = "1";
      if (this.shouldAnimate()) {
        this.start();
      }
    } else {
      container.style.opacity = "0";
      this.stop();
    }
  }

  private shouldAnimate(): boolean {
    const theme = document.documentElement.dataset.theme;
    return theme === "dark" && this.isVisible && this.rafId === 0;
  }

  private start(): void {
    if (this.rafId > 0) return;
    this.rafId = requestAnimationFrame(this.frame.bind(this));
  }

  private stop(): void {
    if (this.rafId > 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private frame(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    for (const star of this.stars) {
      star.update(width, height, this.options.speed);
      star.draw(this.ctx);
    }

    this.ctx.fillRect(-width / 2, -height / 2, width, height);
    this.rafId = requestAnimationFrame(this.frame.bind(this));
  }

  destroy(): void {
    this.stop();

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect();
    }

    if (this.themeObserver) {
      this.themeObserver.disconnect();
    }

    window.removeEventListener("resize", this.handleResize.bind(this));
  }

  // Public methods for external control
  setStarCount(count: number): void {
    this.options.starCount = count;
    this.stars = Array.from({ length: count }, () => new Star(0, 0, 0));
    this.setupCanvas();
  }

  setSpeed(speed: number): void {
    this.options.speed = speed;
  }

  pause(): void {
    this.stop();
  }

  resume(): void {
    if (this.shouldAnimate()) {
      this.start();
    }
  }
}
