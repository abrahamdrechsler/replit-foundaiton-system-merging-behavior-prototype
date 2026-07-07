import { createContext, useState, useContext, ReactNode } from "react";
import { Room } from "../types";

interface RoomContextType {
  rooms: Room[];
  selectedRoom: Room | null;
  phase: 1 | 2; // Phase 1: Rooms & Slabs, Phase 2: + Foundation Walls
  
  addRoom: (room: Room) => void;
  updateRoom: (id: number, updates: Partial<Room>) => void;
  deleteRoom: (id: number) => void;
  setSelectedRoom: (room: Room | null) => void;
  setPhase: (phase: 1 | 2) => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export const RoomProvider = ({ children }: { children: ReactNode }) => {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [phase, setPhase] = useState<1 | 2>(2); // Default to Phase 2 to show foundation walls
  
  const addRoom = (room: Room) => {
    setRooms([...rooms, room]);
  };
  
  const updateRoom = (id: number, updates: Partial<Room>) => {
    setRooms(rooms.map(room => 
      room.id === id ? { ...room, ...updates } : room
    ));
    
    // Also update selected room if it's the one being updated
    if (selectedRoom && selectedRoom.id === id) {
      setSelectedRoom({ ...selectedRoom, ...updates });
    }
  };
  
  const deleteRoom = (id: number) => {
    setRooms(rooms.filter(room => room.id !== id));
    
    // Deselect if the deleted room was selected
    if (selectedRoom && selectedRoom.id === id) {
      setSelectedRoom(null);
    }
  };
  
  return (
    <RoomContext.Provider value={{
      rooms,
      selectedRoom,
      phase,
      addRoom,
      updateRoom,
      deleteRoom,
      setSelectedRoom,
      setPhase
    }}>
      {children}
    </RoomContext.Provider>
  );
};

export const useRooms = () => {
  const context = useContext(RoomContext);
  
  if (context === undefined) {
    throw new Error("useRooms must be used within a RoomProvider");
  }
  
  return context;
};
