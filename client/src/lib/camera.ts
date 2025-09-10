import { Camera } from "@/types/city";

export class CameraController {
  private camera: Camera;
  private canvas: HTMLCanvasElement;
  private isDragging = false;
  private lastMousePos = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Mouse events
    this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.canvas.addEventListener('wheel', this.handleWheel.bind(this));

    // Touch events
    this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
    this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
    this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this));
  }

  private handleMouseDown(e: MouseEvent) {
    this.isDragging = true;
    this.lastMousePos = { x: e.clientX, y: e.clientY };
  }

  private handleMouseMove(e: MouseEvent) {
    if (this.isDragging) {
      const deltaX = e.clientX - this.lastMousePos.x;
      const deltaY = e.clientY - this.lastMousePos.y;
      
      this.camera.x += deltaX / this.camera.zoom;
      this.camera.y += deltaY / this.camera.zoom;
      
      this.lastMousePos = { x: e.clientX, y: e.clientY };
    }
  }

  private handleMouseUp() {
    this.isDragging = false;
  }

  private handleWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const newZoom = this.camera.zoom * (1 - e.deltaY * zoomSpeed * 0.01);
    this.camera.zoom = Math.max(0.5, Math.min(3, newZoom));
  }

  private handleTouchStart(e: TouchEvent) {
    e.preventDefault();
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.isDragging = true;
      this.lastMousePos = { x: touch.clientX, y: touch.clientY };
    }
  }

  private handleTouchMove(e: TouchEvent) {
    e.preventDefault();
    if (this.isDragging && e.touches.length === 1) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - this.lastMousePos.x;
      const deltaY = touch.clientY - this.lastMousePos.y;
      
      this.camera.x += deltaX / this.camera.zoom;
      this.camera.y += deltaY / this.camera.zoom;
      
      this.lastMousePos = { x: touch.clientX, y: touch.clientY };
    }
  }

  private handleTouchEnd(e: TouchEvent) {
    e.preventDefault();
    this.isDragging = false;
  }

  getCamera(): Camera {
    return { ...this.camera };
  }

  resetCamera() {
    this.camera = { x: 0, y: 0, zoom: 1 };
  }

  getZoomPercentage(): number {
    return Math.round(this.camera.zoom * 100);
  }
}
