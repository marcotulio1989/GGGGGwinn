import { useEffect, useRef, useState, useCallback } from "react";

// Perlin noise implementation
function noise(x: number, y: number): number {
  const hash = (n: number) => {
    let h = n * 374761393 + 668265263;
    h = (h ^ (h >>> 13)) * 1274126177;
    return (h ^ (h >>> 16)) / 4294967296 + 0.5;
  };
  
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  
  const fade = (t: number) => t * t * (3 - 2 * t);
  
  const a = hash(ix + iy * 57);
  const b = hash(ix + 1 + iy * 57);
  const c = hash(ix + (iy + 1) * 57);
  const d = hash(ix + 1 + (iy + 1) * 57);
  
  const i1 = a + fade(fx) * (b - a);
  const i2 = c + fade(fx) * (d - c);
  
  return i1 + fade(fy) * (i2 - i1);
}

// Multi-octave noise for population heatmap
function heatmapNoise(x: number, y: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 0.005;
  
  for (let i = 0; i < 3; i++) {
    value += noise(x * frequency, y * frequency) * amplitude;
    frequency *= 2;
    amplitude *= 0.5;
  }
  
  return Math.max(0, Math.min(1, value));
}

// Seeded random
let seed = 1;
function seedRandom(s: number) { seed = s; }
function random(): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

interface Point { x: number; y: number; }

interface Segment {
  id: number;
  start: Point;
  end: Point;
  width: number;
  t: number;
  highway: boolean;
  dir: number;
  length: number;
  severed: boolean;
  links: { f: Segment[]; b: Segment[]; };
}

interface Building {
  x: number; y: number; width: number; height: number; color: string;
}

interface Camera { x: number; y: number; zoom: number; }

