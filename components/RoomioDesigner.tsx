'use client';

/**
 * components/RoomioDesigner.tsx
 * High-performance React wrapper for the Roomio 2D Floor Plan Designer.
 * 
 * Bridges the React lifecycle with the high-performance CanvasEngine.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CanvasEngine } from '@/lib/roomio/engine';
import { ElementRegistry } from '@/lib/roomio/elements';
import { createClient } from '@/utils/supabase/client';
import { Layout, Hammer, Square, Trash2, Undo, Save, Download, User, LogIn } from 'lucide-react';

export default function RoomioDesigner({ initialUser }: { initialUser: any }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const [user, setUser] = useState(initialUser);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const supabase = createClient();

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      const engine = new CanvasEngine(canvasRef.current);
      engine.onSelectionChange = (items) => setSelectedItems([...items]);
      engineRef.current = engine;
      
      const handleResize = () => engine.resize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const handleLogin = async () => {
    const email = prompt("Email (Supabase Mock):", "user@example.com");
    if (!email) return;
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: 'password'
    });
    if (data.user) setUser(data.user);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <div className="main-wrapper">
      {/* Top Menu Bar */}
      <div className="win-menu-bar">
        <div className="menu-item">
          File
          <div className="dropdown-menu">
            <div className="dropdown-item" onClick={() => engineRef.current?.clearScene()}>New Design</div>
            <div className="dropdown-item">Open Cloud Design</div>
            <div className="dropdown-divider"></div>
            <div className="dropdown-item">Export to DXF</div>
            <div className="dropdown-item">Print Layout</div>
          </div>
        </div>
        <div className="menu-item">Edit</div>
        <div className="menu-item">View</div>
        <div className="menu-item">Cloud</div>
        
        <div className="ml-auto flex items-center px-4" style={{ marginLeft: 'auto' }}>
          {user ? (
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs opacity-80 hover:opacity-100">
              <User size={14} /> {user.email} (Sign Out)
            </button>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-2 text-xs opacity-80 hover:opacity-100">
              <LogIn size={14} /> Sign In
            </button>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="app-container">
        {/* Sidebar Toolbar */}
        <div className="toolbar">
          <div className="brand">
            <h1>Roomio</h1>
            <span className="text-[10px] uppercase tracking-widest opacity-50 ml-1">Pro v2.5</span>
          </div>

          <div className="tools-group">
            <h3>Structure</h3>
            <button className="tool-btn active">
              <Layout size={18} /> <span>Room Rect</span>
            </button>
            <button className="tool-btn">
              <Hammer size={18} /> <span>Draw Wall</span>
            </button>
            <button className="tool-btn">
              <Square size={18} /> <span>Add Object</span>
            </button>
          </div>

          <div className="tools-group">
            <h3>Actions</h3>
            <button className="action-btn" onClick={() => engineRef.current?.undo()}>
              <Undo size={18} /> <span>Undo</span>
            </button>
            <button className="action-btn" onClick={() => engineRef.current?.deleteSelected()} disabled={selectedItems.length === 0}>
              <Trash2 size={18} /> <span>Delete Selected</span>
            </button>
          </div>

          <div className="tools-group bottom" style={{ marginTop: 'auto' }}>
            <button className="action-btn primary">
              <Save size={18} /> <span>Save to Cloud</span>
            </button>
          </div>
        </div>

        {/* Canvas Engine */}
        <div className="canvas-container">
           <canvas ref={canvasRef} />
        </div>

        {/* Properties Panel (Simplified) */}
        {selectedItems.length > 0 && (
          <div className="properties-panel">
            <h3 className="flex items-center gap-2">
              <Layout size={14} /> Properties
            </h3>
            <div id="selection-info">
               {selectedItems.length} items selected
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
