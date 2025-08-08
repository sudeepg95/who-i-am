import type {
  GPUDevice,
  GPUCanvasContext,
  GPURenderPipeline,
  GPUComputePipeline,
  GPUBuffer,
  GPUBindGroup,
} from "./webgpu";
import { GPUBufferUsage, GPUShaderStage } from "./webgpu";
import type { StarfieldRenderer as SnowfieldRenderer } from "./graphics";

export class WebGPUSnowfield implements SnowfieldRenderer {
  private device: GPUDevice | null = null;
  private canvas: HTMLCanvasElement;
  private context: GPUCanvasContext | null = null;
  private renderPipeline: GPURenderPipeline | null = null;
  private computePipeline: GPUComputePipeline | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private snowBuffer: GPUBuffer | null = null;
  private computeBindGroup: GPUBindGroup | null = null;
  private renderBindGroup: GPUBindGroup | null = null;
  private animationId: number = 0;
  private startTime: number = performance.now();
  private mousePos: [number, number] = [0, 0];
  private snowCount: number;

  constructor(canvas: HTMLCanvasElement, snowCount = 800) {
    this.canvas = canvas;
    this.snowCount = Math.min(snowCount, window.innerWidth < 768 ? 400 : 800);
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
      struct Snow {
        position: vec3<f32>,
        size: f32,
        velocity: vec3<f32>,
        life: f32,
        color: vec3<f32>,
        _pad: f32,
      }

      struct Uniforms {
        time: f32,
        resolution: vec2<f32>,
        mousePos: vec2<f32>,  
        snowCount: f32,
        _padding: vec3<f32>,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var<storage, read_write> snows: array<Snow>;

      @compute @workgroup_size(64)
      fn computeMain(@builtin(global_invocation_id) id: vec3<u32>) {
        let index = id.x;
        if (index >= u32(uniforms.snowCount)) { return; }

        var snow = snows[index];
        let dt = 0.016;

        // Update position
        snow.position = snow.position + snow.velocity * dt;
        
        // Warp speed effect towards mouse
        let mouseNorm = (uniforms.mousePos * 2.0 - 1.0) * vec2<f32>(1.0, -1.0);
        let attraction = mouseNorm * 0.001;
        snow.velocity = vec3<f32>(snow.velocity.xy + attraction, snow.velocity.z);
        
        // Reset snow that go off screen
        if (snow.position.z > 1.0 || 
            abs(snow.position.x) > 2.0 || 
            abs(snow.position.y) > 2.0) {
          let newDepth = 0.3 + fract(sin(f32(index) * 45.678) * 43758.5453) * 0.7;
          snow.position = vec3<f32>(
            (fract(sin(f32(index) * 12.9898) * 43758.5453) - 0.5) * 2.0 * newDepth,
            (fract(sin(f32(index) * 78.233) * 43758.5453) - 0.5) * 2.0 * newDepth,
            newDepth
          );
          snow.velocity = vec3<f32>(0.0, 0.0, 0.1 + fract(sin(f32(index) * 91.3737) * 43758.5453) * 0.05);
          snow.life = 1.0;
        }

        snows[index] = snow;
      }
    `;

    const vertexShaderCode = `
      struct Uniforms {
        time: f32,
        resolution: vec2<f32>,
        mousePos: vec2<f32>,
        snowCount: f32,
        _padding: vec3<f32>,
      }

      struct Snow {
        position: vec3<f32>,
        size: f32,
        velocity: vec3<f32>,
        life: f32,
        color: vec3<f32>,
        _pad: f32,
      }

      struct VertexOutput {
        @builtin(position) position: vec4<f32>,
        @location(0) alpha: f32,
        @location(1) color: vec3<f32>,
        @location(2) uv: vec2<f32>,
      }

      @group(0) @binding(0) var<uniform> uniforms: Uniforms;
      @group(0) @binding(1) var<storage, read> snows: array<Snow>;

      @vertex
      fn vertexMain(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
        let snow = snows[instanceIndex];
        
        // Create quad vertices for point sprite
        var positions = array<vec2<f32>, 6>(
          vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
          vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
        );
        
        let quadPos = positions[vertexIndex];
        let aspect = uniforms.resolution.x / uniforms.resolution.y;
        
        // Project 3D position to screen space
        let depth = max(snow.position.z, 0.01);
        let screenPos = snow.position.xy / depth;
        
        // Add quad offset for point sprite
        let snowSize = (snow.size + snow.position.z) * 0.012;
        let finalPos = screenPos + quadPos * snowSize * vec2<f32>(1.0 / aspect, 1.0);
        
        var output: VertexOutput;
        output.position = vec4<f32>(finalPos, 0.0, 1.0);
        output.alpha = snow.life * (1.0 - snow.position.z) * 0.8;
        output.color = snow.color;
        output.uv = quadPos;
        
        return output;
      }
    `;

    const fragmentShaderCode = `
      @fragment
      fn fragmentMain(
        @location(0) alpha: f32,
        @location(1) color: vec3<f32>,
        @location(2) uv: vec2<f32>
      ) -> @location(0) vec4<f32> {
        let dist2 = dot(uv, uv);
        if (dist2 > 1.0) {
          discard;
        }
        let falloff = pow(max(0.0, 1.0 - dist2), 6.0);
        return vec4<f32>(color * falloff, alpha * falloff);
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
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Each Snow struct in WGSL requires 48 bytes due to 16-byte alignment rules (vec3 pads to 16).
    // Allocate 48 bytes per snow and write 12 floats for initial data.
    this.snowBuffer = this.device.createBuffer({
      size: this.snowCount * 48, // 12 floats per snow * 4 bytes = 48 bytes per snow
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    const initialSnowData = new Float32Array(this.snowCount * 12);
    for (let i = 0; i < this.snowCount; i++) {
      const offset = i * 12;
      const depth = 0.3 + Math.random() * 0.7;
      initialSnowData[offset + 2] = depth;
      initialSnowData[offset + 0] = (Math.random() - 0.5) * 2 * depth;
      initialSnowData[offset + 1] = (Math.random() - 0.5) * 2 * depth;
      initialSnowData[offset + 3] = 1.0 + Math.random() * 2.0;

      initialSnowData[offset + 4] = 0.0;
      initialSnowData[offset + 5] = 0.0;
      initialSnowData[offset + 6] = 0.1 + Math.random() * 0.05;
      initialSnowData[offset + 7] = 1.0;

      const r = 0.6 + Math.random() * 0.4;
      const g = 0.6 + Math.random() * 0.4;
      const b = 0.6 + Math.random() * 0.4;
      // Normalise so at least one channel is 1.0 for punchier brightness
      const maxRGB = Math.max(r, g, b);
      initialSnowData[offset + 8] = r / maxRGB;
      initialSnowData[offset + 9] = g / maxRGB;
      initialSnowData[offset + 10] = b / maxRGB;
      initialSnowData[offset + 11] = 0.0;
    }

    this.device.queue.writeBuffer(this.snowBuffer, 0, initialSnowData);

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
        { binding: 1, resource: { buffer: this.snowBuffer } },
      ],
    });

    this.renderBindGroup = this.device.createBindGroup({
      layout: renderBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.snowBuffer } },
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

    const uniformData = new Float32Array(12);
    uniformData[0] = currentTime;
    uniformData[2] = this.canvas.width;
    uniformData[3] = this.canvas.height;
    uniformData[4] = this.mousePos[0];
    uniformData[5] = this.mousePos[1];
    uniformData[6] = this.snowCount;

    this.device.queue.writeBuffer(this.uniformBuffer, 0, uniformData);

    const commandEncoder = this.device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass();
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(Math.ceil(this.snowCount / 64));
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
    renderPass.draw(6, this.snowCount);
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
