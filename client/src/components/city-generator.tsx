import { useEffect, useRef, useState, useCallback } from "react";
import {
  noise,
  heatmapNoise,
  seedRandom,
  random,
  doSegmentsIntersect,
  createSegment,
  localConstraints,
  globalGoals,
  findIntersections,
  findCityBlocks,
  Point,
  Segment,
  Building,
  config
} from '@/lib/city-generator-logic';

interface Camera { x: number; y: number; zoom: number; }

export function CityGenerator() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePos, setLastMousePos] = useState<Point>({ x: 0, y: 0 });
  const [segments, setSegments] = useState<Segment[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [segmentLimit, setSegmentLimit] = useState(2000);
  const [showDebug, setShowDebug] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showCityBlocks, setShowCityBlocks] = useState(false);
  const [currentSeed, setCurrentSeed] = useState(12345);
  type UnifiedRoadNetwork = {
    paths: Array<{
      start: Point;
      end: Point;
      width: number;
      highway: boolean;
      originalSegment: Segment;
    }>;
    intersections: Array<{
      center: Point;
      radius: number;
      connectedRoads: Array<{
        segment: Segment;
        angle: number;
        meetingPoint: Point;
        isAtStart: boolean;
      }>;
      isHighway: boolean;
    }>;
  };
  
  const [unifiedRoadNetwork, setUnifiedRoadNetwork] = useState<UnifiedRoadNetwork | null>(null);
  const [worker, setWorker] = useState<Worker | null>(null);

  // Initialize Web Worker
  useEffect(() => {
    const roadWorker = new Worker('/road-network-worker.js');
    
    roadWorker.onmessage = (e) => {
      console.log('Worker response received:', e.data);
      const { success, unifiedNetwork, error } = e.data;
      if (success && unifiedNetwork) {
        console.log('Setting unified network:', unifiedNetwork);
        setUnifiedRoadNetwork(unifiedNetwork);
      } else if (error) {
        console.error('Worker error:', error);
      } else {
        console.log('Worker response but no unified network');
      }
    };
    
    roadWorker.onerror = (error) => {
      console.error('Worker script error:', error);
    };
    
    setWorker(roadWorker);
    console.log('Web Worker initialized');
    
    return () => {
      roadWorker.terminate();
    };
  }, []);

  // Process road network when segments change
  useEffect(() => {
    if (worker && segments.length > 0) {
      console.log('Sending', segments.length, 'segments to worker');
      // Send road data to worker for processing
      worker.postMessage({
        segments: segments.map(seg => ({
          start: seg.start,
          end: seg.end,
          width: seg.width,
          highway: seg.highway
        }))
      });
    }
  }, [worker, segments]);

  // Main generation algorithm (exact copy of original structure)
  const generateCity = useCallback((newSeed?: number) => {
    const useSeed = newSeed || currentSeed;
    seedRandom(useSeed);
    if (newSeed) setCurrentSeed(newSeed);
    
    const priorityQ: Segment[] = [];
    const newSegments: Segment[] = [];
    
    // Create initial highway segments (from original)
    const rootSegment = createSegment(
      { x: 0, y: 0 },
      { x: config.HIGHWAY_SEGMENT_LENGTH, y: 0 },
      0,
      true
    );
    
    const oppositeSegment = createSegment(
      { x: -config.HIGHWAY_SEGMENT_LENGTH, y: 0 },
      { x: 0, y: 0 },
      0,
      true
    );
    
    // Link initial segments
    rootSegment.links.b.push(oppositeSegment);
    oppositeSegment.links.f.push(rootSegment);
    
    priorityQ.push(rootSegment, oppositeSegment);
    
    // Main generation loop (exact copy of original)
    while (priorityQ.length > 0 && newSegments.length < segmentLimit) {
      // Find segment with minimum t
      let minT = Infinity;
      let minIndex = 0;
      
      priorityQ.forEach((seg, i) => {
        if (seg.t < minT) {
          minT = seg.t;
          minIndex = i;
        }
      });
      
      const currentSegment = priorityQ.splice(minIndex, 1)[0];
      
      // Apply local constraints
      const accepted = localConstraints(currentSegment, newSegments);
      
      if (accepted) {
        newSegments.push(currentSegment);
        
        // Generate new segments using global goals
        const newBranches = globalGoals(currentSegment);
        newBranches.forEach(branch => {
          branch.t = currentSegment.t + 1 + branch.t;
          priorityQ.push(branch);
        });
      }
    }
    
    // Assign IDs
    newSegments.forEach((seg, i) => { seg.id = i; });
    
    console.log(`Generated ${newSegments.length} segments`);
    setSegments(newSegments);
    
    // Generate buildings
    const newBuildings: Building[] = [];
    newSegments.forEach(segment => {
      if (!segment.highway && random() > 0.6) {
        const perpAngle = segment.dir + Math.PI / 2;
        const buildingCount = Math.floor(segment.length / 1000); // More realistic spacing with new scale
        
        for (let i = 0; i < buildingCount; i++) {
          const t = (i + 0.5) / buildingCount;
          const segX = segment.start.x + (segment.end.x - segment.start.x) * t;
          const segY = segment.start.y + (segment.end.y - segment.start.y) * t;
          
          [-1, 1].forEach(side => {
            if (random() > 0.5) {
              // Proper clearance based on actual road width: half road width + sidewalk + building setback
              const actualRoadWidth = segment.highway ? 1000 : 300; // Real road width (10m highways, 3m roads)
              const clearance = actualRoadWidth / 2 + 200 + 300; // Half road + 2m sidewalk + 3m setback
              const distance = clearance + random() * 500; // Random additional setback up to 5m
              const buildingX = segX + Math.cos(perpAngle) * distance * side;
              const buildingY = segY + Math.sin(perpAngle) * distance * side;
              
              // Realistic building sizes: 5-15m width, 5-20m depth, with proper scale
              const buildingWidth = 500 + random() * 1000; // 5-15 meters
              const buildingDepth = 500 + random() * 1500;  // 5-20 meters
              
              newBuildings.push({
                x: buildingX - buildingWidth / 2,
                y: buildingY - buildingDepth / 2,
                width: buildingWidth,
                height: buildingDepth,
                color: `hsl(${220 + random() * 40}, 60%, ${20 + random() * 30}%)`
              });
            }
          });
        }
      }
    });
    
    setBuildings(newBuildings);
  }, [segmentLimit, currentSeed]);

  // Rendering
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Asphalt background - fundo de asfalto
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.translate(-camera.x, -camera.y);
    
    // Draw heatmap - calculate bounds based on actual road network
    if (showHeatmap) {
      const resolution = 80;
      let minX = -1000, maxX = 1000, minY = -1000, maxY = 1000;
      
      // Expand bounds based on actual segments
      if (segments.length > 0) {
        minX = Math.min(...segments.map(s => Math.min(s.start.x, s.end.x))) - 500;
        maxX = Math.max(...segments.map(s => Math.max(s.start.x, s.end.x))) + 500;
        minY = Math.min(...segments.map(s => Math.min(s.start.y, s.end.y))) - 500;
        maxY = Math.max(...segments.map(s => Math.max(s.start.y, s.end.y))) + 500;
      }
      
      for (let x = minX; x < maxX; x += resolution) {
        for (let y = minY; y < maxY; y += resolution) {
          const intensity = heatmapNoise(x, y);
          const hue = Math.floor(intensity * 60);
          ctx.fillStyle = `hsla(${hue}, 80%, 50%, 0.3)`;
          ctx.fillRect(x - resolution/2, y - resolution/2, resolution, resolution);
        }
      }
    }
    
    // Draw unified road network - properly connected roads without separate circles
    if (unifiedRoadNetwork) {
      const { paths } = unifiedRoadNetwork;
      
      // Draw each road path with proper line joins for smooth connections
      paths.forEach(path => {
        ctx.strokeStyle = path.highway ? '#ff6b6b' : '#4ecdc4'; // Always use bright colors for visibility
        ctx.lineWidth = path.width;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round'; // This creates smooth rounded corners at connections
        
        ctx.beginPath();
        ctx.moveTo(path.start.x, path.start.y);
        ctx.lineTo(path.end.x, path.end.y);
        ctx.stroke();
      });
      
      // Show connection points for debugging if needed
      if (showDebug && unifiedRoadNetwork.connectionPoints) {
        unifiedRoadNetwork.connectionPoints.forEach(connection => {
          if (connection.isIntersection) {
            ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
            ctx.beginPath();
            ctx.arc(connection.point.x, connection.point.y, 8, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }
    }

    // Show original segments for comparison when debug is enabled and unified network is not available
    if (!unifiedRoadNetwork && showDebug) {
      segments.forEach((segment, index) => {
        ctx.strokeStyle = segment.highway ? '#ff6b6b' : '#4ecdc4';
        ctx.lineWidth = segment.width;
        ctx.lineCap = 'round';
        
        ctx.beginPath();
        ctx.moveTo(segment.start.x, segment.start.y);
        ctx.lineTo(segment.end.x, segment.end.y);
        ctx.stroke();
        
        // Show segment numbers for debugging
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Arial';
        const midX = (segment.start.x + segment.end.x) / 2;
        const midY = (segment.start.y + segment.end.y) / 2;
        ctx.fillText(index.toString(), midX, midY);
      });
    }

    // Draw buildings
    buildings.forEach(building => {
      ctx.fillStyle = building.color;
      ctx.fillRect(building.x, building.y, building.width, building.height);
    });
    
    ctx.restore();
  }, [camera, segments, buildings, showDebug, showHeatmap, showCityBlocks, unifiedRoadNetwork]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setLastMousePos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = e.clientX - lastMousePos.x;
      const deltaY = e.clientY - lastMousePos.y;
      
      setCamera(prev => ({
        ...prev,
        x: prev.x - deltaX / prev.zoom,
        y: prev.y - deltaY / prev.zoom
      }));
      
      setLastMousePos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    setCamera(prev => ({
      ...prev,
      zoom: Math.max(0.01, Math.min(10, prev.zoom * zoomFactor))
    }));
  };

  const zoomIn = () => setCamera(prev => ({ ...prev, zoom: Math.min(10, prev.zoom * 1.5) }));
  const zoomOut = () => setCamera(prev => ({ ...prev, zoom: Math.max(0.01, prev.zoom / 1.5) }));


  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  useEffect(() => { generateCity(); }, [generateCity]);
  useEffect(() => { render(); }, [render]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-gray-900">
      <canvas 
        ref={canvasRef}
        className={`absolute inset-0 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        data-testid="canvas-city"
      />
      
      <div className="absolute top-4 left-4 bg-black bg-opacity-80 text-white p-4 rounded-lg">
        <h1 className="text-xl font-bold mb-4">City Generator</h1>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-2">Visualization Options</label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDebug(!showDebug)}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded text-sm"
                data-testid="button-toggle-debug"
              >
                {showDebug ? 'Hide Debug' : 'Show Debug'}
              </button>
              <button
                onClick={() => setShowHeatmap(!showHeatmap)}
                className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm"
                data-testid="button-toggle-heatmap"
              >
                {showHeatmap ? 'Hide Heatmap' : 'Show Heatmap'}
              </button>
              <button
                onClick={() => setShowCityBlocks(!showCityBlocks)}
                className="bg-purple-600 hover:bg-purple-700 px-3 py-2 rounded text-sm"
                data-testid="button-toggle-cityblocks"
              >
                {showCityBlocks ? 'Hide Blocks' : 'Show Blocks'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2">Segment limit: {segmentLimit}</label>
            <input
              type="range"
              min="100"
              max="5000"
              step="100"
              value={segmentLimit}
              onChange={(e) => setSegmentLimit(Number(e.target.value))}
              className="w-full"
              data-testid="slider-segment-limit"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={zoomIn}
              className="bg-green-600 hover:bg-green-700 px-3 py-2 rounded text-sm"
              data-testid="button-zoom-in"
            >
              Zoom in
            </button>
            <button
              onClick={zoomOut}
              className="bg-red-600 hover:bg-red-700 px-3 py-2 rounded text-sm"
              data-testid="button-zoom-out"
            >
              Zoom out
            </button>
          </div>

          <button
            onClick={() => generateCity(Date.now())}
            className="w-full bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded text-sm font-semibold"
            data-testid="button-regenerate"
          >
            Regenerate
          </button>
        </div>

        <div className="mt-4 text-xs text-gray-300">
          <div>Segments: {segments.length}</div>
          <div>Buildings: {buildings.length}</div>
          <div>Zoom: {Math.round(camera.zoom * 100)}%</div>
        </div>
      </div>
    </div>
  );
}