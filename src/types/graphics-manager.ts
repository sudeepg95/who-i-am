import type {
  DeviceCapabilities,
  RendererType,
  StarfieldRenderer,
} from "./graphics";

export class GraphicsManager {
  private currentRenderer: RendererType = "none";
  private capabilities: DeviceCapabilities;
  private starfieldInstance: StarfieldRenderer | null = null;

  constructor() {
    this.capabilities = this.detectCapabilities();
  }

  private detectCapabilities(): DeviceCapabilities {
    const nav = navigator as any;

    return {
      isLowEnd: navigator.hardwareConcurrency <= 4,
      isMobile:
        window.innerWidth < 768 ||
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent,
        ),
      supportsWebGPU: !!navigator.gpu,
      prefersReducedMotion: window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches,
      batteryLevel: nav.getBattery ? undefined : 1,
    };
  }

  async init(): Promise<void> {
    // Check battery status if available
    if ("getBattery" in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        if (battery && typeof battery.level === "number" && battery.level > 0) {
          this.capabilities.batteryLevel = battery.level;
        }
      } catch (e) {
        this.capabilities.batteryLevel = 1;
        console.debug("Battery API not available or failed", e);
      }
    }

    await this.selectRenderer();
    this.setupThemeObserver();
    this.setupPerformanceMonitoring();
  }

  private async selectRenderer(): Promise<void> {
    const {
      supportsWebGPU,
      prefersReducedMotion,
      isLowEnd,
      isMobile,
      batteryLevel,
    } = this.capabilities;

    // No animations for reduced motion preference
    if (prefersReducedMotion) {
      this.currentRenderer = "none";
      return;
    }

    // Check battery level (only disable on very low battery)
    if (batteryLevel !== undefined && batteryLevel < 0.15) {
      this.currentRenderer = "css";
      await this.initCSSStarfield();
      return;
    }

    // WebGPU path for capable devices
    if (supportsWebGPU && !isLowEnd) {
      try {
        const success = await this.initWebGPUSpritefield();
        if (success) {
          this.currentRenderer = "webgpu";
          console.debug("Using WebGPU renderer for optimal performance");
          return;
        }
      } catch (error) {
        console.debug("WebGPU fallback to WebGL:", error);
      }
    }

    if (isMobile && (!supportsWebGPU || isLowEnd)) {
      this.currentRenderer = "css";
      await this.initCSSStarfield();
      console.debug("Using CSS renderer for compatibility");
      return;
    }

    await this.initWebGLStarfield();
    this.currentRenderer = "webgl";
    console.debug("Using WebGL renderer");
    return;
  }

  private async initWebGPUSpritefield(): Promise<boolean> {
    const random = parseInt(String(Math.random() * 100));
    // if (random < 34) {
    if (random < 50) {
      return this.initWebGPULaserfield();
    } else {
      return this.initWebGPUSnowfield();
      // } else if (random < 67) {
      // return this.initWebGPUStarfield();
    }
  }

  private async initWebGPUStarfield(): Promise<boolean> {
    try {
      const { WebGPUStarfield } = await import("./webgpu-starfield");
      const canvas = document.querySelector(
        "#webgpu-canvas",
      ) as HTMLCanvasElement;

      if (!canvas) return false;

      this.starfieldInstance = new WebGPUStarfield(
        canvas,
        this.getSpriteCount(),
      );
      const success = await this.starfieldInstance.init();

      if (success) {
        console.debug("WebGPU starfield initialized successfully");
        this.showRenderer("webgpu");
        return true;
      }

      return false;
    } catch (error) {
      console.debug("WebGPU starfield import/initialization failed:", error);
      return false;
    }
  }

  private async initWebGPUSnowfield(): Promise<boolean> {
    try {
      const { WebGPUSnowfield } = await import("./webgpu-snowfield");
      const canvas = document.querySelector(
        "#webgpu-canvas",
      ) as HTMLCanvasElement;

      if (!canvas) return false;

      this.starfieldInstance = new WebGPUSnowfield(
        canvas,
        this.getSpriteCount(),
      );
      const success = await this.starfieldInstance.init();

      if (success) {
        console.debug("WebGPU snowfield initialized successfully");
        this.showRenderer("webgpu");
        return true;
      }

      return false;
    } catch (error) {
      console.debug("WebGPU snowfield import/initialization failed:", error);
      return false;
    }
  }

  private async initWebGPULaserfield(): Promise<boolean> {
    try {
      const { WebGPULaserfield } = await import("./webgpu-laserfield");
      const canvas = document.querySelector(
        "#webgpu-canvas",
      ) as HTMLCanvasElement;

      if (!canvas) return false;

      this.starfieldInstance = new WebGPULaserfield(
        canvas,
        this.getSpriteCount(),
      );
      const success = await this.starfieldInstance.init();

      if (success) {
        console.debug("WebGPU laserfield initialized successfully");
        this.showRenderer("webgpu");
        return true;
      }

      return false;
    } catch (error) {
      console.debug("WebGPU laserfield import/initialization failed:", error);
      return false;
    }
  }

  private async initWebGLStarfield(): Promise<void> {
    const { WebGLStarfield } = await import("./webgl-starfield");
    const canvas = document.querySelector("#webgl-canvas") as HTMLCanvasElement;
    if (!canvas) return;

    // Create starfield instance with adaptive settings
    this.starfieldInstance = new WebGLStarfield(canvas, {
      starCount: this.getSpriteCount(),
      speed: 0.1,
      enableIntersectionObserver: false, // GraphicsManager handles visibility
      enableThemeObserver: false, // GraphicsManager handles theme changes
    });

    const success = await this.starfieldInstance.init();
    if (!success) {
      throw new Error("WebGL Starfield initialization failed");
    }

    console.debug("WebGL starfield initialized successfully");
    this.showRenderer("webgl");
  }

  private async initCSSStarfield(): Promise<void> {
    this.showRenderer("css");
  }

  private getSpriteCount(): number {
    const { isMobile, isLowEnd } = this.capabilities;

    if (isLowEnd) return 200;
    if (isMobile) return 400;
    return 800;
  }

  private showRenderer(type: "webgpu" | "webgl" | "css"): void {
    document
      .querySelectorAll("#adaptive-graphics-container > div")
      .forEach((el) => {
        (el as HTMLElement).classList.add("hidden");
      });

    // Show selected renderer
    const renderer = document.querySelector(`#${type}-field`);
    if (renderer) {
      renderer.classList.remove("hidden");
    }
  }

  private setupThemeObserver(): void {
    const updateVisibility = () => {
      const theme = document.documentElement.dataset.theme;
      const container = document.querySelector(
        "#adaptive-graphics-container",
      ) as HTMLElement;

      if (theme === "dark" && this.currentRenderer !== "none") {
        container.style.opacity = "1";
      } else {
        container.style.opacity = "0";
      }
    };

    updateVisibility();

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (
          mutation.type === "attributes" &&
          mutation.attributeName === "data-theme"
        ) {
          updateVisibility();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  private setupPerformanceMonitoring(): void {
    // Monitor performance and potentially downgrade renderer
    let frameCount = 0;
    let lastTime = performance.now();

    const monitor = () => {
      frameCount++;
      const now = performance.now();

      if (now - lastTime >= 5000) {
        // Check every 5 seconds
        const fps = frameCount / ((now - lastTime) / 1000);

        if (fps < 30 && this.currentRenderer === "webgpu") {
          console.debug("Performance degraded, falling back to WebGL");
          this.fallbackToWebGL();
        } else if (fps < 20 && this.currentRenderer === "webgl") {
          console.debug("Performance degraded, falling back to CSS");
          this.fallbackToCSS();
        }

        frameCount = 0;
        lastTime = now;
      }

      requestAnimationFrame(monitor);
    };

    if (this.currentRenderer !== "css" && this.currentRenderer !== "none") {
      requestAnimationFrame(monitor);
    }
  }

  private async fallbackToWebGL(): Promise<void> {
    if (this.starfieldInstance?.destroy) {
      this.starfieldInstance.destroy();
    }
    await this.initWebGLStarfield();
  }

  private async fallbackToCSS(): Promise<void> {
    if (this.starfieldInstance?.destroy) {
      this.starfieldInstance.destroy();
    }
    await this.initCSSStarfield();
  }

  destroy(): void {
    if (this.starfieldInstance?.destroy) {
      this.starfieldInstance.destroy();
    }
  }
}
