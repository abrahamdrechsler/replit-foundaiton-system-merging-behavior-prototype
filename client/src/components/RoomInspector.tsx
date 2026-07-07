import { useState, ChangeEvent } from "react";
import { useRooms } from "../hooks/useRooms";
import { Button } from "./ui/button";
import { Trash2, X, ChevronRight, Wallpaper } from "lucide-react";

// Predefined colors for rooms
const ROOM_COLORS = [
  "#ef4444", // Red
  "#f97316", // Orange
  "#f59e0b", // Amber
  "#84cc16", // Lime
  "#10b981", // Emerald
  "#06b6d4", // Cyan
  "#3b82f6", // Blue
  "#8b5cf6", // Violet
  "#d946ef", // Fuchsia
  "#ec4899", // Pink
];

const RoomInspector = () => {
  const { 
    rooms, 
    selectedRoom, 
    updateRoom, 
    deleteRoom, 
    setSelectedRoom,
    phase,
    setPhase
  } = useRooms();
  
  const [roomName, setRoomName] = useState("");
  
  // Update local state when selected room changes
  useState(() => {
    if (selectedRoom) {
      setRoomName(selectedRoom.name);
    }
  });
  
  // Handle name change
  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setRoomName(e.target.value);
    
    if (selectedRoom) {
      updateRoom(selectedRoom.id, { name: e.target.value });
    }
  };
  
  // Handle color selection
  const handleColorSelect = (color: string) => {
    if (selectedRoom) {
      updateRoom(selectedRoom.id, { color });
    }
  };
  
  // Handle delete room
  const handleDeleteRoom = () => {
    if (selectedRoom) {
      deleteRoom(selectedRoom.id);
      setSelectedRoom(null);
    }
  };
  
  // Toggle foundation wall generation (Phase 1 <-> Phase 2)
  const togglePhase = () => {
    setPhase(phase === 1 ? 2 : 1);
  };
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium">Room Inspector</h2>
        <Button 
          variant="outline" 
          size="sm"
          onClick={togglePhase}
        >
          <Wallpaper className="mr-2 h-4 w-4" />
          Phase {phase === 1 ? "1" : "2"}
        </Button>
      </div>
      
      {selectedRoom ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-medium">Selected Room</h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setSelectedRoom(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Name</label>
            <input
              type="text"
              value={roomName}
              onChange={handleNameChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
              placeholder="Room name"
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Color</label>
            <div className="flex flex-wrap gap-2">
              {ROOM_COLORS.map((color) => (
                <div
                  key={color}
                  onClick={() => handleColorSelect(color)}
                  className="w-6 h-6 rounded-full cursor-pointer border border-slate-300 flex items-center justify-center"
                  style={{ backgroundColor: color }}
                >
                  {selectedRoom.color === color && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
              ))}
              
              {/* Reset color option */}
              <div
                onClick={() => handleColorSelect("")}
                className="w-6 h-6 rounded-full cursor-pointer border border-slate-300 bg-white flex items-center justify-center"
              >
                <X className="h-3 w-3 text-slate-500" />
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Dimensions</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="px-3 py-2 border border-slate-200 rounded-md bg-slate-50">
                <span className="text-xs text-slate-500">Width</span>
                <p className="text-sm font-medium">{selectedRoom.width / 12}′</p>
              </div>
              <div className="px-3 py-2 border border-slate-200 rounded-md bg-slate-50">
                <span className="text-xs text-slate-500">Depth</span>
                <p className="text-sm font-medium">{selectedRoom.height / 12}′</p>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Position</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="px-3 py-2 border border-slate-200 rounded-md bg-slate-50">
                <span className="text-xs text-slate-500">X</span>
                <p className="text-sm font-medium">{selectedRoom.x / 12}′</p>
              </div>
              <div className="px-3 py-2 border border-slate-200 rounded-md bg-slate-50">
                <span className="text-xs text-slate-500">Y</span>
                <p className="text-sm font-medium">{selectedRoom.y / 12}′</p>
              </div>
            </div>
          </div>
          
          <Button 
            variant="destructive" 
            className="w-full mt-4" 
            onClick={handleDeleteRoom}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Room
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
          <div className="mb-4 p-3 bg-slate-100 rounded-full">
            <ChevronRight className="h-6 w-6" />
          </div>
          <p className="text-sm mb-2">No Room Selected</p>
          <p className="text-xs">Select a room from the 2D canvas or 3D preview</p>
        </div>
      )}
      
      <div className="mt-auto pt-4 border-t border-slate-200">
        <div className="text-xs text-slate-500">
          <p className="font-medium mb-1">Room Count: {rooms.length}</p>
          <p>Foundation Phase: {phase}</p>
          {phase === 2 && (
            <p className="mt-1 text-xs text-blue-500">
              Foundation walls enabled
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomInspector;
