import { useRef, useState, useEffect } from "react";
import { useRooms } from "../hooks/useRooms";
import { useSnapping } from "../hooks/useSnapping";
import { Button } from "./ui/button";
import { Room, Point } from "../types";
import { GRID_SIZE, ROOM_MIN_SIZE, FOUNDATION_WALL_THICKNESS } from "../lib/constants";
import { PlusCircle, Move, MoveHorizontal, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import { 
  getCombinedRoomPerimeter, 
  areRoomsTouching, 
  createInsetPolyline 
} from "../lib/geometry";

type DrawState = "idle" | "drawing" | "moving" | "panning";
type DrawPoint = { x: number; y: number } | null;

// Draw the combined perimeter of all connected rooms
const drawCombinedPerimeter = (
  ctx: CanvasRenderingContext2D, 
  rooms: Room[]
) => {
  if (rooms.length === 0) return;
  
  // Find connected components (groups of rooms that overlap)
  const connectedComponents = findConnectedRooms(rooms);
  
  // Helper function to find edges (segments) of a room
  const getRoomEdges = (room: Room): {start: Point, end: Point}[] => {
    return [
      // Top edge
      {start: {x: room.x, y: room.y}, end: {x: room.x + room.width, y: room.y}},
      // Right edge
      {start: {x: room.x + room.width, y: room.y}, end: {x: room.x + room.width, y: room.y + room.height}},
      // Bottom edge
      {start: {x: room.x + room.width, y: room.y + room.height}, end: {x: room.x, y: room.y + room.height}},
      // Left edge
      {start: {x: room.x, y: room.y + room.height}, end: {x: room.x, y: room.y}}
    ];
  };
  
  // Helper to check if a point is inside any room of the component
  const isPointInAnyRoom = (point: Point, rooms: Room[]): boolean => {
    return rooms.some(room => 
      point.x >= room.x && 
      point.x <= room.x + room.width && 
      point.y >= room.y && 
      point.y <= room.y + room.height
    );
  };
  
  // Helper to check if a line segment is inside any room
  const isSegmentInAnyRoom = (
    start: Point, 
    end: Point, 
    rooms: Room[], 
    excludedRooms: Room[] = []
  ): boolean => {
    // Get rooms to check against (excluding any specified rooms)
    const roomsToCheck = rooms.filter(room => !excludedRooms.includes(room));
    
    // Check if both endpoints are inside any single room
    return roomsToCheck.some(room => 
      start.x >= room.x && 
      start.x <= room.x + room.width && 
      start.y >= room.y && 
      start.y <= room.y + room.height &&
      end.x >= room.x && 
      end.x <= room.x + room.width && 
      end.y >= room.y && 
      end.y <= room.y + room.height
    );
  };
  
  // Draw each connected component
  connectedComponents.forEach(component => {
    // For a single room, simply draw its rectangle
    if (component.length === 1) {
      const room = component[0];
      
      // Draw outer perimeter (blue)
      ctx.beginPath();
      ctx.strokeStyle = "#1e40af"; // Dark blue
      ctx.lineWidth = 3;
      ctx.rect(room.x, room.y, room.width, room.height);
      ctx.stroke();
      
      // Draw inner perimeter (pink)
      ctx.beginPath();
      ctx.strokeStyle = "rgb(255, 105, 180)"; // Hot pink
      ctx.lineWidth = 2;
      ctx.rect(
        room.x + FOUNDATION_WALL_THICKNESS,
        room.y + FOUNDATION_WALL_THICKNESS,
        room.width - FOUNDATION_WALL_THICKNESS * 2,
        room.height - FOUNDATION_WALL_THICKNESS * 2
      );
      ctx.stroke();
      return;
    }
    
    // For connected rooms, find the outer edges that form the combined perimeter
    // 1. Collect all edges from all rooms
    let allEdges: {start: Point, end: Point, room: Room}[] = [];
    component.forEach(room => {
      getRoomEdges(room).forEach(edge => {
        allEdges.push({...edge, room});
      });
    });
    
    // 2. Filter out edges that are inside another room
    const outerEdges = allEdges.filter(edge => {
      // Calculate midpoint of the edge
      const midpoint = {
        x: (edge.start.x + edge.end.x) / 2,
        y: (edge.start.y + edge.end.y) / 2
      };
      
      // Check if this midpoint is inside any OTHER room
      const otherRooms = component.filter(r => r.id !== edge.room.id);
      const isInside = otherRooms.some(room => 
        midpoint.x > room.x && 
        midpoint.x < room.x + room.width && 
        midpoint.y > room.y && 
        midpoint.y < room.y + room.height
      );
      
      // Keep edges that are NOT inside another room
      return !isInside;
    });
    
    // Draw the outline using the outer edges
    ctx.beginPath();
    ctx.strokeStyle = "#1e40af"; // Dark blue 
    ctx.lineWidth = 3;
    
    // Start a temporary solution - draw all outer edges
    outerEdges.forEach(edge => {
      ctx.moveTo(edge.start.x, edge.start.y);
      ctx.lineTo(edge.end.x, edge.end.y);
    });
    
    ctx.stroke();
    
    // Draw inner perimeters for each room
    ctx.beginPath();
    ctx.strokeStyle = "rgb(255, 105, 180)"; // Hot pink
    ctx.lineWidth = 2;
    
    component.forEach(room => {
      const innerX = room.x + FOUNDATION_WALL_THICKNESS;
      const innerY = room.y + FOUNDATION_WALL_THICKNESS;
      const innerWidth = room.width - FOUNDATION_WALL_THICKNESS * 2;
      const innerHeight = room.height - FOUNDATION_WALL_THICKNESS * 2;
      
      if (innerWidth > 0 && innerHeight > 0) {
        ctx.rect(innerX, innerY, innerWidth, innerHeight);
      }
    });
    
    ctx.stroke();
  });
  
  // Reset context state
  ctx.strokeStyle = "black";
  ctx.lineWidth = 1;
};

// Find groups of connected rooms
const findConnectedRooms = (rooms: Room[]): Room[][] => {
  if (rooms.length <= 1) return [rooms];
  
  // Create a graph where nodes are rooms and edges represent touching/overlapping rooms
  const adjacencyList: Map<number, number[]> = new Map();
  
  // Initialize the adjacency list for each room
  rooms.forEach(room => {
    adjacencyList.set(room.id, []);
  });
  
  // Fill the adjacency list by checking all pairs of rooms
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const room1 = rooms[i];
      const room2 = rooms[j];
      
      // Test if rooms overlap by checking their rectangles
      const overlapsHorizontally = !(room1.x + room1.width <= room2.x || room2.x + room2.width <= room1.x);
      const overlapsVertically = !(room1.y + room1.height <= room2.y || room2.y + room2.height <= room1.y);
      
      if (overlapsHorizontally && overlapsVertically) {
        adjacencyList.get(room1.id)?.push(room2.id);
        adjacencyList.get(room2.id)?.push(room1.id);
      }
    }
  }
  
  // Use BFS to find connected components
  const visited = new Set<number>();
  const components: Room[][] = [];
  
  rooms.forEach(room => {
    if (!visited.has(room.id)) {
      // Start a new component
      const component: Room[] = [];
      const queue: number[] = [room.id];
      visited.add(room.id);
      
      // BFS to find all rooms in this component
      while (queue.length > 0) {
        const currentId = queue.shift()!;
        const currentRoom = rooms.find(r => r.id === currentId)!;
        component.push(currentRoom);
        
        // Visit all connected rooms
        const connectedIds = adjacencyList.get(currentId) || [];
        for (const connectedId of connectedIds) {
          if (!visited.has(connectedId)) {
            visited.add(connectedId);
            queue.push(connectedId);
          }
        }
      }
      
      components.push(component);
    }
  });
  
  return components;
};