// Configuration (exact copy from original)
const config = {
  HIGHWAY_SEGMENT_LENGTH: 400,
  DEFAULT_SEGMENT_LENGTH: 300,
  HIGHWAY_BRANCH_PROBABILITY: 0.05,
  DEFAULT_BRANCH_PROBABILITY: 0.4,
  HIGHWAY_BRANCH_POPULATION_THRESHOLD: 0.1,
  NORMAL_BRANCH_POPULATION_THRESHOLD: 0.1,
  NORMAL_BRANCH_TIME_DELAY_FROM_HIGHWAY: 5,
  MINIMUM_INTERSECTION_DEVIATION: 30, // degrees
  ROAD_SNAP_DISTANCE: 50
};

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
    connectionPoints?: Array<{
      point: Point;
      isIntersection: boolean;
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

  // Line intersection check (from original)
  function doSegmentsIntersect(seg1Start: Point, seg1End: Point, seg2Start: Point, seg2End: Point): Point | null {
    const x1 = seg1Start.x, y1 = seg1Start.y;
    const x2 = seg1End.x, y2 = seg1End.y;
    const x3 = seg2Start.x, y3 = seg2Start.y;
    const x4 = seg2End.x, y4 = seg2End.y;
    
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    }
    return null;
  }

  // Simple helper functions
  function createSegment(start: Point, end: Point, t: number, highway: boolean): Segment {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const dir = Math.atan2(dy, dx);
    
    return {
      id: 0,
      start, end,
      width: highway ? 16 : 6, // Visual rendering width
      t, highway, dir, length,
      severed: false,
      links: { f: [], b: [] }
    };
  }

  // Simplified local constraints - basic collision detection only
  function localConstraints(segment: Segment, existingSegments: Segment[]): boolean {
    for (const other of existingSegments) {
      // Check intersection
      const intersection = doSegmentsIntersect(segment.start, segment.end, other.start, other.end);
      if (intersection) {
        const distToIntersection = Math.sqrt(
          (intersection.x - segment.start.x) ** 2 + (intersection.y - segment.start.y) ** 2
        );
        
        if (distToIntersection > 30) { // Minimum segment length
          // Modify segment to end at intersection
          segment.end = intersection;
          segment.length = distToIntersection;
          segment.severed = true;
          
          // Link segments
          segment.links.f.push(other);
          other.links.f.push(segment);
        }
      }
      
      // Check proximity snapping
      const distToStart = Math.sqrt((segment.end.x - other.start.x) ** 2 + (segment.end.y - other.start.y) ** 2);
      const distToEnd = Math.sqrt((segment.end.x - other.end.x) ** 2 + (segment.end.y - other.end.y) ** 2);
      
      if (distToStart < config.ROAD_SNAP_DISTANCE) {
        segment.end = { ...other.start };
        segment.links.f.push(other);
        other.links.b.push(segment);
        segment.severed = true;
      } else if (distToEnd < config.ROAD_SNAP_DISTANCE) {
        segment.end = { ...other.end };
        segment.links.f.push(other);
        other.links.f.push(segment);
        segment.severed = true;
      }
    }
    
    return true;
  }

  // Helper function for distance from point to line segment
  function distanceFromPointToLineSegment(point: Point, lineStart: Point, lineEnd: Point): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;

    let xx: number, yy: number;
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Simple global goals - focus on clean patterns
  function globalGoals(previousSegment: Segment): Segment[] {
    const newBranches: Segment[] = [];
    
    if (previousSegment.severed) return newBranches;
    
    const population = heatmapNoise(previousSegment.end.x, previousSegment.end.y);
    
    if (previousSegment.highway) {
      // Highways continue but can curve toward higher population
      const continueStraight = createSegment(
        { ...previousSegment.end },
        {
          x: previousSegment.end.x + Math.cos(previousSegment.dir) * config.HIGHWAY_SEGMENT_LENGTH,
          y: previousSegment.end.y + Math.sin(previousSegment.dir) * config.HIGHWAY_SEGMENT_LENGTH
        },
        0,
        true
      );
      
      // Try slight curve toward higher population
      const curveAngle = previousSegment.dir + (random() - 0.5) * 0.3; // Small random deviation
      const curvedPath = createSegment(
        { ...previousSegment.end },
        {
          x: previousSegment.end.x + Math.cos(curveAngle) * config.HIGHWAY_SEGMENT_LENGTH,
          y: previousSegment.end.y + Math.sin(curveAngle) * config.HIGHWAY_SEGMENT_LENGTH
        },
        0,
        true
      );
      
      const straightPop = heatmapNoise(continueStraight.end.x, continueStraight.end.y);
      const curvedPop = heatmapNoise(curvedPath.end.x, curvedPath.end.y);
      
      // Choose path with higher population
      if (curvedPop > straightPop) {
        newBranches.push(curvedPath);
      } else {
        newBranches.push(continueStraight);
      }
      
      // Very rarely branch highways at exact 90 degrees
      if (population > 0.3 && random() < 0.02) {
        const branchDir = previousSegment.dir + (random() < 0.5 ? -Math.PI/2 : Math.PI/2);
        const highwayBranch = createSegment(
          { ...previousSegment.end },
          {
            x: previousSegment.end.x + Math.cos(branchDir) * config.HIGHWAY_SEGMENT_LENGTH,
            y: previousSegment.end.y + Math.sin(branchDir) * config.HIGHWAY_SEGMENT_LENGTH
          },
          0,
          true
        );
        newBranches.push(highwayBranch);
      }
      
      // Create street branches from highways at exact 90 degrees
      if (population > 0.2 && random() < 0.1) {
        const streetDir = previousSegment.dir + (random() < 0.5 ? -Math.PI/2 : Math.PI/2);
        const streetBranch = createSegment(
          { ...previousSegment.end },
          {
            x: previousSegment.end.x + Math.cos(streetDir) * config.DEFAULT_SEGMENT_LENGTH,
            y: previousSegment.end.y + Math.sin(streetDir) * config.DEFAULT_SEGMENT_LENGTH
          },
          3, // time delay
          false
        );
        newBranches.push(streetBranch);
      }
    } else {
      // Streets continue straight only in populated areas
      if (population > 0.2) {
        const continueStraight = createSegment(
          { ...previousSegment.end },
          {
            x: previousSegment.end.x + Math.cos(previousSegment.dir) * config.DEFAULT_SEGMENT_LENGTH,
            y: previousSegment.end.y + Math.sin(previousSegment.dir) * config.DEFAULT_SEGMENT_LENGTH
          },
          0,
          false
        );
        newBranches.push(continueStraight);
        
        // Streets branch at exact 90 degrees occasionally
        if (random() < 0.15) {
          const branchDir = previousSegment.dir + (random() < 0.5 ? -Math.PI/2 : Math.PI/2);
          const streetBranch = createSegment(
            { ...previousSegment.end },
            {
              x: previousSegment.end.x + Math.cos(branchDir) * config.DEFAULT_SEGMENT_LENGTH,
              y: previousSegment.end.y + Math.sin(branchDir) * config.DEFAULT_SEGMENT_LENGTH
            },
            1,
            false
          );
          newBranches.push(streetBranch);
        }
      }
    }
    
    // Setup links for all new branches
    newBranches.forEach(branch => {
      branch.links.b.push(previousSegment);
      previousSegment.links.f.push(branch);
    });
    
    return newBranches;
  }

  // Find intersection points for round intersections
  const findIntersections = useCallback((segments: Segment[]): Point[] => {
    const intersections: Point[] = [];
    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const intersection = doSegmentsIntersect(
          segments[i].start, segments[i].end,
          segments[j].start, segments[j].end
        );
        if (intersection) {
          intersections.push(intersection);
        }
      }
    }
    return intersections;
  }, []);

  // Negative space blocks - create inset polygons from road network
  const findCityBlocks = useCallback((segments: Segment[]): Array<{points: Point[], color: string}> => {
    const blocks: Array<{points: Point[], color: string}> = [];
    const colors = [
      '#2a2a2a', // Dark gray for city blocks
      '#252525', 
      '#2f2f2f',
      '#1a1a1a',
      '#353535'
    ];
    
    if (segments.length === 0) return blocks;
    
    // Build a graph of road network connections
    const intersections = findIntersections(segments);
    const nodeMap = new Map<string, Point>();
    const adjacencyList = new Map<string, Array<{node: string, segment: Segment}>>();
    
    // Add all intersection points as nodes
    intersections.forEach(point => {
      const key = `${Math.round(point.x)},${Math.round(point.y)}`;
      nodeMap.set(key, point);
      adjacencyList.set(key, []);
    });
    
    // Add all segment endpoints as nodes
    segments.forEach(segment => {
      const startKey = `${Math.round(segment.start.x)},${Math.round(segment.start.y)}`;
      const endKey = `${Math.round(segment.end.x)},${Math.round(segment.end.y)}`;
      
      if (!nodeMap.has(startKey)) {
        nodeMap.set(startKey, segment.start);
        adjacencyList.set(startKey, []);
      }
      if (!nodeMap.has(endKey)) {
        nodeMap.set(endKey, segment.end);
        adjacencyList.set(endKey, []);
      }
      
      // Add bidirectional connections
      adjacencyList.get(startKey)!.push({node: endKey, segment});
      adjacencyList.get(endKey)!.push({node: startKey, segment});
    });
    
    // Find closed loops (polygons) by walking the graph
    const visitedEdges = new Set<string>();
    const foundPolygons: Array<{points: Point[], segments: Segment[]}> = [];
    
    nodeMap.forEach((startPoint, startKey) => {
      const neighbors = adjacencyList.get(startKey) || [];
      
      neighbors.forEach(({node: nextKey, segment: firstSegment}) => {
        const edgeKey = `${startKey}-${nextKey}`;
        if (visitedEdges.has(edgeKey)) return;
        
        // Try to trace a polygon starting from this edge
        const polygon: Point[] = [startPoint];
        const segmentPath: Segment[] = [firstSegment];
        const visited = new Set<string>();
        let currentKey = nextKey;
        let prevKey = startKey;
        
        // Walk the graph trying to find a closed loop
        for (let step = 0; step < 20 && currentKey !== startKey; step++) {
          if (visited.has(currentKey)) break;
          visited.add(currentKey);
          
          const currentPoint = nodeMap.get(currentKey);
          if (!currentPoint) break;
          polygon.push(currentPoint);
          
          // Find the next connection (not going back where we came from)
          const connections = adjacencyList.get(currentKey) || [];
          const nextConnections = connections.filter(conn => conn.node !== prevKey);
          
          if (nextConnections.length === 0) break;
          
          // Choose the rightmost turn (to trace clockwise polygons)
          let bestNext = nextConnections[0];
          if (nextConnections.length > 1) {
            const incomingAngle = Math.atan2(
              currentPoint.y - nodeMap.get(prevKey)!.y,
              currentPoint.x - nodeMap.get(prevKey)!.x
            );
            
            let bestAngle = -Math.PI;
            nextConnections.forEach(conn => {
              const nextPoint = nodeMap.get(conn.node)!;
              const outgoingAngle = Math.atan2(
                nextPoint.y - currentPoint.y,
                nextPoint.x - currentPoint.x
              );
              
              let turnAngle = outgoingAngle - incomingAngle;
              if (turnAngle < -Math.PI) turnAngle += 2 * Math.PI;
              if (turnAngle > Math.PI) turnAngle -= 2 * Math.PI;
              
              if (turnAngle > bestAngle) {
                bestAngle = turnAngle;
                bestNext = conn;
              }
            });
          }
          
          segmentPath.push(bestNext.segment);
          prevKey = currentKey;
          currentKey = bestNext.node;
        }
        
        // If we found a closed polygon
        if (currentKey === startKey && polygon.length >= 3) {
          visitedEdges.add(edgeKey);
          foundPolygons.push({points: polygon, segments: segmentPath});
        }
      });
    });
    
    // Create inset polygons (polígonos internos afastados)
    foundPolygons.forEach(({points: polygon, segments: segmentPath}) => {
      if (polygon.length < 3) return;
      
      // Calculate area to filter out tiny polygons
      let area = 0;
      for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
      }
      area = Math.abs(area) / 2;
      
      // Only process reasonably sized polygons
      if (area < 15000) return;
      
      // Create inset polygon - afastado por X/2 onde X é a largura da estrada
      const insetPolygon: Point[] = [];
      
      for (let i = 0; i < polygon.length; i++) {
        const currentPoint = polygon[i];
        const nextPoint = polygon[(i + 1) % polygon.length];
        const prevPoint = polygon[(i - 1 + polygon.length) % polygon.length];
        
        // Get the road width for this edge
        const edgeSegment = segmentPath[Math.min(i, segmentPath.length - 1)];
        const insetDistance = edgeSegment ? edgeSegment.width / 2 + 20 : 60; // X/2 + small buffer
        
        // Calculate inward normal vectors for both adjacent edges
        const edge1 = {
          x: currentPoint.x - prevPoint.x,
          y: currentPoint.y - prevPoint.y
        };
        const edge2 = {
          x: nextPoint.x - currentPoint.x,
          y: nextPoint.y - currentPoint.y
        };
        
        // Normalize and get perpendicular (inward normal)
        const len1 = Math.hypot(edge1.x, edge1.y);
        const len2 = Math.hypot(edge2.x, edge2.y);
        
        if (len1 > 0 && len2 > 0) {
          const normal1 = { x: -edge1.y / len1, y: edge1.x / len1 };
          const normal2 = { x: -edge2.y / len2, y: edge2.x / len2 };
          
          // Average the normals and scale by inset distance
          const avgNormal = {
            x: (normal1.x + normal2.x) / 2,
            y: (normal1.y + normal2.y) / 2
          };
          
          const avgLen = Math.hypot(avgNormal.x, avgNormal.y);
          if (avgLen > 0) {
            const scale = insetDistance / avgLen;
            insetPolygon.push({
              x: currentPoint.x + avgNormal.x * scale,
              y: currentPoint.y + avgNormal.y * scale
            });
          }
        }
      }
      
      if (insetPolygon.length >= 3) {
        blocks.push({
          points: insetPolygon,
          color: colors[Math.floor(Math.random() * colors.length)]
        });
      }
    });
    
    return blocks;
  }, [findIntersections]);

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