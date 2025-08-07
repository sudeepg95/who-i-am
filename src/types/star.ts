import type { StarInterface } from "./graphics";

export class Star implements StarInterface {
  x: number;
  y: number;
  z: number;
  xPrev: number;
  yPrev: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.xPrev = x;
    this.yPrev = y;
  }

  update(width: number, height: number, speed: number) {
    this.xPrev = this.x;
    this.yPrev = this.y;
    this.z += speed * 0.0675;
    this.x += this.x * (speed * 0.0225) * this.z;
    this.y += this.y * (speed * 0.0225) * this.z;
    if (
      this.x > width / 2 ||
      this.x < -width / 2 ||
      this.y > height / 2 ||
      this.y < -height / 2
    ) {
      this.x = Math.random() * width - width / 2;
      this.y = Math.random() * height - height / 2;
      this.xPrev = this.x;
      this.yPrev = this.y;
      this.z = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.lineWidth = this.z;
    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.xPrev, this.yPrev);
    ctx.stroke();
  }
}