const Canvas2D = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { rooms, addRoom, updateRoom, selectedRoom, setSelectedRoom } = useRooms();
  const { snapToGrid, snapToRoom } = useSnapping();
  
  const [drawState, setDrawState] = useState<DrawState>("idle");
  const [startPoint, setStartPoint] = useState<DrawPoint>(null);
  const [currentPoint, setCurrentPoint] = useState<DrawPoint>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  
  // Panning state
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<Point | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1.0); // Default zoom level
  const minZoom = 0.25; // Minimum zoom (zoomed out)
  const maxZoom = 3.0; // Maximum zoom (zoomed in)
  
  // Initialize panOffset to center the origin when component mounts
  useEffect(() => {
    if (canvasRef.current) {
      setPanOffset({
        x: canvasRef.current.width / 2,
        y: canvasRef.current.height / 2
      });
    }
  }, [canvasSize]);

  // Calculate canvas dimensions on mount and resize
  useEffect(() => {
    const updateCanvasSize = () => {
      if (canvasRef.current && canvasRef.current.parentElement) {
        const width = canvasRef.current.parentElement.clientWidth;
        const height = canvasRef.current.parentElement.clientHeight - 40; // Subtract header height
        setCanvasSize({ width, height });
        canvasRef.current.width = width;
        canvasRef.current.height = height;
      }
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, []);

  // Handle keyboard movement of selected room
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedRoom) return;
      
      let newX = selectedRoom.x;
      let newY = selectedRoom.y;
      
      switch (e.key) {
        case "ArrowUp":
          newY -= GRID_SIZE;
          break;
        case "ArrowDown":
          newY += GRID_SIZE;
          break;
        case "ArrowLeft":
          newX -= GRID_SIZE;
          break;
        case "ArrowRight":
          newX += GRID_SIZE;
          break;
        default:
          return;
      }
      
      // Check if movement would cause overlap
      const movedRoom = { ...selectedRoom, x: newX, y: newY };
      const hasCollision = rooms.some(room => {
        if (room.id === selectedRoom.id) return false;
        return checkRoomCollision(movedRoom, room);
      });
      
      if (!hasCollision) {
        updateRoom(selectedRoom.id, { x: newX, y: newY });
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedRoom, rooms]);

  // Handle mouse wheel for zooming
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      
      // Get mouse position relative to canvas
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      // Calculate world coordinates of mouse position before zoom
      const worldX = (mouseX - panOffset.x) / zoomLevel;
      const worldY = (mouseY - panOffset.y) / zoomLevel;
      
      // Calculate new zoom level
      let newZoom = zoomLevel;
      if (e.deltaY < 0) {
        // Zoom in
        newZoom = Math.min(maxZoom, zoomLevel * 1.1);
      } else {
        // Zoom out
        newZoom = Math.max(minZoom, zoomLevel / 1.1);
      }
      
      // Calculate new pan offset to keep mouse position fixed
      const newPanX = mouseX - worldX * newZoom;
      const newPanY = mouseY - worldY * newZoom;
      
      // Update state
      setZoomLevel(newZoom);
      setPanOffset({ x: newPanX, y: newPanY });
    };
    
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [panOffset, zoomLevel, minZoom, maxZoom]);

  // Draw the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Apply pan offset and zoom transformation
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoomLevel, zoomLevel);
    
    // Draw grid
    drawGrid(ctx, canvas.width, canvas.height);
    
    // Draw X axis (vertical red line at x=0)
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 0, 0, 0.8)";
    ctx.lineWidth = 2;
    ctx.moveTo(0, -canvas.height * 10); // Extend well beyond visible area
    ctx.lineTo(0, canvas.height * 10);
    ctx.stroke();
    
    // Draw Y axis (horizontal green line at y=0)
    ctx.beginPath();
    ctx.strokeStyle = "rgba(0, 190, 0, 0.8)";
    ctx.lineWidth = 2;
    ctx.moveTo(-canvas.width * 10, 0); // Extend well beyond visible area
    ctx.lineTo(canvas.width * 10, 0);
    ctx.stroke();
    
    // Draw existing rooms
    rooms.forEach(room => {
      drawRoom(ctx, room, room.id === selectedRoom?.id);
    });
    
    // Draw room being created
    if (drawState === "drawing" && startPoint && currentPoint) {
      const width = currentPoint.x - startPoint.x;
      const height = currentPoint.y - startPoint.y;
      
      ctx.fillStyle = "rgba(0, 120, 215, 0.3)";
      ctx.strokeStyle = "rgba(0, 120, 215, 0.8)";
      ctx.lineWidth = 2;
      ctx.fillRect(startPoint.x, startPoint.y, width, height);
      ctx.strokeRect(startPoint.x, startPoint.y, width, height);
    }
    
    // Draw outlines of all rooms
    if (rooms.length > 0) {
      // Find connected components (groups of rooms that touch or overlap)
      const connectedComponents = findConnectedRooms(rooms);
      
      // Draw each connected component
      connectedComponents.forEach(component => {
        // Draw the outline of each room in the component (blue)
        ctx.beginPath();
        ctx.strokeStyle = "#1e40af"; // Dark blue
        ctx.lineWidth = 3;
        
        component.forEach(room => {
          ctx.rect(room.x, room.y, room.width, room.height);
        });
        
        ctx.stroke();
        
        // Draw the inner outline for each room (pink)
        ctx.beginPath();
        ctx.strokeStyle = "rgb(255, 105, 180)"; // Hot pink
        ctx.lineWidth = 2;
        
        component.forEach(room => {
          ctx.rect(
            room.x + FOUNDATION_WALL_THICKNESS,
            room.y + FOUNDATION_WALL_THICKNESS,
            room.width - FOUNDATION_WALL_THICKNESS * 2,
            room.height - FOUNDATION_WALL_THICKNESS * 2
          );
        });
        
        ctx.stroke();
      });
    }
    
    // Restore the context state
    ctx.restore();
    
  }, [rooms, startPoint, currentPoint, drawState, selectedRoom, canvasSize, panOffset]);

  // Draw grid function
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Calculate the visible area in world coordinates (accounting for zoom)
    const visibleWidth = width / zoomLevel;
    const visibleHeight = height / zoomLevel;
    
    // Calculate the starting point for grid lines
    // Convert from screen to world coordinates
    const worldLeft = -panOffset.x / zoomLevel;
    const worldTop = -panOffset.y / zoomLevel;
    
    // Calculate grid start and end points
    const startX = Math.floor(worldLeft / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(worldTop / GRID_SIZE) * GRID_SIZE;
    const endX = startX + visibleWidth + GRID_SIZE;
    const endY = startY + visibleHeight + GRID_SIZE;
    
    // Dynamically adjust grid line density based on zoom level
    let gridStep = GRID_SIZE;
    
    // If zoomed out too much, increase the grid step to avoid overcrowding
    if (zoomLevel < 0.5) {
      gridStep = GRID_SIZE * 2;
    }
    if (zoomLevel < 0.3) {
      gridStep = GRID_SIZE * 5;
    }
    
    ctx.beginPath();
    ctx.strokeStyle = "#e5e7eb";
    ctx.lineWidth = 1 / zoomLevel; // Adjust line width to maintain consistent appearance at different zoom levels
    
    // Draw vertical lines
    for (let x = startX; x <= endX; x += gridStep) {
      ctx.moveTo(x, worldTop);
      ctx.lineTo(x, worldTop + visibleHeight);
    }
    
    // Draw horizontal lines
    for (let y = startY; y <= endY; y += gridStep) {
      ctx.moveTo(worldLeft, y);
      ctx.lineTo(worldLeft + visibleWidth, y);
    }
    
    ctx.stroke();
    
    // Draw measurement indicators
    // Determine spacing based on zoom level
    let labelSpacing = GRID_SIZE * 5; // Default: every 5 feet
    if (zoomLevel > 1.5) labelSpacing = GRID_SIZE * 1; // Zoomed in: every 1 foot
    if (zoomLevel < 0.5) labelSpacing = GRID_SIZE * 10; // Zoomed out: every 10 feet
    
    ctx.fillStyle = "#6b7280";
    ctx.font = `${10 / zoomLevel}px Inter`; // Scale font to maintain consistent size
    ctx.textAlign = "center";
    
    // Draw X-axis measurements
    for (let x = Math.ceil(startX / labelSpacing) * labelSpacing; x <= endX; x += labelSpacing) {
      const label = `${x / GRID_SIZE}'`;
      ctx.fillText(label, x, worldTop + 12 / zoomLevel);
    }
    
    // Draw Y-axis measurements
    ctx.textAlign = "right";
    for (let y = Math.ceil(startY / labelSpacing) * labelSpacing; y <= endY; y += labelSpacing) {
      const label = `${y / GRID_SIZE}'`;
      ctx.fillText(label, worldLeft + 20 / zoomLevel, y + 4 / zoomLevel);
    }
  };

  // Draw room function
  const drawRoom = (ctx: CanvasRenderingContext2D, room: Room, isSelected: boolean) => {
    // Fill room
    ctx.fillStyle = room.color ? `${room.color}4D` : "rgba(148, 163, 184, 0.3)"; // 30% opacity
    ctx.fillRect(room.x, room.y, room.width, room.height);
    
    // Draw room border
    ctx.strokeStyle = isSelected ? "#3b82f6" : "#64748b";
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(room.x, room.y, room.width, room.height);
    
    // Draw room name
    ctx.fillStyle = "#1e293b";
    ctx.font = "12px Inter";
    ctx.textAlign = "center";
    ctx.fillText(
      room.name || `Room ${room.id}`, 
      room.x + room.width / 2, 
      room.y + room.height / 2
    );
    
    // Draw snap points when room is selected
    if (isSelected) {
      // Corners
      const snapPoints = [
        { x: room.x, y: room.y },
        { x: room.x + room.width, y: room.y },
        { x: room.x, y: room.y + room.height },
        { x: room.x + room.width, y: room.y + room.height }
      ];
      
      // Midpoints
      snapPoints.push(
        { x: room.x + room.width / 2, y: room.y }, // top
        { x: room.x, y: room.y + room.height / 2 }, // left
        { x: room.x + room.width, y: room.y + room.height / 2 }, // right
        { x: room.x + room.width / 2, y: room.y + room.height } // bottom
      );
      
      ctx.fillStyle = "#3b82f6";
      snapPoints.forEach(point => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };

  // Check if two rooms collide - allowing for a 1-unit (1 foot) overlap
  const checkRoomCollision = (room1: Room, room2: Room) => {
    // Allow rooms to overlap by 1 grid unit (1 foot)
    const overlapAllowance = GRID_SIZE;
    
    return !(
      room1.x + room1.width <= room2.x + overlapAllowance ||
      room1.x + overlapAllowance >= room2.x + room2.width ||
      room1.y + room1.height <= room2.y + overlapAllowance ||
      room1.y + overlapAllowance >= room2.y + room2.height
    );
  };

  // Convert screen coordinates to grid coordinates (accounting for pan offset)
  const screenToGrid = (screenX: number, screenY: number): Point => {
    return {
      x: screenX - panOffset.x,
      y: screenY - panOffset.y
    };
  };
  
  // Convert grid coordinates to screen coordinates
  const gridToScreen = (gridX: number, gridY: number): Point => {
    return {
      x: gridX + panOffset.x,
      y: gridY + panOffset.y
    };
  };

  // Event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // Convert screen coordinates to grid coordinates
    const gridPoint = screenToGrid(screenX, screenY);
    
    // Check if we're clicking on a room for panning decision
    const clickingOnRoom = rooms.some(room => 
      gridPoint.x >= room.x && 
      gridPoint.x <= room.x + room.width && 
      gridPoint.y >= room.y && 
      gridPoint.y <= room.y + room.height
    );
    
    // Start panning with left mouse button when not in drawing mode and not clicking on a room
    if (e.buttons === 1 && !isDrawingMode && !clickingOnRoom) {
      setDrawState("panning");
      setPanStart({ x: screenX, y: screenY });
      return;
    }
    
    // Snap to grid and room snap points
    const snappedPoint = isDrawingMode 
      ? snapToGrid(gridPoint) 
      : snapToRoom(gridPoint, rooms);
    
    // First check if we clicked on an existing room, regardless of mode
    const clickedRoom = rooms.find(room => {
      return (
        gridPoint.x >= room.x && 
        gridPoint.x <= room.x + room.width &&
        gridPoint.y >= room.y && 
        gridPoint.y <= room.y + room.height
      );
    });
    
    if (clickedRoom) {
      // Always select a room if we clicked on one
      setSelectedRoom(clickedRoom);
      return; // Exit early - we've selected a room
    }
    
    // If we didn't click on a room, continue with the appropriate action
    if (isDrawingMode) {
      if (drawState === "idle") {
        // Start drawing
        setDrawState("drawing");
        setStartPoint(snappedPoint);
        setCurrentPoint(snappedPoint);
      }
    } else {
      // In select mode, if we didn't click on a room, deselect current room
      setSelectedRoom(null);
    }
  };
  
  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    if (drawState === "panning") {
      setDrawState("idle");
      setPanStart(null);
      return;
    }
    
    if (drawState === "drawing" && startPoint && currentPoint) {
      // Finish drawing
      if (Math.abs(currentPoint.x - startPoint.x) >= ROOM_MIN_SIZE &&
          Math.abs(currentPoint.y - startPoint.y) >= ROOM_MIN_SIZE) {
        
        // Normalize rectangle (ensure width and height are positive)
        const minX = Math.min(startPoint.x, currentPoint.x);
        const minY = Math.min(startPoint.y, currentPoint.y);
        const maxX = Math.max(startPoint.x, currentPoint.x);
        const maxY = Math.max(startPoint.y, currentPoint.y);
        
        const newRoom = {
          id: Date.now(),
          name: `Room ${rooms.length + 1}`,
          x: minX,
          y: minY,
          width: maxX - minX,
          height: maxY - minY,
          color: ""
        };
        
        // Check if new room overlaps with any existing room
        const hasCollision = rooms.some(room => checkRoomCollision(newRoom, room));
        
        if (!hasCollision) {
          addRoom(newRoom);
          setSelectedRoom(newRoom);
        }
      }
      
      // Reset drawing state
      setDrawState("idle");
      setStartPoint(null);
      setCurrentPoint(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    
    // Handle panning
    if (drawState === "panning" && panStart) {
      const dx = screenX - panStart.x;
      const dy = screenY - panStart.y;
      
      setPanOffset(prev => ({
        x: prev.x + dx,
        y: prev.y + dy
      }));
      
      setPanStart({ x: screenX, y: screenY });
      return;
    }
    
    // Handle drawing
    if (drawState === "drawing" && startPoint) {
      // Convert screen coordinates to grid coordinates
      const gridPoint = screenToGrid(screenX, screenY);
      const snappedPoint = snapToGrid(gridPoint);
      setCurrentPoint(snappedPoint);
    }
  };

  const toggleDrawingMode = () => {
    setIsDrawingMode(!isDrawingMode);
    setDrawState("idle");
    setStartPoint(null);
    setCurrentPoint(null);
  };
  
  const resetView = () => {
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-medium">2D Canvas</h2>
        <div className="flex items-center gap-2">
          <Button 
            onClick={resetView} 
            variant="outline"
            size="sm"
            title="Reset View"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button 
            onClick={toggleDrawingMode} 
            variant={isDrawingMode ? "default" : "outline"}
            size="sm"
          >
            {isDrawingMode ? (
              <>
                <Move className="mr-2 h-4 w-4" />
                Select Mode
              </>
            ) : (
              <>
                <PlusCircle className="mr-2 h-4 w-4" />
                Draw Room
              </>
            )}
          </Button>
        </div>
      </div>
      
      <div className="flex-1 bg-white border border-slate-200 rounded-md overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseMove={handleMouseMove}
          className="w-full h-full"
          style={{ cursor: drawState === "panning" ? "grabbing" : isDrawingMode ? "crosshair" : "default" }}
        />
      </div>
      
      <div className="mt-2 text-xs text-slate-500">
        {isDrawingMode 
          ? "Click to set first corner, then click again to set opposite corner. Click on existing rooms to select them." 
          : "Click to select a room, click and drag to pan the view, use arrow keys to move selected room"}
      </div>
    </div>
  );
};

export default Canvas2D;
