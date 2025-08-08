import type {
  GPUDevice,
  GPUCanvasContext,
  GPURenderPipeline,
  GPUComputePipeline,
  GPUBuffer,
  GPUBindGroup,
} from "./webgpu";
import { GPUBufferUsage, GPUShaderStage } from "./webgpu";
import type { StarfieldRenderer as LaserfieldRenderer } from "./graphics";

export class WebGPULaserfield implements LaserfieldRenderer {
  private device: GPUDevice | null = null;
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private computePipeline: GPUComputePipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private laserBuffer: GPUBuffer | null = null;
  private computeBindGroup: GPUBindGroup | null = null;
  private renderBindGroup: GPUBindGroup | null = null;
  private animationId: number = 0;
  private startTime: number = performance.now();
  private mousePos: [number, number] = [0, 0];
  private laserCount: number;

  constructor(canvas: HTMLCanvasElement, laserCount = 800) {
    this.canvas = canvas;
    this.laserCount = Math.min(laserCount, window.innerWidth < 768 ? 400 : 800);
  }

  async init(): Promise<boolean> {
    if (!navigator.gpu) {
      console.debug("WebGPU not supported, need to fall back to Canvas2D");
      return false;
    }

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) {
        console.debug("WebGPU adapter not available");
        return false;
      }

      this.device = await adapter.requestDevice();
      this.context = this.canvas.getContext(
        "webgpu",
      ) as GPUCanvasContext | null;

      if (!this.context) {
        console.debug("WebGPU context not available");
        return false;
      }

      await this.setupWebGPU();
      this.setupEventListeners();
      this.render();

