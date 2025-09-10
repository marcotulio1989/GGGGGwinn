// Perlin noise implementation
export function noise(x: number, y: number): number {
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
export function heatmapNoise(x: number, y: number): number {
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
export function seedRandom(s: number) { seed = s; }
export function random(): number {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

export interface Point { x: number; y: number; }

export interface Segment {
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

export interface Building {
  x: number; y: number; width: number; height: number; color: string;
}

// Configuration (exact copy from original)
export const config = {
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

// Line intersection check (from original)
export function doSegmentsIntersect(seg1Start: Point, seg1End: Point, seg2Start: Point, seg2End: Point): Point | null {
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
export function createSegment(start: Point, end: Point, t: number, highway: boolean): Segment {
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
export function localConstraints(segment: Segment, existingSegments: Segment[]): boolean {
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

// Simple global goals - focus on clean patterns
export function globalGoals(previousSegment: Segment): Segment[] {
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
export const findIntersections = (segments: Segment[]): Point[] => {
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
};

// Negative space blocks - create inset polygons from road network
export const findCityBlocks = (segments: Segment[], findIntersections: (segments: Segment[]) => Point[]): Array<{points: Point[], color: string}> => {
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
};
