declare global {
  interface Navigator {
    gpu?: GPU;
  }

  interface HTMLCanvasElement {
    getContext(contextId: "webgpu"): GPUCanvasContext | null;
  }
}

export interface GPU {
  requestAdapter(): Promise<GPUAdapter | null>;
  getPreferredCanvasFormat(): GPUTextureFormat;
}

export interface GPUAdapter {
  requestDevice(): Promise<GPUDevice>;
}

export interface GPUDevice {
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createBindGroupLayout(
    descriptor: GPUBindGroupLayoutDescriptor,
  ): GPUBindGroupLayout;
  createComputePipeline(
    descriptor: GPUComputePipelineDescriptor,
  ): GPUComputePipeline;
  createRenderPipeline(
    descriptor: GPURenderPipelineDescriptor,
  ): GPURenderPipeline;
  createPipelineLayout(
    descriptor: GPUPipelineLayoutDescriptor,
  ): GPUPipelineLayout;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createCommandEncoder(): GPUCommandEncoder;
  queue: GPUQueue;
}

export interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void;
  getCurrentTexture(): GPUTexture;
}

export interface GPUBuffer {}
export interface GPUBindGroup {}
export interface GPURenderPipeline {}
export interface GPUComputePipeline {}
export interface GPUShaderModule {}
export interface GPUBindGroupLayout {}
export interface GPUPipelineLayout {}

export interface GPUCommandEncoder {
  beginComputePass(): GPUComputePassEncoder;
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  finish(): GPUCommandBuffer;
}

export interface GPUQueue {
  writeBuffer(
    buffer: GPUBuffer,
    bufferOffset: number,
    data: ArrayBuffer | ArrayBufferView,
  ): void;
  submit(commandBuffers: GPUCommandBuffer[]): void;
}

export interface GPUTexture {
  createView(): GPUTextureView;
}

export interface GPUTextureView {}
export interface GPUCommandBuffer {}

export interface GPUComputePassEncoder {
  setPipeline(pipeline: GPUComputePipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  dispatchWorkgroups(
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number,
  ): void;
  end(): void;
}

export interface GPURenderPassEncoder {
  setPipeline(pipeline: GPURenderPipeline): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
  end(): void;
}

export type GPUTextureFormat = string;
export type GPUShaderModuleDescriptor = { code: string };
export type GPUBufferDescriptor = { size: number; usage: number };
export type GPUBindGroupLayoutDescriptor = any;
export type GPUComputePipelineDescriptor = any;
export type GPURenderPipelineDescriptor = any;
export type GPUPipelineLayoutDescriptor = any;
export type GPUBindGroupDescriptor = any;
export type GPUCanvasConfiguration = any;
export type GPURenderPassDescriptor = any;

export interface GPUBufferUsageConstants {
  UNIFORM: number;
  STORAGE: number;
  COPY_DST: number;
}

export interface GPUShaderStageConstants {
  COMPUTE: number;
  VERTEX: number;
  FRAGMENT: number;
}

export const GPUBufferUsage: GPUBufferUsageConstants = (globalThis as any)
  .GPUBufferUsage || {
  UNIFORM: 0x40,
  STORAGE: 0x80,
  COPY_DST: 0x08,
};

export const GPUShaderStage: GPUShaderStageConstants = (globalThis as any)
  .GPUShaderStage || {
  COMPUTE: 0x4,
  VERTEX: 0x1,
  FRAGMENT: 0x2,
};
