// Web Worker to create a unified road network structure
self.onmessage = function(e) {
  const { segments } = e.data;
  
  try {
    // Create a unified road network by connecting segments properly
    const unifiedNetwork = buildUnifiedRoadNetwork(segments);
    
    self.postMessage({
      success: true,
      unifiedNetwork: unifiedNetwork
    });
    
  } catch (error) {
    self.postMessage({
      success: false,
      error: error.message
    });
  }
};

function buildUnifiedRoadNetwork(segments) {
  const SNAP_DISTANCE = 50;
  const modifiedSegments = [...segments];
  
  // Step 1: Find all intersection points and split segments there
  for (let i = 0; i < modifiedSegments.length; i++) {
    for (let j = i + 1; j < modifiedSegments.length; j++) {
      const seg1 = modifiedSegments[i];
      const seg2 = modifiedSegments[j];
      
      const intersection = getLineIntersection(
        seg1.start.x, seg1.start.y, seg1.end.x, seg1.end.y,
        seg2.start.x, seg2.start.y, seg2.end.x, seg2.end.y
      );
      
      if (intersection) {
        // Split segments at intersection point if needed
        const distToSeg1Start = Math.hypot(intersection.x - seg1.start.x, intersection.y - seg1.start.y);
        const distToSeg1End = Math.hypot(intersection.x - seg1.end.x, intersection.y - seg1.end.y);
        const distToSeg2Start = Math.hypot(intersection.x - seg2.start.x, intersection.y - seg2.start.y);
        const distToSeg2End = Math.hypot(intersection.x - seg2.end.x, intersection.y - seg2.end.y);
        
        // Only split if intersection is not at segment endpoints
        if (distToSeg1Start > 10 && distToSeg1End > 10) {
          // Split seg1
          const newSeg1 = {
            start: { x: intersection.x, y: intersection.y },
            end: { x: seg1.end.x, y: seg1.end.y },
            width: seg1.width,
            highway: seg1.highway
          };
          seg1.end = { x: intersection.x, y: intersection.y };
          modifiedSegments.push(newSeg1);
        }
        
        if (distToSeg2Start > 10 && distToSeg2End > 10) {
          // Split seg2  
          const newSeg2 = {
            start: { x: intersection.x, y: intersection.y },
            end: { x: seg2.end.x, y: seg2.end.y },
            width: seg2.width,
            highway: seg2.highway
          };
          seg2.end = { x: intersection.x, y: intersection.y };
          modifiedSegments.push(newSeg2);
        }
      }
    }
  }
  
  // Step 2: Snap nearby endpoints together
  const snapGroups = [];
  
  for (let i = 0; i < modifiedSegments.length; i++) {
    for (let j = i + 1; j < modifiedSegments.length; j++) {
      const seg1 = modifiedSegments[i];
      const seg2 = modifiedSegments[j];
      
      // Check all endpoint combinations
      const endpoints = [
        { seg: seg1, point: seg1.start, isStart: true },
        { seg: seg1, point: seg1.end, isStart: false },
        { seg: seg2, point: seg2.start, isStart: true },
        { seg: seg2, point: seg2.end, isStart: false }
      ];
      
      for (let a = 0; a < 2; a++) {
        for (let b = 2; b < 4; b++) {
          const ep1 = endpoints[a];
          const ep2 = endpoints[b];
          
          const dist = Math.hypot(ep1.point.x - ep2.point.x, ep1.point.y - ep2.point.y);
          if (dist <= SNAP_DISTANCE) {
            // Snap these endpoints together
            const snapPoint = {
              x: (ep1.point.x + ep2.point.x) / 2,
              y: (ep1.point.y + ep2.point.y) / 2
            };
            
            if (ep1.isStart) {
              ep1.seg.start = snapPoint;
            } else {
              ep1.seg.end = snapPoint;
            }
            
            if (ep2.isStart) {
              ep2.seg.start = snapPoint;
            } else {
              ep2.seg.end = snapPoint;
            }
          }
        }
      }
    }
  }
  
  // Step 3: Create unified paths and connection info
  const connectionPoints = new Map();
  
  // Group segments by their endpoints
  modifiedSegments.forEach((segment, index) => {
    const startKey = `${Math.round(segment.start.x)},${Math.round(segment.start.y)}`;
    const endKey = `${Math.round(segment.end.x)},${Math.round(segment.end.y)}`;
    
    if (!connectionPoints.has(startKey)) {
      connectionPoints.set(startKey, { 
        point: segment.start, 
        segments: [],
        isIntersection: false
      });
    }
    if (!connectionPoints.has(endKey)) {
      connectionPoints.set(endKey, { 
        point: segment.end, 
        segments: [],
        isIntersection: false
      });
    }
    
    connectionPoints.get(startKey).segments.push({ segment, isStart: true, index });
    connectionPoints.get(endKey).segments.push({ segment, isStart: false, index });
  });
  
  // Mark intersection points (where 3+ segments meet)
  connectionPoints.forEach((connection, key) => {
    if (connection.segments.length >= 3) {
      connection.isIntersection = true;
    }
  });
  
  // Create unified road paths
  const unifiedPaths = modifiedSegments.map(segment => ({
    start: segment.start,
    end: segment.end,
    width: segment.width,
    highway: segment.highway,
    originalSegment: segment
  }));
  
  // Return the unified road network - no separate intersections, just connected paths
  return {
    paths: unifiedPaths,
    connectionPoints: Array.from(connectionPoints.values()),
    intersections: [] // No separate circular intersections
  };
}

// Function to calculate intersection between two lines
function getLineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;
  
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  }
  
  return null;
}