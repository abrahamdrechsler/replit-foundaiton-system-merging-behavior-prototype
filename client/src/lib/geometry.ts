import { Room, Point, Edge } from "../types";
import { GRID_SIZE, FOUNDATION_WALL_THICKNESS } from "../lib/constants";

// Check if a point is inside a room
export function isPointInRoom(point: Point, room: Room): boolean {
  return (
    point.x >= room.x &&
    point.x <= room.x + room.width &&
    point.y >= room.y &&
    point.y <= room.y + room.height
  );
}

// Calculate the combined perimeter of a group of rooms
export function getCombinedRoomPerimeter(rooms: Room[]): Point[] {
  if (rooms.length === 0) return [];
  if (rooms.length === 1) {
    const room = rooms[0];
    return [
      { x: room.x, y: room.y },
      { x: room.x + room.width, y: room.y },
      { x: room.x + room.width, y: room.y + room.height },
      { x: room.x, y: room.y + room.height },
      { x: room.x, y: room.y } // Close the loop
    ];
  }
  
  // For multiple rooms, we need a smarter algorithm to create a proper
  // combined perimeter that wraps tightly around connected rooms
  
  // Create a grid representation of the rooms with a resolution of 1 inch (1/12 foot)
  const resolution = 1; // 1 inch resolution
  
  // Find the bounding box for all rooms
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  rooms.forEach(room => {
    minX = Math.min(minX, room.x);
    minY = Math.min(minY, room.y);
    maxX = Math.max(maxX, room.x + room.width);
    maxY = Math.max(maxY, room.y + room.height);
  });
  
  // Add padding to ensure we have enough grid space
  const padding = 24; // 2 feet of padding
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;
  
  // Calculate grid dimensions
  const gridWidth = Math.ceil((maxX - minX) / resolution);
  const gridHeight = Math.ceil((maxY - minY) / resolution);
  
  // Create an empty grid
  const grid: boolean[][] = Array(gridHeight).fill(false).map(() => Array(gridWidth).fill(false));
  
  // Fill the grid based on room occupancy
  rooms.forEach(room => {
    const startX = Math.floor((room.x - minX) / resolution);
    const startY = Math.floor((room.y - minY) / resolution);
    const endX = Math.ceil((room.x + room.width - minX) / resolution);
    const endY = Math.ceil((room.y + room.height - minY) / resolution);
    
    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        if (y >= 0 && y < gridHeight && x >= 0 && x < gridWidth) {
          grid[y][x] = true;
        }
      }
    }
  });
  
  // Find all perimeter cells (occupied cells with at least one empty neighbor)
  const perimeterCells: {x: number, y: number}[] = [];
  
  // Directions to check for neighbors: right, down, left, up
  const directions = [{dx: 1, dy: 0}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 0, dy: -1}];
  
  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      if (!grid[y][x]) continue; // Skip empty cells
      
      // Check if this cell has any empty neighbors
      let hasEmptyNeighbor = false;
      
      for (const {dx, dy} of directions) {
        const nx = x + dx;
        const ny = y + dy;
        
        // If neighbor is out of bounds or empty, this is a perimeter cell
        if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight || !grid[ny][nx]) {
          hasEmptyNeighbor = true;
          break;
        }
      }
      
      if (hasEmptyNeighbor) {
        perimeterCells.push({x, y});
      }
    }
  }
  
  // If we don't have enough perimeter cells, fall back to individual room outlines
  if (perimeterCells.length < 3) {
    const result: Point[] = [];
    rooms.forEach(room => {
      result.push({ x: room.x, y: room.y });
      result.push({ x: room.x + room.width, y: room.y });
      result.push({ x: room.x + room.width, y: room.y + room.height });
      result.push({ x: room.x, y: room.y + room.height });
      result.push({ x: room.x, y: room.y }); // Close the loop
    });
    return result;
  }
  
  // Convert perimeter cell indices to actual coordinates
  const perimeterPoints: Point[] = perimeterCells.map(cell => ({
    x: minX + cell.x * resolution,
    y: minY + cell.y * resolution
  }));
  
  // Sort the points to form a clockwise boundary
  // Find the center point of all perimeter points
  let centerX = 0, centerY = 0;
  for (const point of perimeterPoints) {
    centerX += point.x;
    centerY += point.y;
  }
  centerX /= perimeterPoints.length;
  centerY /= perimeterPoints.length;
  
  // Sort by angle around the center point
  const sortedPerimeter = [...perimeterPoints].sort((a, b) => {
    const angleA = Math.atan2(a.y - centerY, a.x - centerX);
    const angleB = Math.atan2(b.y - centerY, b.x - centerX);
    return angleA - angleB;
  });
  
  // Remove duplicates and points that are too close together
  const cleanedPerimeter: Point[] = [];
  const minDistance = 2; // Minimum distance between points in grid units
  
  for (let i = 0; i < sortedPerimeter.length; i++) {
    const current = sortedPerimeter[i];
    let isDuplicate = false;
    
    for (let j = 0; j < cleanedPerimeter.length; j++) {
      const existing = cleanedPerimeter[j];
      const distance = Math.sqrt(
        Math.pow(current.x - existing.x, 2) + 
        Math.pow(current.y - existing.y, 2)
      );
      
      if (distance < minDistance) {
        isDuplicate = true;
        break;
      }
    }
    
    if (!isDuplicate) {
      cleanedPerimeter.push(current);
    }
  }
  
  // Add the first point again to close the loop
  if (cleanedPerimeter.length > 0) {
    cleanedPerimeter.push({ ...cleanedPerimeter[0] });
  }
  
  return cleanedPerimeter;
}

