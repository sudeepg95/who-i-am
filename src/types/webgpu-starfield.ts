import type {
  GPUDevice,
  GPUCanvasContext,
  GPURenderPipeline,
  GPUComputePipeline,
  GPUBuffer,
  GPUBindGroup,
} from "./webgpu";
import { GPUBufferUsage, GPUShaderStage } from "./webgpu";
import type { StarfieldRenderer } from "./graphics";

export class WebGPUStarfield implements StarfieldRenderer {
  private device: GPUDevice | null = null;
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private computePipeline: GPUComputePipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private starBuffer: GPUBuffer | null = null;
  private computeBindGroup: GPUBindGroup | null = null;
  private renderBindGroup: GPUBindGroup | null = null;
  private animationId: number = 0;
  private startTime: number = performance.now();
  private mousePos: [number, number] = [0, 0];
  private starCount: number;

  constructor(canvas: HTMLCanvasElement, starCount = 800) {
    this.canvas = canvas;
    this.starCount = Math.min(starCount, window.innerWidth < 768 ? 400 : 800);
  }

  async init(): Promise<boolean> {
    if (!navigator.gpu) {
      console.debug("WebGPU not supported, falling back to Canvas2D");
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

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device: this.device,
      format: canvasFormat,
      alphaMode: "premultiplied",
    });

    const computeShaderCode = `
      struct Star {
        position: vec3<f32>,
        velocity: vec3<f32>,
        life: f32,
        size: f32,
      }

      struct Uniforms {
        time: f32,              // offset 0, size 4
        resolution: vec2<f32>,  // offset 4, size 8
        mousePos: vec2<f32>,    // offset 12, size 8
        starCount: f32,         // offset 20, size 4
        _padding: vec3<f32>,    // padding to ensure 48-byte alignment
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var<storage, read_write> stars: array<Star>;

      @compute @workgroup_size(64)
      fn computeMain(@builtin(global_invocation_id) id: vec3<u32>) {
        let index = id.x;
        if (index >= u32(uniforms.starCount)) { return; }

        var star = stars[index];
        let dt = 0.016; // ~60fps

        // Update position
        star.position = star.position + star.velocity * dt;
        
        // Warp speed effect towards mouse
        let mouseNorm = (uniforms.mousePos * 2.0 - 1.0) * vec2<f32>(1.0, -1.0);
        let attraction = mouseNorm * 0.001;
        star.velocity = vec3<f32>(star.velocity.xy + attraction, star.velocity.z);
        
        // Reset stars that go off screen
        if (star.position.z > 1.0 || 
            abs(star.position.x) > 2.0 || 
            abs(star.position.y) > 2.0) {
          star.position = vec3<f32>(
            (fract(sin(f32(index) * 12.9898) * 43758.5453) - 0.5) * 4.0,
            (fract(sin(f32(index) * 78.233) * 43758.5453) - 0.5) * 4.0,
            0.0
          );
          star.velocity = vec3<f32>(0.0, 0.0, 0.1 + fract(sin(f32(index) * 91.3737) * 43758.5453) * 0.05);
          star.life = 1.0;
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
        velocity: vec3<f32>,
        life: f32,
        size: f32,
      }

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) alpha: f32,
        @location(1) size: f32,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var<storage, read> stars: array<Star>;

      @vertex
      fn vertexMain(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
        let star = stars[instanceIndex];
        
        // Create quad vertices for point sprite
        var positions = array<vec2<f32>, 6>(
          vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
          vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
        );
        
        let quadPos = positions[vertexIndex];
        let aspect = uniforms.resolution.x / uniforms.resolution.y;
        
        // Project 3D position to screen space
        let depth = max(star.position.z, 0.01);
        let screenPos = star.position.xy / depth;
        
        // Add quad offset for point sprite
        let starSize = (star.size + star.position.z) * 0.02;
        let finalPos = screenPos + quadPos * starSize * vec2<f32>(1.0 / aspect, 1.0);
        
        var output: VertexOutput;
        output.position = vec4<f32>(finalPos, 0.0, 1.0);
        output.alpha = star.life * (1.0 - star.position.z) * 0.8;
        output.size = starSize;
        
        return output;
      }
    `;

    const fragmentShaderCode = `
      @fragment
      fn fragmentMain(@location(0) alpha: f32, @location(1) size: f32) -> @location(0) vec4<f32> {
        return vec4<f32>(1.0, 1.0, 1.0, alpha);
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

    this.starBuffer = this.device.createBuffer({
      size: this.starCount * 32, // 8 floats per star * 4 bytes = 32 bytes per star
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const initialStarData = new Float32Array(this.starCount * 8);
    for (let i = 0; i < this.starCount; i++) {
      const offset = i * 8;
      initialStarData[offset + 0] = (Math.random() - 0.5) * 4; // x
      initialStarData[offset + 1] = (Math.random() - 0.5) * 4; // y
      initialStarData[offset + 2] = Math.random(); // z
      initialStarData[offset + 3] = 0; // vx
      initialStarData[offset + 4] = 0; // vy
      initialStarData[offset + 5] = 0.1 + Math.random() * 0.05; // vz
      initialStarData[offset + 6] = 1.0; // life
      initialStarData[offset + 7] = 1.0 + Math.random() * 2.0; // size
    }

    this.device.queue.writeBuffer(this.starBuffer, 0, initialStarData);

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
          visibility: GPUShaderStage.VERTEX,
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
        { binding: 1, resource: { buffer: this.starBuffer } },
      ],
    });

    this.renderBindGroup = this.device.createBindGroup({
      layout: renderBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.starBuffer } },
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

    const uniformData = new Float32Array(12); // 48 bytes / 4 bytes per float = 12 floats
    uniformData[0] = currentTime; // time: f32
    uniformData[1] = this.canvas.width; // resolution.x: f32
    uniformData[2] = this.canvas.height; // resolution.y: f32
    uniformData[3] = this.mousePos[0]; // mousePos.x: f32
    uniformData[4] = this.mousePos[1]; // mousePos.y: f32
    uniformData[5] = this.starCount; // starCount: f32
    // uniformData[6-11] are padding (_padding: vec3<f32> + alignment)

    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    const commandEncoder = this.device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.starCount / 64));
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
    renderPass.draw(6, this.starCount);
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
