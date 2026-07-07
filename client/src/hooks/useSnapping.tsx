import { Point, Room } from "../types";
import { GRID_SIZE, SNAP_THRESHOLD } from "../lib/constants";

interface SnapPoint extends Point {
  type: "grid" | "corner" | "midpoint" | "intersection";
  source?: string;
}

export const useSnapping = () => {
  // Snap a point to the grid
  const snapToGrid = (point: Point): Point => {
    const snappedX = Math.round(point.x / GRID_SIZE) * GRID_SIZE;
    const snappedY = Math.round(point.y / GRID_SIZE) * GRID_SIZE;
    
    return { x: snappedX, y: snappedY };
  };
  
  // Snap a point to a room's snap points (corners and midpoints)
  const snapToRoom = (point: Point, rooms: Room[]): Point => {
    // First, get all valid snap points from rooms
    const snapPoints: SnapPoint[] = [];
    
    // Add grid snap points
    const gridSnap = snapToGrid(point);
    snapPoints.push({ ...gridSnap, type: "grid" });
    
    // Add room snap points
    rooms.forEach(room => {
      // Corner points
      snapPoints.push({ x: room.x, y: room.y, type: "corner", source: `room-${room.id}-tl` });
      snapPoints.push({ x: room.x + room.width, y: room.y, type: "corner", source: `room-${room.id}-tr` });
      snapPoints.push({ x: room.x, y: room.y + room.height, type: "corner", source: `room-${room.id}-bl` });
      snapPoints.push({ x: room.x + room.width, y: room.y + room.height, type: "corner", source: `room-${room.id}-br` });
      
      // Midpoints
      snapPoints.push({ x: room.x + room.width/2, y: room.y, type: "midpoint", source: `room-${room.id}-tm` });
      snapPoints.push({ x: room.x, y: room.y + room.height/2, type: "midpoint", source: `room-${room.id}-ml` });
      snapPoints.push({ x: room.x + room.width, y: room.y + room.height/2, type: "midpoint", source: `room-${room.id}-mr` });
      snapPoints.push({ x: room.x + room.width/2, y: room.y + room.height, type: "midpoint", source: `room-${room.id}-bm` });
    });
    
    // Add intersection points between rooms
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const room1 = rooms[i];
        const room2 = rooms[j];
        
        // Check for horizontal alignments
        if (room1.y === room2.y || room1.y === room2.y + room2.height || 
            room1.y + room1.height === room2.y || room1.y + room1.height === room2.y + room2.height) {
          // Get x-range overlap
          const xMin = Math.max(room1.x, room2.x);
          const xMax = Math.min(room1.x + room1.width, room2.x + room2.width);
          
          if (xMax > xMin) {
            // There's an overlap, add intersections at start and end of overlap
            snapPoints.push({ 
              x: xMin, 
              y: room1.y === room2.y ? room1.y : 
                 room1.y === room2.y + room2.height ? room1.y : 
                 room1.y + room1.height === room2.y ? room1.y + room1.height : 
                 room1.y + room1.height,
              type: "intersection",
              source: `intersection-h-${i}-${j}-start`
            });
            
            snapPoints.push({ 
              x: xMax, 
              y: room1.y === room2.y ? room1.y : 
                 room1.y === room2.y + room2.height ? room1.y : 
                 room1.y + room1.height === room2.y ? room1.y + room1.height : 
                 room1.y + room1.height,
              type: "intersection",
              source: `intersection-h-${i}-${j}-end`
            });
          }
        }
        
        // Check for vertical alignments
        if (room1.x === room2.x || room1.x === room2.x + room2.width || 
            room1.x + room1.width === room2.x || room1.x + room1.width === room2.x + room2.width) {
          // Get y-range overlap
          const yMin = Math.max(room1.y, room2.y);
          const yMax = Math.min(room1.y + room1.height, room2.y + room2.height);
          
          if (yMax > yMin) {
            // There's an overlap, add intersections at start and end of overlap
            snapPoints.push({ 
              x: room1.x === room2.x ? room1.x : 
                 room1.x === room2.x + room2.width ? room1.x : 
                 room1.x + room1.width === room2.x ? room1.x + room1.width : 
                 room1.x + room1.width,
              y: yMin,
              type: "intersection",
              source: `intersection-v-${i}-${j}-start`
            });
            
            snapPoints.push({ 
              x: room1.x === room2.x ? room1.x : 
                 room1.x === room2.x + room2.width ? room1.x : 
                 room1.x + room1.width === room2.x ? room1.x + room1.width : 
                 room1.x + room1.width,
              y: yMax,
              type: "intersection",
              source: `intersection-v-${i}-${j}-end`
            });
          }
        }
      }
    }
    
    // Find the closest snap point
    let closestPoint = gridSnap;
    let minDistance = Number.MAX_VALUE;
    
    snapPoints.forEach(snapPoint => {
      const distance = Math.sqrt(
        Math.pow(point.x - snapPoint.x, 2) + Math.pow(point.y - snapPoint.y, 2)
      );
      
      if (distance < minDistance && distance < SNAP_THRESHOLD) {
        minDistance = distance;
        closestPoint = snapPoint;
      }
    });
    
    return closestPoint;
  };
  
  return {
    snapToGrid,
    snapToRoom
  };
};