// Check if two edges coincide (are the same line segment)
function areEdgesCoincident(edge1: Edge, edge2: Edge): boolean {
  const tolerance = 0.1; // Small tolerance for floating point comparison
  
  // Check if the endpoints match (in either direction)
  const sameDirection = 
    Math.abs(edge1.x1 - edge2.x1) < tolerance && 
    Math.abs(edge1.y1 - edge2.y1) < tolerance && 
    Math.abs(edge1.x2 - edge2.x2) < tolerance && 
    Math.abs(edge1.y2 - edge2.y2) < tolerance;
  
  const oppositeDirection = 
    Math.abs(edge1.x1 - edge2.x2) < tolerance && 
    Math.abs(edge1.y1 - edge2.y2) < tolerance && 
    Math.abs(edge1.x2 - edge2.x1) < tolerance && 
    Math.abs(edge1.y2 - edge2.y1) < tolerance;
  
  return sameDirection || oppositeDirection;
}

// Check if two rooms intersect
export function doRoomsIntersect(room1: Room, room2: Room): boolean {
  return !(
    room1.x + room1.width <= room2.x ||
    room1.x >= room2.x + room2.width ||
    room1.y + room1.height <= room2.y ||
    room1.y >= room2.y + room2.height
  );
}

// Check if rooms are overlapping by exactly 1' (Condition 3)
export function areRoomsOverlapping(room1: Room, room2: Room): boolean {
  // Define the overlap tolerance (1 grid unit/1 foot)
  const overlapTolerance = GRID_SIZE;
  
  // Check horizontal overlap - ensuring it's no more than one grid unit
  const horizontalOverlap = 
    (room1.x + room1.width > room2.x && room1.x + room1.width <= room2.x + overlapTolerance) || 
    (room2.x + room2.width > room1.x && room2.x + room2.width <= room1.x + overlapTolerance);
  
  // Check vertical overlap - ensuring it's no more than one grid unit
  const verticalOverlap = 
    (room1.y + room1.height > room2.y && room1.y + room1.height <= room2.y + overlapTolerance) || 
    (room2.y + room2.height > room1.y && room2.y + room2.height <= room1.y + overlapTolerance);
  
  // Check significant overlap in both directions
  const significantOverlap = doRoomsIntersect(room1, room2) && (
    // Check if overlap is more than just edge/corner
    Math.min(room1.x + room1.width, room2.x + room2.width) - Math.max(room1.x, room2.x) > overlapTolerance &&
    Math.min(room1.y + room1.height, room2.y + room2.height) - Math.max(room1.y, room2.y) > overlapTolerance
  );
  
  // Return true for overlap condition (Condition 3)
  return doRoomsIntersect(room1, room2) && !significantOverlap;
}

// Check if two rooms are adjacent (sharing an edge - Condition 2)
export function areRoomsAdjacent(room1: Room, room2: Room): boolean {
  // Rooms are adjacent if they share an edge
  const horizontalAdjacent = (
    (room1.x <= room2.x + room2.width && room1.x + room1.width >= room2.x) &&
    (room1.y === room2.y + room2.height || room2.y === room1.y + room1.height)
  );
  
  const verticalAdjacent = (
    (room1.y <= room2.y + room2.height && room1.y + room1.height >= room2.y) &&
    (room1.x === room2.x + room2.width || room2.x === room1.x + room1.width)
  );
  
  return horizontalAdjacent || verticalAdjacent;
}

// Check if two rooms are touching (either adjacent, sharing a corner, or overlapping - Condition 2 or 3)
export function areRoomsTouching(room1: Room, room2: Room): boolean {
  // Check if rooms are adjacent (share an edge - Condition 2)
  if (areRoomsAdjacent(room1, room2)) {
    return true;
  }
  
  // Check if rooms are overlapping by 1' (Condition 3)
  if (areRoomsOverlapping(room1, room2)) {
    return true;
  }
  
  // Expand room1 slightly to check for corner touches
  const expandedRoom1 = {
    ...room1,
    x: room1.x - 1,
    y: room1.y - 1,
    width: room1.width + 2,
    height: room1.height + 2
  };
  
  // Check if the expanded room intersects with room2 (corner touch)
  return doRoomsIntersect(expandedRoom1, room2);
}

