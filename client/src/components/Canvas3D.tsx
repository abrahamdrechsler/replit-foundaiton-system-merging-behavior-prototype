import { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, GizmoHelper, GizmoViewport } from '@react-three/drei';
import * as THREE from 'three';
import { useRooms } from '../hooks/useRooms';
import { Room, Point } from '../types';
import { FOUNDATION_WALL_HEIGHT, FOUNDATION_WALL_THICKNESS, GRID_SIZE, SLAB_THICKNESS } from '../lib/constants';
import { areRoomsTouching, areRoomsOverlapping, getCombinedRoomPerimeter } from '../lib/geometry';

// Global camera state for persistence across room selection
let hasInitializedCamera = false;
const lastCameraPosition = new THREE.Vector3(8, 8, 8);
const lastCameraTarget = new THREE.Vector3(0, 0, 0);

// Convert mesh units to architectural feet
const unitsToFeet = (units: number) => units / GRID_SIZE;

const Scene = () => {
  // Get rooms data from context
  const { rooms, selectedRoom, setSelectedRoom, phase } = useRooms();
  
  // References to hold meshes
  const slabsRef = useRef<THREE.Group>(null);
  const wallsRef = useRef<THREE.Group>(null);
  
  // Treat each room individually, without grouping
  const roomGroups: Room[][] = rooms.map(room => [room]);
  
  // Calculate bounding box of a set of rooms
  const calculateBoundingBox = (rooms: Room[]): { x: number; y: number; width: number; height: number } => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    rooms.forEach(room => {
      minX = Math.min(minX, room.x);
      minY = Math.min(minY, room.y);
      maxX = Math.max(maxX, room.x + room.width);
      maxY = Math.max(maxY, room.y + room.height);
    });
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  };

  // Create a grid representation of all room cells
  const createGridFromRooms = (rooms: Room[]) => {
    // Find the bounding box of all rooms with some additional padding
    const padding = 24; // 2' padding to ensure we have enough space around
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    
    rooms.forEach(room => {
      minX = Math.min(minX, room.x);
      minY = Math.min(minY, room.y);
      maxX = Math.max(maxX, room.x + room.width);
      maxY = Math.max(maxY, room.y + room.height);
    });
    
    // Apply padding
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;
    
    // Use fixed cell size of 12 inches (1 foot)
    const cellSize = 12;
    const gridWidth = Math.ceil((maxX - minX) / cellSize);
    const gridHeight = Math.ceil((maxY - minY) / cellSize);
    
    // Initialize the grid with zeros
    const grid: number[][] = Array(gridHeight).fill(0).map(() => Array(gridWidth).fill(0));
    
    // Create a high-resolution occupancy grid
    // Each room will fully mark all cells it covers as occupied (value 1)
    rooms.forEach(room => {
      // Calculate grid coordinates for this room
      const startGridX = Math.floor((room.x - minX) / cellSize);
      const startGridY = Math.floor((room.y - minY) / cellSize);
      const endGridX = Math.ceil((room.x + room.width - minX) / cellSize);
      const endGridY = Math.ceil((room.y + room.height - minY) / cellSize);
      
      // Mark all cells covered by this room
      for (let y = startGridY; y < endGridY; y++) {
        for (let x = startGridX; x < endGridX; x++) {
          if (y >= 0 && y < gridHeight && x >= 0 && x < gridWidth) {
            // Check if the cell center is actually inside the room
            const cellCenterX = minX + (x + 0.5) * cellSize;
            const cellCenterY = minY + (y + 0.5) * cellSize;
            
            // If the cell center is inside any part of the room, mark it
            const isInside = 
              cellCenterX >= room.x && 
              cellCenterX <= room.x + room.width &&
              cellCenterY >= room.y && 
              cellCenterY <= room.y + room.height;
            
            if (isInside) {
              grid[y][x] = 1;
            }
          }
        }
      }
    });
    
    // For debugging: log the grid to see the occupied cells pattern
    // console.log("Grid representation:", grid.map(row => row.map(cell => cell === 0 ? '.' : '#').join('')).join('\n'));
    
    return { grid, minX, minY, cellSize };
  };

  // Clear and rebuild the scene when rooms change or phase changes
  useEffect(() => {
    if (!slabsRef.current || !wallsRef.current) return;
    
    // Clear existing meshes
    while (slabsRef.current.children.length > 0) {
      slabsRef.current.remove(slabsRef.current.children[0]);
    }
    
    while (wallsRef.current.children.length > 0) {
      wallsRef.current.remove(wallsRef.current.children[0]);
    }
    
    // Process each group of connected rooms
    roomGroups.forEach(group => {
      if (group.length === 1) {
        // Single room - create a simple slab
        const room = group[0];
        const slab = createSingleRoomSlab(room);
        
        // Store the room ID for click handling
        slab.userData.roomId = room.id;
        
        // Add to slabs group
        slabsRef.current!.add(slab);
        
        // If in phase 2, add foundation walls
        if (phase === 2) {
          // Use the same algorithm for single rooms as for groups
          const dummyShape = new THREE.Shape(); // Dummy shape, won't be used
          const walls = createCustomFoundationWalls(dummyShape, 0, 0, 0, 0, [room]);
          if (walls) {
            wallsRef.current!.add(walls);
          }
        }
      } else {
        // Multiple connected rooms - create a union shape
        const { slab, shape, centerX, centerY, width, depth } = createUnionSlab(group);
        
        // Store room IDs for click handling
        group.forEach(room => {
          // Find the specific mesh for this room in the group
          const roomMesh = slab.children.find(child => 
            child.position.x === unitsToFeet(room.x + room.width / 2) &&
            child.position.y === unitsToFeet(room.y + room.height / 2)
          );
          
          if (roomMesh) {
            roomMesh.userData.roomId = room.id;
          }
        });
        
        // Add to slabs group
        slabsRef.current!.add(slab);
        
        // If in phase 2, add foundation walls for the group
        if (phase === 2) {
          const walls = createCustomFoundationWalls(shape, centerX, centerY, width, depth, group);
          if (walls) {
            wallsRef.current!.add(walls);
          }
        }
      }
    });
    
    // Highlight the selected room if any
    if (selectedRoom) {
      highlightSelectedRoom(selectedRoom.id);
    }
  }, [rooms, selectedRoom, phase]);
  
  // Highlight the selected room
  const highlightSelectedRoom = (roomId: number) => {
    if (!slabsRef.current) return;
    
    // Reset all room colors
    slabsRef.current.traverse(child => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        // Reset to default color
        child.material.color.set(0xaaaaaa);
        child.material.emissive.set(0x000000);
      }
    });
    
    // Find and highlight the selected room
    slabsRef.current.traverse(child => {
      if (child instanceof THREE.Mesh && 
          child.userData && 
          child.userData.roomId === roomId &&
          child.material instanceof THREE.MeshStandardMaterial) {
        // Highlight the selected room
        child.material.color.set(0xffcc66);
        child.material.emissive.set(0x553300);
      }
    });
  };
  
  // Create a single room slab with proper dimensions
  const createSingleRoomSlab = (room: Room): THREE.Mesh => {
    // Create the slab geometry (width=X, height=Y, depth=Z)
    const slabGeometry = new THREE.BoxGeometry(
      unitsToFeet(room.width),     // X dimension
      unitsToFeet(room.height),    // Y dimension
      unitsToFeet(SLAB_THICKNESS)  // Z dimension (height)
    );
    
    // Create a material
    const slabMaterial = new THREE.MeshStandardMaterial({
      color: 0xaaaaaa,
      roughness: 0.8,
      metalness: 0.1,
      transparent: true,
      opacity: 0.7,
    });
    
    // Create the mesh
    const slab = new THREE.Mesh(slabGeometry, slabMaterial);
    
    // Position at the room's center, with Z offset for slab thickness
    slab.position.set(
      unitsToFeet(room.x + room.width / 2),   // X position
      unitsToFeet(room.y + room.height / 2),  // Y position
      unitsToFeet(SLAB_THICKNESS / 2)         // Z position (half slab thickness above ground)
    );
    
    return slab;
  };
  
  // Create a union slab for multiple connected rooms
  const createUnionSlab = (rooms: Room[]) => {
    // Calculate the bounding box for centering
    const bounds = calculateBoundingBox(rooms);
    const centerX = unitsToFeet(bounds.x + bounds.width / 2);
    const centerY = unitsToFeet(bounds.y + bounds.height / 2);
    const width = unitsToFeet(bounds.width);  
    const depth = unitsToFeet(bounds.height);
    
    // Create a group to hold all the individual room slabs
    const slabGroup = new THREE.Group();
    
    // Add each room as a separate box to the group
    rooms.forEach(room => {
      // Create a box for this room
      const roomGeometry = new THREE.BoxGeometry(
        unitsToFeet(room.width),     // X dimension
        unitsToFeet(room.height),    // Y dimension
        unitsToFeet(SLAB_THICKNESS)  // Z dimension (height/thickness)
      );
      
      const roomMaterial = new THREE.MeshStandardMaterial({
        color: 0xaaaaaa,
        roughness: 0.7,
        metalness: 0.1,
      });
      
      const roomMesh = new THREE.Mesh(roomGeometry, roomMaterial);
      
      // Position the room at its center point
      roomMesh.position.set(
        unitsToFeet(room.x + room.width / 2),  // X position
        unitsToFeet(room.y + room.height / 2), // Y position
        unitsToFeet(SLAB_THICKNESS / 2)        // Z position (half slab thickness above ground)
      );
      
      // Add this room to the group
      slabGroup.add(roomMesh);
    });
    
    // Create an empty shape to use for walls later
    const shape = new THREE.Shape();
    
    // For each room, add its outline to the shape (used for wall generation)
    rooms.forEach((room, index) => {
      // Convert room coordinates relative to center
      const x1 = unitsToFeet(room.x) - centerX;
      const x2 = unitsToFeet(room.x + room.width) - centerX;
      const y1 = unitsToFeet(room.y) - centerY;
      const y2 = unitsToFeet(room.y + room.height) - centerY;
      
      // For the first room, create the initial path
      if (index === 0) {
        shape.moveTo(x1, y1);
        shape.lineTo(x2, y1);
        shape.lineTo(x2, y2);
        shape.lineTo(x1, y2);
        shape.closePath();
      } else {
        // For subsequent rooms, create a separate path
        const roomShape = new THREE.Shape();
        roomShape.moveTo(x1, y1);
        roomShape.lineTo(x2, y1);
        roomShape.lineTo(x2, y2);
        roomShape.lineTo(x1, y2);
        roomShape.closePath();
      }
    });
    
    // Return the group and shape information for wall creation
    return { 
      slab: slabGroup, 
      shape, 
      centerX, 
      centerY, 
      width, 
      depth 
    };
  };
  
  // Create extruded foundation walls with inner offset from perimeter
  const createCustomFoundationWalls = (shape: THREE.Shape | null, centerX: number, centerY: number, width: number, depth: number, groupRooms: Room[]) => {
    if (!wallsRef.current) return null;
    
    // Wall dimensions
    const wallHeight = unitsToFeet(FOUNDATION_WALL_HEIGHT);
    const wallThickness = unitsToFeet(FOUNDATION_WALL_THICKNESS);
    
    // Wall material
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0x777777,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide
    });
    
    // Create a group to hold all foundation wall meshes
    const wallsGroup = new THREE.Group();
    
    // For a single room, create foundation walls from the room's dimensions directly
    if (groupRooms.length === 1) {
      const room = groupRooms[0];
      
      // Room dimensions in feet
      const roomWidth = unitsToFeet(room.width);
      const roomDepth = unitsToFeet(room.height);
      
      // Create outer shape matching room perimeter
      const outerShape = new THREE.Shape();
      outerShape.moveTo(-roomWidth/2, -roomDepth/2);
      outerShape.lineTo(roomWidth/2, -roomDepth/2);
      outerShape.lineTo(roomWidth/2, roomDepth/2);
      outerShape.lineTo(-roomWidth/2, roomDepth/2);
      outerShape.closePath();
      
      // Create inner hole (offset inward by wall thickness)
      const innerWidth = roomWidth - wallThickness * 2;
      const innerDepth = roomDepth - wallThickness * 2;
      
      const innerHole = new THREE.Path();
      innerHole.moveTo(-innerWidth/2, -innerDepth/2);
      innerHole.lineTo(innerWidth/2, -innerDepth/2);
      innerHole.lineTo(innerWidth/2, innerDepth/2);
      innerHole.lineTo(-innerWidth/2, innerDepth/2);
      innerHole.closePath();
      
      // Add inner hole to outer shape
      outerShape.holes.push(innerHole);
      
      // Extrusion settings - negative depth makes it extrude downward
      const extrudeSettings = {
        steps: 1,
        depth: -wallHeight,
        bevelEnabled: false
      };
      
      // Create extruded geometry from shape
      const wallGeometry = new THREE.ExtrudeGeometry(outerShape, extrudeSettings);
      
      // Create wall mesh
      const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
      
      // Position mesh at room center
      wallMesh.position.set(
        unitsToFeet(room.x + room.width/2),   // Center X
        unitsToFeet(room.y + room.height/2),  // Center Y
        0                                      // Top at ground level (z=0)
      );
      
      // Add to walls group
      wallsGroup.add(wallMesh);
    }
    // For multiple connected rooms, create foundation walls from the combined perimeter
    else if (groupRooms.length > 1) {
      // Get perimeter points
      const perimeterPoints = getCombinedRoomPerimeter(groupRooms);
      
      // Skip if not enough points for a shape
      if (perimeterPoints.length < 3) return wallsGroup;
      
      // Calculate bounds of perimeter
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      
      perimeterPoints.forEach(pt => {
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
      });
      
      // Calculate center of perimeter for positioning
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      
      // Create outer shape from perimeter
      const outerShape = new THREE.Shape();
      
      // Start with first perimeter point
      outerShape.moveTo(
        unitsToFeet(perimeterPoints[0].x - centerX),
        unitsToFeet(perimeterPoints[0].y - centerY)
      );
      
      // Add lines to remaining perimeter points
      for (let i = 1; i < perimeterPoints.length; i++) {
        outerShape.lineTo(
          unitsToFeet(perimeterPoints[i].x - centerX),
          unitsToFeet(perimeterPoints[i].y - centerY)
        );
      }
      
      // Create inner shape with proper offset for uniform wall thickness
      const innerShape = new THREE.Path();
      
      // We need to create a properly offset inner path
      // First, we'll offset each segment inward, then connect the segments properly
      
      // Calculate offset lines for each segment
      interface OffsetLine {
        p1: Point;
        p2: Point;
        originalIndex: number; // To track which segment this came from
      }
      
      const offsetLines: OffsetLine[] = [];
      
      // Process each segment of the perimeter
      for (let i = 0; i < perimeterPoints.length - 1; i++) {
        const p1 = perimeterPoints[i];
        const p2 = perimeterPoints[i + 1];
        
        // Calculate segment direction vector
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        
        // Skip zero-length segments
        if (length === 0) continue;
        
        // Calculate perpendicular vector (inward normal)
        const nx = -dy / length;  // Normal points inward
        const ny = dx / length;
        
        // Offset both points of the segment inward
        const offset1 = {
          x: p1.x + nx * FOUNDATION_WALL_THICKNESS,
          y: p1.y + ny * FOUNDATION_WALL_THICKNESS
        };
        
        const offset2 = {
          x: p2.x + nx * FOUNDATION_WALL_THICKNESS,
          y: p2.y + ny * FOUNDATION_WALL_THICKNESS
        };
        
        // Store this offset line
        offsetLines.push({
          p1: offset1,
          p2: offset2,
          originalIndex: i
        });
      }
      
      // Also process the closing segment from last point to first point
      const lastIdx = perimeterPoints.length - 1;
      const lastP = perimeterPoints[lastIdx];
      const firstP = perimeterPoints[0];
      
      const dxLast = firstP.x - lastP.x;
      const dyLast = firstP.y - lastP.y;
      const lengthLast = Math.sqrt(dxLast * dxLast + dyLast * dyLast);
      
      if (lengthLast > 0) {
        const nxLast = -dyLast / lengthLast;
        const nyLast = dxLast / lengthLast;
        
        const offsetLast1 = {
          x: lastP.x + nxLast * FOUNDATION_WALL_THICKNESS,
          y: lastP.y + nyLast * FOUNDATION_WALL_THICKNESS
        };
        
        const offsetLast2 = {
          x: firstP.x + nxLast * FOUNDATION_WALL_THICKNESS,
          y: firstP.y + nyLast * FOUNDATION_WALL_THICKNESS
        };
        
        offsetLines.push({
          p1: offsetLast1,
          p2: offsetLast2,
          originalIndex: lastIdx
        });
      }
      
      // Helper function to find intersection of two line segments (using arrow function to avoid block scoping issue)
      const lineIntersection = (a1: Point, a2: Point, b1: Point, b2: Point): Point | null => {
        // Line A represented as a1 + t * (a2 - a1)
        // Line B represented as b1 + s * (b2 - b1)
        
        const dxa = a2.x - a1.x;
        const dya = a2.y - a1.y;
        const dxb = b2.x - b1.x;
        const dyb = b2.y - b1.y;
        
        // Solve for t and s
        // a1 + t * (a2 - a1) = b1 + s * (b2 - b1)
        
        const denominator = dxa * dyb - dya * dxb;
        
        // If denominator is 0, lines are parallel
        if (Math.abs(denominator) < 0.0001) {
          return null;
        }
        
        const t = ((b1.x - a1.x) * dyb - (b1.y - a1.y) * dxb) / denominator;
        
        // Intersection point
        return {
          x: a1.x + t * dxa,
          y: a1.y + t * dya
        };
      };
      
      // Now we need to find the intersection points of adjacent offset lines
      // to create a clean inner perimeter
      const innerPerimeterPoints: Point[] = [];
      
      if (offsetLines.length > 0) {
        for (let i = 0; i < offsetLines.length; i++) {
          const currentLine = offsetLines[i];
          const nextLine = offsetLines[(i + 1) % offsetLines.length];
          
          // Find intersection of current line and next line
          const intersection = lineIntersection(
            currentLine.p1, currentLine.p2,
            nextLine.p1, nextLine.p2
          );
          
          // If there's an intersection, add it to our inner perimeter
          if (intersection) {
            innerPerimeterPoints.push(intersection);
          } else {
            // If no intersection (parallel lines), use the end point of current line
            innerPerimeterPoints.push(currentLine.p2);
          }
        }
      }
      
      // Create inner shape path
      if (innerPerimeterPoints.length > 2) {
        innerShape.moveTo(
          unitsToFeet(innerPerimeterPoints[0].x - centerX),
          unitsToFeet(innerPerimeterPoints[0].y - centerY)
        );
        
        for (let i = 1; i < innerPerimeterPoints.length; i++) {
          innerShape.lineTo(
            unitsToFeet(innerPerimeterPoints[i].x - centerX),
            unitsToFeet(innerPerimeterPoints[i].y - centerY)
          );
        }
        
        // Close the path
        innerShape.closePath();
        
        // Add inner shape as hole
        outerShape.holes.push(innerShape);
      }
      
      // Extrusion settings (negative to go down)
      const extrudeSettings = {
        steps: 1,
        depth: -wallHeight,
        bevelEnabled: false
      };
      
      // Create extruded geometry
      const wallGeometry = new THREE.ExtrudeGeometry(outerShape, extrudeSettings);
      
      // Create wall mesh
      const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial);
      
      // Position at calculated center
      wallMesh.position.set(
        unitsToFeet(centerX),
        unitsToFeet(centerY),
        0  // Top at ground level (z=0)
      );
      
      // Add to group
      wallsGroup.add(wallMesh);
    }
    
    return wallsGroup;
  };
  
  // Old function replaced by createCustomFoundationWalls
  
  // Handle clicks on room overlays
  const handleClick = (event: { object: THREE.Object3D }) => {
    if (event.object && event.object.userData && event.object.userData.roomId) {
      const roomId = event.object.userData.roomId;
      const clickedRoom = rooms.find((room: Room) => room.id === roomId);
      if (clickedRoom) {
        setSelectedRoom(clickedRoom);
      }
    }
  };
  
  // Camera control component
  const CameraControls = () => {
    const { camera } = useThree();
    const controlsRef = useRef<any>(null);
    
    useEffect(() => {
      if (!controlsRef.current) return;
      
      // Set up initial camera position if not already done
      if (!hasInitializedCamera) {
        camera.position.copy(lastCameraPosition);
        camera.up.set(0, 0, 1); // Z is up
        controlsRef.current.target.set(0, 0, 0);
        hasInitializedCamera = true;
      }
      
      // Force controls update
      controlsRef.current.update();
      
      // Save camera state when controls change
      const handleControlsChange = () => {
        if (!controlsRef.current) return;
        
        // Save camera position
        lastCameraPosition.copy(camera.position);
        lastCameraTarget.copy(controlsRef.current.target);
      };
      
      // Add change event listener
      controlsRef.current.addEventListener('change', handleControlsChange);
      
      return () => {
        controlsRef.current?.removeEventListener('change', handleControlsChange);
      };
    }, [camera, controlsRef.current]);
    
    // Configure OrbitControls for Z-up coordinate system
    return (
      <OrbitControls 
        ref={controlsRef} 
        makeDefault 
        dampingFactor={0.3}
        up={[0, 0, 1]} // Z is up
      />
    );
  };
  
  return (
    <>
      <CameraControls />
      
      {/* Ambient light */}
      <ambientLight intensity={0.5} />
      
      {/* Directional light */}
      <directionalLight 
        position={[10, 5, 10]} 
        intensity={1} 
        castShadow 
        shadow-mapSize-width={1024} 
        shadow-mapSize-height={1024}
      />
      
      {/* Grid on the XY plane (Z=0) for Z-up system */}
      <gridHelper args={[20, 20]} position={[0, 0, 0]} rotation={[Math.PI/2, 0, 0]} />
      
      {/* Slabs group */}
      <group ref={slabsRef} onClick={handleClick} />
      
      {/* Foundation walls group */}
      <group ref={wallsRef} />
      
      {/* Orientation helper */}
      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport labelColor="white" axisColors={['red', 'green', 'blue']} />
      </GizmoHelper>
    </>
  );
};

// 3D Canvas component
const Canvas3D = () => {
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-medium">3D Preview</h2>
      </div>
      
      <div className="flex-1 bg-slate-800 border border-slate-200 rounded-md overflow-hidden">
        <Canvas 
          shadows 
          gl={{ antialias: true }}
          camera={{ position: [8, 8, 8], up: [0, 0, 1] }}
        >
          <color attach="background" args={["#1e293b"]} />
          <Scene />
        </Canvas>
      </div>
      
      <div className="mt-2 text-xs text-slate-500">
        Pan: right-click and drag | Zoom: mouse wheel | Orbit: left-click and drag
      </div>
    </div>
  );
};

export default Canvas3D;