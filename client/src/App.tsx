import { useState } from "react";
import { RoomProvider } from "./hooks/useRooms";
import Canvas2D from "./components/Canvas2D";
import Canvas3D from "./components/Canvas3D";
import RoomInspector from "./components/RoomInspector";
import "@fontsource/inter";

function App() {
  return (
    <RoomProvider>
      <div className="flex flex-row h-screen w-screen bg-slate-100 text-slate-800">
        {/* Left side - 2D Canvas */}
        <div className="flex-1 p-4 border-r border-slate-300">
          <Canvas2D />
        </div>
        
        {/* Right side - 3D Preview */}
        <div className="flex-1 p-4 border-r border-slate-300">
          <Canvas3D />
        </div>
        
        {/* Far right - Room Inspector */}
        <div className="w-80 p-4 bg-white">
          <RoomInspector />
        </div>
      </div>
    </RoomProvider>
  );
}

export default App;
