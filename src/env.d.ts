/// <reference types="astro/client" />

declare module "@sudeepg95/legendary-cursor" {
  interface LegendaryCursorConfig {
    lineSize?: number;
    opacityDecrement?: number;
    speedExpFactor?: number;
    lineExpFactor?: number;
    sparklesCount?: number;
    maxOpacity?: number;
    texture1?: string;
    texture2?: string;
    texture3?: string;
  }

  const LegendaryCursor: {
    init(config: LegendaryCursorConfig): void;
  };

  export default LegendaryCursor;
}
