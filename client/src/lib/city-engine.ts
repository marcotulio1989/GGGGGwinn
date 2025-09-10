import { Building, Window, CityParameters } from "@/types/city";

export class CityEngine {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private buildings: Building[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  generateCity(params: CityParameters): Building[] {
    this.buildings = [];
    const gridSize = params.streetWidth;
    const buildingDensity = params.buildingDensity;
    const maxHeight = params.buildingHeight;
    const variation = params.variation / 100;
    
    const cityWidth = params.citySize * 10;
    const cityHeight = params.citySize * 10;

    for (let x = -cityWidth/2; x < cityWidth/2; x += gridSize) {
      for (let y = -cityHeight/2; y < cityHeight/2; y += gridSize) {
        if (Math.random() < buildingDensity) {
          const building: Building = {
            x: x + (Math.random() - 0.5) * gridSize * variation,
            y: y + (Math.random() - 0.5) * gridSize * variation,
            width: gridSize * 0.7 + Math.random() * gridSize * 0.2 * variation,
            height: gridSize * 0.7 + Math.random() * gridSize * 0.2 * variation,
            depth: 20 + Math.random() * maxHeight,
            color: this.generateBuildingColor(),
            windows: this.generateWindows()
          };
          this.buildings.push(building);
        }
      }
    }

    return this.buildings;
  }

  private generateBuildingColor(): string {
    const colors = [
      '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a',
      '#374151', '#4b5563', '#6b7280', '#9ca3af',
      '#06b6d4', '#0891b2', '#0e7490', '#155e75'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private generateWindows(): Window[] {
    const windows: Window[] = [];
    const windowCount = Math.floor(Math.random() * 20) + 5;
    
    for (let i = 0; i < windowCount; i++) {
      windows.push({
        x: Math.random(),
        y: Math.random(),
        lit: Math.random() > 0.3
      });
    }
    
    return windows;
  }

  render(camera: { x: number; y: number; zoom: number }) {
    // Clear canvas
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Save context for camera transform
    this.ctx.save();
    
    // Apply camera transform
    this.ctx.translate(this.canvas.width / 2 + camera.x, this.canvas.height / 2 + camera.y);
    this.ctx.scale(camera.zoom, camera.zoom);

    // Sort buildings by depth for proper 3D rendering
    const sortedBuildings = [...this.buildings].sort((a, b) => a.y + a.height - (b.y + b.height));

    // Render buildings
    sortedBuildings.forEach(building => {
      this.renderBuilding(building);
    });

    // Restore context
    this.ctx.restore();
  }

  private renderBuilding(building: Building) {
    const { x, y, width, height, depth, color, windows } = building;

    // Building base (front face)
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, width, height);

    // Building top (roof)
    this.ctx.fillStyle = this.lightenColor(color, 0.2);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(x + width, y);
    this.ctx.lineTo(x + width + depth * 0.5, y - depth * 0.5);
    this.ctx.lineTo(x + depth * 0.5, y - depth * 0.5);
    this.ctx.closePath();
    this.ctx.fill();

    // Building side (right face)
    this.ctx.fillStyle = this.darkenColor(color, 0.3);
    this.ctx.beginPath();
    this.ctx.moveTo(x + width, y);
    this.ctx.lineTo(x + width, y + height);
    this.ctx.lineTo(x + width + depth * 0.5, y + height - depth * 0.5);
    this.ctx.lineTo(x + width + depth * 0.5, y - depth * 0.5);
    this.ctx.closePath();
    this.ctx.fill();

    // Windows
    windows.forEach(window => {
      const windowX = x + window.x * width * 0.8 + width * 0.1;
      const windowY = y + window.y * height * 0.8 + height * 0.1;
      const windowSize = 3;

      this.ctx.fillStyle = window.lit ? '#fbbf24' : '#1f2937';
      this.ctx.fillRect(windowX, windowY, windowSize, windowSize);
    });

    // Building outline
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.lineWidth = 0.5;
    this.ctx.strokeRect(x, y, width, height);
  }

  private lightenColor(color: string, factor: number): string {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    return `rgb(${Math.min(255, r + r * factor)}, ${Math.min(255, g + g * factor)}, ${Math.min(255, b + b * factor)})`;
  }

  private darkenColor(color: string, factor: number): string {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    return `rgb(${Math.max(0, r - r * factor)}, ${Math.max(0, g - g * factor)}, ${Math.max(0, b - b * factor)})`;
  }

  getBuildingCount(): number {
    return this.buildings.length;
  }

  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
}
