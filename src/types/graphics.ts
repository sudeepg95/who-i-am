export interface DeviceCapabilities {
  isLowEnd: boolean;
  isMobile: boolean;
  supportsWebGPU: boolean;
  prefersReducedMotion: boolean;
  hasGoodGPU: boolean;
  batteryLevel?: number;
}

export type RendererType = "webgpu" | "webgl" | "css" | "none";

export interface StarfieldRenderer {
  init(): Promise<boolean>;
  destroy(): void;
}

export interface StarInterface {
  x: number;
  y: number;
  z: number;
  xPrev: number;
  yPrev: number;
  update(width: number, height: number, speed: number): void;
  draw(ctx: CanvasRenderingContext2D): void;
}

export interface PerformanceMetrics {
  fps: number;
  frameCount: number;
  lastTime: number;
}
