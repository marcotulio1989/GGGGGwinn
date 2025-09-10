export interface Building {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  color: string;
  windows: Window[];
}

export interface Window {
  x: number;
  y: number;
  lit: boolean;
}

export interface CityParameters {
  citySize: number;
  buildingDensity: number;
  buildingHeight: number;
  streetWidth: number;
  variation: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface CityPreset {
  name: string;
  icon: string;
  parameters: CityParameters;
}