// Calculate distance between two points
export function distanceBetweenPoints(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Get center point of a room
export function getRoomCenter(room: Room): Point {
  return {
    x: room.x + room.width / 2,
    y: room.y + room.height / 2
  };
}

// Normalize a rectangle to ensure width and height are positive
export function normalizeRectangle(start: Point, end: Point): { x: number; y: number; width: number; height: number } {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  
  return { x, y, width, height };
}

// Special offset function for orthogonal (90-degree cornered) perimeters
// This creates a proper offset with 90-degree corners for foundation wall inner boundaries
export function createInsetPolyline(perimeterPoints: Point[], insetDistance: number): Point[] {
  if (perimeterPoints.length < 3) return [];

  // Make sure we have a closed perimeter - check if first and last points match
  const isPerimeterClosed = 
    Math.abs(perimeterPoints[0].x - perimeterPoints[perimeterPoints.length - 1].x) < 0.0001 &&
    Math.abs(perimeterPoints[0].y - perimeterPoints[perimeterPoints.length - 1].y) < 0.0001;
  
  // Create a working copy, ensuring the path is closed
  const closedPerimeter = isPerimeterClosed ? 
    [...perimeterPoints] : 
    [...perimeterPoints, {...perimeterPoints[0]}];
  
  // The offset polygon needs to be built one corner at a time
  const offsetPolygon: Point[] = [];
  
  // Identify each corner and determine its type
  for (let i = 0; i < closedPerimeter.length - 1; i++) {
    const prev = i === 0 ? closedPerimeter[closedPerimeter.length - 2] : closedPerimeter[i - 1];
    const current = closedPerimeter[i];
    const next = closedPerimeter[i + 1];
    
    // We only care about true corners (where direction changes)
    const incomingIsHorizontal = Math.abs(current.y - prev.y) < 0.0001;
    const outgoingIsHorizontal = Math.abs(next.y - current.y) < 0.0001;
    
    // Skip non-corner points (where the direction doesn't change)
    if (incomingIsHorizontal === outgoingIsHorizontal) continue;
    
    // For 90-degree corners, we need to determine if it's an inside or outside corner
    // and offset it accordingly
    
    // Get the directions of the incoming and outgoing segments
    const incomingVector = {
      x: current.x - prev.x,
      y: current.y - prev.y
    };
    
    const outgoingVector = {
      x: next.x - current.x,
      y: next.y - current.y
    };
    
    // For orthogonal shapes, one will be (±1,0) and the other (0,±1)
    // The cross product determines if it's an outside (convex) or inside (concave) corner
    const crossProductZ = incomingVector.x * outgoingVector.y - incomingVector.y * outgoingVector.x;
    const isOutsideCorner = crossProductZ < 0;
    
    // For outside corners, we need to offset in both directions
    // For inside corners, the corner moves directly inward
    let offsetCorner: Point;
    
    if (isOutsideCorner) {
      // Outside corner - offset in both directions
      // For 90-degree outside corners, we move inward by the offset distance in both directions
      offsetCorner = {
        x: current.x + (incomingIsHorizontal ? 0 : Math.sign(incomingVector.x) * -insetDistance) + 
                     (outgoingIsHorizontal ? 0 : Math.sign(outgoingVector.x) * -insetDistance),
        y: current.y + (incomingIsHorizontal ? Math.sign(incomingVector.y) * -insetDistance : 0) + 
                     (outgoingIsHorizontal ? Math.sign(outgoingVector.y) * -insetDistance : 0)
      };
    } else {
      // Inside corner - offset in the appropriate direction
      // For 90-degree inside corners, we move inward by the offset distance
      offsetCorner = {
        x: current.x + (incomingIsHorizontal ? 0 : Math.sign(incomingVector.x) * -insetDistance),
        y: current.y + (incomingIsHorizontal ? Math.sign(incomingVector.y) * -insetDistance : 0)
      };
      
      // For inside corners, we need a second point to maintain the 90-degree corner
      const secondCorner = {
        x: current.x + (outgoingIsHorizontal ? 0 : Math.sign(outgoingVector.x) * -insetDistance),
        y: current.y + (outgoingIsHorizontal ? Math.sign(outgoingVector.y) * -insetDistance : 0)
      };
      
      // Add both points to create the 90-degree inside corner
      offsetPolygon.push(offsetCorner);
      offsetPolygon.push(secondCorner);
      
      // We've handled this corner completely, so continue to the next one
      continue;
    }
    
    // Add the corner to our offset polygon
    offsetPolygon.push(offsetCorner);
  }
  
  // Special case for orthogonal building perimeters:
  // If we're processing a rectangular perimeter, we need to ensure we generate 4 corners
  if (offsetPolygon.length === 0) {
    // Assuming it's a simple rectangle, get the bounding box and offset it
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const pt of perimeterPoints) {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    }
    
    // Create the inset rectangle
    offsetPolygon.push({ x: minX + insetDistance, y: minY + insetDistance });
    offsetPolygon.push({ x: maxX - insetDistance, y: minY + insetDistance });
    offsetPolygon.push({ x: maxX - insetDistance, y: maxY - insetDistance });
    offsetPolygon.push({ x: minX + insetDistance, y: maxY - insetDistance });
  }
  
  // Close the path
  if (offsetPolygon.length > 0) {
    offsetPolygon.push({ ...offsetPolygon[0] });
  }
  
  return offsetPolygon;
}