      return true;
    } catch (error) {
      console.debug("WebGPU initialization failed:", error);
      return false;
    }
  }

  private async setupWebGPU() {
    if (!this.device || !this.context) return;

    // Ensure the canvas has the correct dimensions before we start using its width/height.
    this.resize();

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: canvasFormat,
      alphaMode: "premultiplied",
    });

    const computeShaderCode = `
      struct Laser {
        position: vec3<f32>,
        size: f32,
        velocity: vec3<f32>,
        life: f32,
        color: vec3<f32>,
        twinkle: f32,
      }

      struct Uniforms {
        time: f32,              // offset 0, size 4
        resolution: vec2<f32>,  // offset 4, size 8
        mousePos: vec2<f32>,    // offset 12, size 8
        starCount: f32,         // offset 20, size 4
        _padding: vec3<f32>,    // padding to ensure 48-byte alignment
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var<storage, read_write> lasers: array<Laser>;

      @compute @workgroup_size(64)
      fn computeMain(@builtin(global_invocation_id) id: vec3<u32>) {
        let index = id.x;
        if (index >= u32(uniforms.laserCount)) { return; }

        var laser = lasers[index];
        let dt = 0.016; // ~60fps

        // Update position
        laser.position = laser.position + laser.velocity * dt;
        
        // Warp speed effect towards mouse
        let mouseNorm = (uniforms.mousePos * 2.0 - 1.0) * vec2<f32>(1.0, -1.0);
        let attraction = mouseNorm * 0.001;
        laser.velocity = vec3<f32>(laser.velocity.xy + attraction, laser.velocity.z);
        
        // Reset stars that go off screen
        if (laser.position.z > 1.0 || 
            abs(laser.position.x) > 2.0 || 
            abs(laser.position.y) > 2.0) {
          let newDepth = 0.3 + fract(sin(f32(index) * 45.678) * 43758.5453) * 0.7;
          laser.position = vec3<f32>(
            (fract(sin(f32(index) * 12.9898) * 43758.5453) - 0.5) * 2.0 * newDepth,
            (fract(sin(f32(index) * 78.233) * 43758.5453) - 0.5) * 2.0 * newDepth,
            newDepth
          );
          laser.velocity = vec3<f32>(0.0, 0.0, 0.1 + fract(sin(f32(index) * 91.3737) * 43758.5453) * 0.05);
          laser.life = 1.0;
        }

        stars[index] = star;
      }
    `;

    const vertexShaderCode = `
      struct Uniforms {
        time: f32,              // offset 0, size 4
        resolution: vec2<f32>,  // offset 4, size 8
        mousePos: vec2<f32>,    // offset 12, size 8
        starCount: f32,         // offset 20, size 4
        _padding: vec3<f32>,    // padding to ensure 48-byte alignment
      }

      struct Star {
        position: vec3<f32>,
        size: f32,
        velocity: vec3<f32>,
        life: f32,
        color: vec3<f32>,
        twinkle: f32,
      }

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) alpha: f32,
        @location(1) color: vec3<f32>,
        @location(2) uv: vec2<f32>,
        @location(3) twinkle: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var<storage, read> stars: array<Star>;

      @vertex
      fn vertexMain(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
        let star = stars[instanceIndex];
        
        // Create quad vertices (to be oriented in screen space)
        var positions = array<vec2<f32>, 6>(
          vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
          vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
        );
        
        let quadPos = positions[vertexIndex];
        let aspect = uniforms.resolution.x / uniforms.resolution.y;
        
        // Project 3D position to screen space
        let depth = max(star.position.z, 0.01);
        let screenPos = star.position.xy / depth;
        
        // Enlarge base size for visibility
        let baseSize = (star.size + star.position.z) * 0.014;

        // Approximate screen-space motion direction: dominated by perspective pull toward center
        // dir ~ -position.xy component (optionally nudged by velocity.xy)
        var motionDir = -star.position.xy;
        motionDir = motionDir + star.velocity.xy * 0.25; // small nudge from xy velocity
        var dir = vec2<f32>(0.0, 1.0);
        let dirLen = length(motionDir);
        if (dirLen > 0.0001) {
          dir = motionDir / dirLen;
        }

        // Account for aspect ratio so orientation matches on screen
        let dirAspect = normalize(vec2<f32>(dir.x / aspect, dir.y));
        let perp = vec2<f32>(-dirAspect.y, dirAspect.x);

        // Estimate screen-space speed to scale trail length
        let screenSpeed = (length(star.position.xy) * star.velocity.z) / (depth * depth + 1e-5);
        let spriteWidth = baseSize;
        let spriteLength = baseSize * (1.0 + screenSpeed * 300.0);

        // Build oriented quad in screen space
        let offset = perp * quadPos.x * spriteWidth + dirAspect * quadPos.y * spriteLength;
        let finalPos = screenPos + offset;
        
        var output: VertexOutput;
        output.position = vec4<f32>(finalPos, 0.0, 1.0);
        output.alpha = clamp(star.life * (1.0 - star.position.z) * 1.2, 0.0, 1.0);
        output.color = star.color;
        output.uv = quadPos; // oriented-quad UV
        output.twinkle = star.twinkle;
        
        return output;
      }
    `;

    const fragmentShaderCode = `
      struct Uniforms {
        time: f32,
        resolution: vec2<f32>,
        mousePos: vec2<f32>,
        starCount: f32,
        _padding: vec3<f32>,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;

      @fragment
      fn fragmentMain(
        @location(0) alpha: f32,
        @location(1) color: vec3<f32>,
        @location(2) uv: vec2<f32>,
        @location(3) twinkle: f32
      ) -> @location(0) vec4<f32> {
        // Oriented rectangle mask in UV
        if (abs(uv.x) > 1.0 || abs(uv.y) > 1.0) {
          discard;
        }

        // Across-trail profile: soft edges, bright center
        let across = 1.0 - abs(uv.x);
        let widthProfile = pow(max(0.0, across), 3.0);

        // Along-trail profile: brighter head (uv.y ~ 1), softer tail (uv.y ~ -1)
        let headGlow = exp(- (1.0 - uv.y) * (1.0 - uv.y) * 4.0);
        let tailGlow = exp(- (uv.y + 1.0) * (uv.y + 1.0) * 1.5);
        let lengthProfile = max(headGlow, tailGlow);

        let sparkle = 0.5 + 0.5 * sin(uniforms.time * 6.0 + twinkle);
        let intensity = widthProfile * lengthProfile * sparkle;
        return vec4<f32>(color * intensity, alpha * intensity);
      }
    `;

    const computeShader = this.device.createShaderModule({
      code: computeShaderCode,
    });
    const vertexShader = this.device.createShaderModule({
      code: vertexShaderCode,
    });
    const fragmentShader = this.device.createShaderModule({
      code: fragmentShaderCode,
    });

    this.uniformBuffer = this.device.createBuffer({
      size: 48, // Aligned to 16-byte boundary: time(4) + resolution(8) + mousePos(8) + starCount(4) + padding(12) + alignment = 48 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Each Star struct in WGSL requires 48 bytes due to 16-byte alignment rules (vec3 pads to 16).
    // Allocate 48 bytes per laser and write 12 floats for initial data.
    this.laserBuffer = this.device.createBuffer({
      size: this.laserCount * 48, // 12 floats per laser * 4 bytes = 48 bytes per laser
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const initialLaserData = new Float32Array(this.laserCount * 12);
    for (let i = 0; i < this.laserCount; i++) {
      const offset = i * 12;
      // Choose depth first so we can keep x/y within clip space (|x|,|y| ≤ depth)
      const depth = 0.3 + Math.random() * 0.7; // z in 0.3‒1.0
      initialLaserData[offset + 2] = depth;
      initialLaserData[offset + 0] = (Math.random() - 0.5) * 2 * depth; // x within [-depth, depth]
      initialLaserData[offset + 1] = (Math.random() - 0.5) * 2 * depth; // y within [-depth, depth]
      initialLaserData[offset + 3] = 1.0 + Math.random() * 2.0; // size

      // velocity (vec3) + pad
      initialLaserData[offset + 4] = 0.0; // vel.x
      initialLaserData[offset + 5] = 0.0; // vel.y
      initialLaserData[offset + 6] = 0.1 + Math.random() * 0.05; // vel.z
      initialLaserData[offset + 7] = 1.0; // life

      // vibrant color (vec3) + pad
      const r = 0.6 + Math.random() * 0.4;
      const g = 0.6 + Math.random() * 0.4;
      const b = 0.6 + Math.random() * 0.4;
      // Normalise so at least one channel is 1.0 for punchier brightness
      const maxRGB = Math.max(r, g, b);
      initialLaserData[offset + 8] = r / maxRGB;
      initialLaserData[offset + 9] = g / maxRGB;
      initialLaserData[offset + 10] = b / maxRGB;
      initialLaserData[offset + 11] = Math.random() * Math.PI * 2; // twinkle phase
    }

    this.device.queue.writeBuffer(this.laserBuffer, 0, initialLaserData);

    // Create separate bind group layouts for compute and render pipelines
    const computeBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: "storage" },
        },
      ],
    });

    const renderBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: "read-only-storage" as any },
        },
      ],
    });

    this.computePipeline = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [computeBindGroupLayout],
      }),
      compute: { module: computeShader, entryPoint: "computeMain" },
    });

    this.renderPipeline = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({
        bindGroupLayouts: [renderBindGroupLayout],
      }),
      vertex: { module: vertexShader, entryPoint: "vertexMain" },
      fragment: {
        module: fragmentShader,
        entryPoint: "fragmentMain",
        targets: [
          {
            format: canvasFormat,
            blend: {
              color: {
                operation: "add",
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
              },
              alpha: {
                operation: "add",
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
              },
            },
          },
        ],
      },
      primitive: { topology: "triangle-list" },
    });

    this.computeBindGroup = this.device.createBindGroup({
      layout: computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.laserBuffer } },
      ],
    });

    this.renderBindGroup = this.device.createBindGroup({
      layout: renderBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.laserBuffer } },
      ],
    });
  }

  private setupEventListeners() {
    const updateMouse = (e: MouseEvent | TouchEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      let clientX: number, clientY: number;

      if ("touches" in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ("clientX" in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      } else {
        return;
      }

      this.mousePos = [
        (clientX - rect.left) / rect.width,
        (clientY - rect.top) / rect.height,
      ];
    };

    window.addEventListener("mousemove", updateMouse);
    window.addEventListener("touchmove", updateMouse);
    window.addEventListener("resize", () => this.resize());
  }

  private resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  private render = () => {
    if (
      !this.device ||
      !this.context ||
      !this.uniformBuffer ||
      !this.computePipeline ||
      !this.renderPipeline ||
      !this.computeBindGroup ||
      !this.renderBindGroup
    ) {
      return;
    }

    const currentTime = (performance.now() - this.startTime) / 1000;

    // WGSL std140-like layout: time (offset 0), padding 1 float, resolution.xy (floats 2-3),
    // mousePos.xy (floats 4-5), starCount (float 6), remaining padding 7-11.
    const uniformData = new Float32Array(12);
    uniformData[0] = currentTime; // time
    // uniformData[1] is padding
    uniformData[2] = this.canvas.width; // resolution.x
    uniformData[3] = this.canvas.height; // resolution.y
    uniformData[4] = this.mousePos[0]; // mousePos.x
    uniformData[5] = this.mousePos[1]; // mousePos.y
    uniformData[6] = this.laserCount; // laserCount
    // uniformData[7-11] remain 0 as padding

    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    const commandEncoder = this.device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.laserCount / 64));
    computePass.end();

    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0.1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    renderPass.setPipeline(this.renderPipeline);
    renderPass.setBindGroup(0, this.renderBindGroup);
    renderPass.draw(6, this.laserCount);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);

    this.animationId = requestAnimationFrame(this.render);
  };

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}
