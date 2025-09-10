import { Button } from "@/components/ui/button";
import { CityParameters, CityPreset } from "@/types/city";

interface ControlPanelProps {
  parameters: CityParameters;
  onParameterChange: (key: keyof CityParameters, value: number) => void;
  onPresetSelect: (preset: CityPreset) => void;
  onGenerateCity: () => void;
  buildingCount: number;
}

const presets: CityPreset[] = [
  {
    name: "Modern",
    icon: "🏙️",
    parameters: {
      citySize: 120,
      buildingDensity: 0.8,
      buildingHeight: 100,
      streetWidth: 20,
      variation: 30
    }
  },
  {
    name: "Classic",
    icon: "🏢",
    parameters: {
      citySize: 100,
      buildingDensity: 0.6,
      buildingHeight: 60,
      streetWidth: 16,
      variation: 20
    }
  },
  {
    name: "Futuristic",
    icon: "🚀",
    parameters: {
      citySize: 150,
      buildingDensity: 0.9,
      buildingHeight: 150,
      streetWidth: 24,
      variation: 60
    }
  },
  {
    name: "Organic",
    icon: "🌿",
    parameters: {
      citySize: 80,
      buildingDensity: 0.5,
      buildingHeight: 40,
      streetWidth: 12,
      variation: 80
    }
  }
];

export function ControlPanel({ 
  parameters, 
  onParameterChange, 
  onPresetSelect, 
  onGenerateCity,
  buildingCount 
}: ControlPanelProps) {
  return (
    <div className="absolute left-4 top-20 bottom-4 w-80 z-30 floating-panel">
      <div className="glass-panel rounded-lg p-6 h-full overflow-y-auto">
        <h2 className="text-lg font-semibold mb-6 text-primary">City Parameters</h2>
        
        {/* Generation Controls */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-3 text-foreground">City Size</label>
            <input 
              type="range" 
              min="50" 
              max="200" 
              value={parameters.citySize}
              onChange={(e) => onParameterChange('citySize', Number(e.target.value))}
              className="w-full slider-thumb bg-muted rounded-lg appearance-none h-2" 
              data-testid="slider-city-size"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Small</span>
              <span>Large</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-foreground">Building Density</label>
            <input 
              type="range" 
              min="0.3" 
              max="1.0" 
              step="0.1" 
              value={parameters.buildingDensity}
              onChange={(e) => onParameterChange('buildingDensity', Number(e.target.value))}
              className="w-full slider-thumb bg-muted rounded-lg appearance-none h-2" 
              data-testid="slider-building-density"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Sparse</span>
              <span>Dense</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-foreground">Building Height</label>
            <input 
              type="range" 
              min="20" 
              max="150" 
              value={parameters.buildingHeight}
              onChange={(e) => onParameterChange('buildingHeight', Number(e.target.value))}
              className="w-full slider-thumb bg-muted rounded-lg appearance-none h-2" 
              data-testid="slider-building-height"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Low</span>
              <span>Skyscrapers</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-foreground">Street Width</label>
            <input 
              type="range" 
              min="8" 
              max="24" 
              value={parameters.streetWidth}
              onChange={(e) => onParameterChange('streetWidth', Number(e.target.value))}
              className="w-full slider-thumb bg-muted rounded-lg appearance-none h-2" 
              data-testid="slider-street-width"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Narrow</span>
              <span>Wide</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-foreground">Variation</label>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={parameters.variation}
              onChange={(e) => onParameterChange('variation', Number(e.target.value))}
              className="w-full slider-thumb bg-muted rounded-lg appearance-none h-2" 
              data-testid="slider-variation"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Uniform</span>
              <span>Chaotic</span>
            </div>
          </div>
        </div>

        {/* Style Presets */}
        <div className="mt-8">
          <h3 className="text-md font-semibold mb-4 text-foreground">Presets</h3>
          <div className="grid grid-cols-2 gap-2">
            {presets.map((preset) => (
              <button 
                key={preset.name}
                onClick={() => onPresetSelect(preset)}
                className="glass-button rounded-lg p-3 text-sm font-medium text-center hover-elevate"
                data-testid={`button-preset-${preset.name.toLowerCase()}`}
              >
                <span className="block mb-1">{preset.icon}</span>
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        {/* Generate Button */}
        <Button 
          onClick={onGenerateCity}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-4 rounded-lg mt-8 transition-all duration-200 transform hover:scale-105"
          data-testid="button-generate-city"
        >
          <span className="mr-2">✨</span>
          Generate New City
        </Button>

        {/* Building Count */}
        <div className="mt-4 text-center">
          <span className="text-sm text-muted-foreground" data-testid="text-building-count">
            {buildingCount} buildings
          </span>
        </div>
      </div>
    </div>
  );
}
