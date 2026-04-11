'use client';

/**
 * components/SketchMyHomeDesigner.tsx
 * High-performance React wrapper for the Sketch My Home 2D Floor Plan Designer.
 */

import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore
import { CanvasEngine } from '@/lib/sketch-my-home/engine';
import { createClient } from '@/utils/supabase/client';
import { Layout, Hammer, Square, Trash2, Undo, Save, User, LogIn, MousePointer, Hand, DoorOpen, AppWindow, AlignJustify, Bed, Circle, Library, Bath, Droplets, Armchair, Type, Maximize2, Minus, Plus, Maximize } from 'lucide-react';
// @ts-ignore
import { ToolsManager } from '@/lib/sketch-my-home/tools';

interface AppUser {
  id: string;
  email?: string;
  role?: 'admin' | 'user';
}

interface UserRegistryItem {
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
}

export default function SketchMyHomeDesigner({ initialUser }: { initialUser: AppUser | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const toolsRef = useRef<ToolsManager | null>(null);
  const [activeTool, setActiveTool] = useState<string>('select');
  const [user, setUser] = useState<AppUser | null>(initialUser);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUsers, setAdminUsers] = useState<UserRegistryItem[]>([]);
  const supabase = createClient();

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new CanvasEngine(canvasRef.current);
      toolsRef.current = new ToolsManager(engineRef.current);
      toolsRef.current.setTool('select');

      // Sync selection state with React
      engineRef.current.onSelectionChange = (items: any[]) => {
        setSelectedItems([...items]);
      };
    }

    const handleResize = () => {
      if (engineRef.current) engineRef.current.resize();
    };

    window.addEventListener('resize', handleResize);
    // Initial resize to ensure the canvas fills the container correctly on mount
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (user?.role === 'admin' && showAdminModal) {
      fetchAdminData();
    }
  }, [showAdminModal, user]);

  const handleToolClick = (toolTarget: string) => {
    setActiveTool(toolTarget);
    if (toolsRef.current) {
      toolsRef.current.setTool(toolTarget);
    }
  };

  const handleSave = () => {
    if (!engineRef.current) return;
    const project = {
      v: 1.1,
      name: 'SketchMyHome Design',
      engine: 'NextJS',
      scene: engineRef.current.scene
    };
    const jsonStr = JSON.stringify(project, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sketchmyhome_design_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchAdminData = async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/manage-users');
      const data: UserRegistryItem[] = await res.json();
      setAdminUsers(data);
    } catch (e) { console.error(e); }
  };

  const handleThicknessChange = (val: number) => {
    if (!engineRef.current) return;
    const pxVal = Math.round(val * (engineRef.current.gridSize / 12) * 100) / 100;

    engineRef.current.selectedItems.forEach((item: any) => {
      if (item.type === 'wall') {
        item.thickness = pxVal;
      }
    });

    engineRef.current.render();
    setSelectedItems([...engineRef.current.selectedItems]);
  };

  const handleLineTypeChange = (val: string) => {
    if (!engineRef.current) return;
    engineRef.current.selectedItems.forEach((item: any) => {
      if (item.type === 'wall') {
        item.lineType = val;
      }
    });
    engineRef.current.render();
    setSelectedItems([...engineRef.current.selectedItems]);
  };

  const handleAltitudeChange = (val: number) => {
    if (!engineRef.current) return;
    engineRef.current.selectedItems.forEach((item: any) => {
      if (item.type === 'wall') {
        item.altitude = val;
      }
    });
    engineRef.current.render();
    setSelectedItems([...engineRef.current.selectedItems]);
  };

  const handleLengthChange = (valFeet: number) => {
    if (!engineRef.current || isNaN(valFeet)) return;
    const item = engineRef.current.selectedItems[0];
    if (!item || item.type !== 'wall') return;

    const pxLen = valFeet * engineRef.current.gridSize;
    const dx = item.endX - item.startX;
    const dy = item.endY - item.startY;
    const angle = Math.atan2(dy, dx);

    item.endX = item.startX + Math.cos(angle) * pxLen;
    item.endY = item.startY + Math.sin(angle) * pxLen;

    engineRef.current.render();
    setSelectedItems([...engineRef.current.selectedItems]);
  };

  const getInchesFromPx = (px: number) => {
    if (!engineRef.current) return 9;
    return Math.round(px / (engineRef.current.gridSize / 12));
  };

  const handleLogin = async (): Promise<void> => {
    const email = prompt("Email (Supabase Mock):", "admin@example.com");
    if (!email) return;
    const { data } = await supabase.auth.signInWithPassword({
      email,
      password: 'password'
    });
    if (data.user) {
      const newUser: AppUser = {
        id: data.user.id,
        email: data.user.email,
        role: data.user.email?.includes('admin') ? 'admin' : 'user'
      };
      setUser(newUser);
    }
  };

  const handleLogout = async (): Promise<void> => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <div className="main-wrapper bg-[#121214]">
      <div className="win-menu-bar">
        <div className="menu-item-group flex items-center gap-1">
          <div className="menu-item py-1 px-3">File</div>
          <div className="menu-item py-1 px-3">Edit</div>
          {user?.role === 'admin' && (
            <div className="menu-item py-1 px-3 text-primary font-bold cursor-pointer" onClick={() => setShowAdminModal(true)}>
              Admin Space
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 px-3">
          {user ? (
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs opacity-70 hover:opacity-100 transition-opacity">
              <User size={14} /> {user.email}
            </button>
          ) : (
            <button onClick={handleLogin} className="flex items-center gap-2 text-xs opacity-70 hover:opacity-100 transition-opacity">
              <LogIn size={14} /> Sign In
            </button>
          )}
        </div>
      </div>

      <div className="app-container">
        {/* Admin Modal Overlay */}
        {showAdminModal && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white border border-black/10 rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
              <div className="p-6 border-b border-black/10 flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <User size={20} className="text-primary" /> Admin Space Management
                </h2>
                <button onClick={() => setShowAdminModal(false)} className="opacity-50 hover:opacity-100 text-2xl">&times;</button>
              </div>
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="bg-black/5 p-4 rounded-lg border border-black/10">
                    <span className="text-[10px] uppercase tracking-widest opacity-50">Total Users</span>
                    <div className="text-2xl font-bold text-primary">{adminUsers.length || '--'}</div>
                  </div>
                  <div className="bg-black/5 p-4 rounded-lg border border-black/10">
                    <span className="text-[10px] uppercase tracking-widest opacity-50">System Status</span>
                    <div className="text-2xl font-bold text-blue-400">Stable</div>
                  </div>
                </div>

                <table className="w-full text-left">
                  <thead className="text-[10px] uppercase tracking-widest opacity-50 border-b border-black/10">
                    <tr>
                      <th className="pb-4">User Email</th>
                      <th className="pb-4">Role</th>
                      <th className="pb-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {adminUsers.map((u) => (
                      <tr key={u.email} className="border-b border-black/5">
                        <td className="py-4">{u.email}</td>
                        <td className="py-4 font-bold text-primary">{u.role}</td>
                        <td className="py-4">
                          <button className="text-xs bg-black/5 px-2 py-1 rounded">Update</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-black/10 flex justify-end">
                <button onClick={() => setShowAdminModal(false)} className="px-4 py-2 bg-black/5 rounded text-sm">Close Panel</button>
              </div>
            </div>
          </div>
        )}
        <div className="w-[240px] flex-shrink-0 border-r border-black/10 bg-white relative flex flex-col pt-6 h-full pb-0 z-20">
          <div className="brand px-4">
            <h1>sketch my home</h1>
          </div>
          <div className="tools-group h-full overflow-y-auto no-scrollbar pb-24">
            <h3 className="text-xs uppercase text-black/50 mb-2 px-2 tracking-widest font-bold">Tools</h3>
            <button className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => handleToolClick('select')}>
              <MousePointer size={20} /> <span>Select</span>
            </button>
            <button className={`tool-btn ${activeTool === 'pan' ? 'active' : ''}`} onClick={() => handleToolClick('pan')}>
              <Hand size={20} /> <span>Pan</span>
            </button>
            <button className={`tool-btn ${activeTool === 'wall' ? 'active' : ''}`} onClick={() => handleToolClick('wall')}>
              <Hammer size={20} /> <span>Wall</span>
            </button>
            <button className={`tool-btn ${activeTool === 'room' ? 'active' : ''}`} onClick={() => handleToolClick('room')}>
              <Layout size={20} /> <span>Room</span>
            </button>
            <button className={`tool-btn ${activeTool === 'measure_area' ? 'active' : ''}`} onClick={() => handleToolClick('measure_area')}>
              <Maximize2 size={20} /> <span>Area</span>
            </button>

            <h3 className="text-xs uppercase text-black/50 mt-4 mb-2 px-2 tracking-widest font-bold border-t border-black/10 pt-4">Elements</h3>
            <div className="grid grid-cols-2 gap-2">
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'door' ? 'active' : ''}`} onClick={() => handleToolClick('door')}>
                <DoorOpen size={16} /> <span className="text-[9px]">Door</span>
              </button>
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'window' ? 'active' : ''}`} onClick={() => handleToolClick('window')}>
                <AppWindow size={16} /> <span className="text-[9px]">Window</span>
              </button>
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'stairs' ? 'active' : ''}`} onClick={() => handleToolClick('stairs')}>
                <AlignJustify size={16} /> <span className="text-[9px]">Stairs</span>
              </button>
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'bed' ? 'active' : ''}`} onClick={() => handleToolClick('bed')}>
                <Bed size={16} /> <span className="text-[9px]">Bed</span>
              </button>
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'table' ? 'active' : ''}`} onClick={() => handleToolClick('table')}>
                <Circle size={16} /> <span className="text-[9px]">Table</span>
              </button>
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'bookshelf' ? 'active' : ''}`} onClick={() => handleToolClick('bookshelf')}>
                <Library size={16} /> <span className="text-[9px]">Bookshelf</span>
              </button>
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'commode' ? 'active' : ''}`} onClick={() => handleToolClick('commode')}>
                <Bath size={16} /> <span className="text-[9px]">Commode</span>
              </button>
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'washing_machine' ? 'active' : ''}`} onClick={() => handleToolClick('washing_machine')}>
                <Droplets size={16} /> <span className="text-[9px]">Washer</span>
              </button>
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'chair' ? 'active' : ''}`} onClick={() => handleToolClick('chair')}>
                <Armchair size={16} /> <span className="text-[9px]">Chair</span>
              </button>
              <button className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'text' ? 'active' : ''}`} onClick={() => handleToolClick('text')}>
                <Type size={16} /> <span className="text-[9px]">Text</span>
              </button>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 w-full p-4 bg-white border-t border-black/10 flex flex-col gap-2 z-10 w-[240px]">
            <div className="flex gap-2 w-full">
              <button className="action-btn flex-1 bg-black/5 opacity-80 hover:opacity-100 !h-10" onClick={() => toolsRef.current?.setTool('delete')}>
                <Trash2 size={16} />
              </button>
              <button className="action-btn flex-1 bg-black/5 opacity-80 hover:opacity-100 !h-10" onClick={() => engineRef.current?.undo()}>
                <Undo size={16} />
              </button>
            </div>
            <button className="action-btn primary w-full !h-10" onClick={handleSave}><Save size={16} /> <span>Save</span></button>
          </div>
        </div>
        <div className="canvas-container relative">
          <canvas ref={canvasRef} />

          {/* Properties Panel (Integrated into Canvas space) */}
          {selectedItems.length > 0 && (
            <div className="absolute top-6 right-6 w-64 bg-white/95 backdrop-blur-md rounded-xl shadow-2xl border border-black/10 overflow-hidden z-20 transition-all duration-300 animate-in fade-in slide-in-from-right-4">
              <div className="px-4 py-3 border-b border-black/10 bg-black/5 flex justify-between items-center">
                <h3 className="text-sm font-bold opacity-80 uppercase tracking-widest flex items-center gap-2">
                  <Square size={14} className="text-primary" /> Properties
                </h3>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                  {selectedItems.length} {selectedItems.length === 1 ? 'Item' : 'Items'}
                </span>
              </div>
              <div className="p-4 flex flex-col gap-6">
                {selectedItems.length > 0 && selectedItems.every(i => i.type === 'wall') && (
                  <div className="flex flex-col gap-3">
                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-50">Wall Geometry</label>
                    <div className="flex flex-col gap-2">
                      {selectedItems.length === 1 && (
                        <div className="flex justify-between items-center text-xs">
                          <span className="opacity-70">Length (ft)</span>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.1"
                              min="0.1"
                              value={(Math.hypot(selectedItems[0].endX - selectedItems[0].startX, selectedItems[0].endY - selectedItems[0].startY) / (engineRef.current?.gridSize || 20)).toFixed(1)}
                              className="w-16 bg-black/5 border border-black/10 rounded px-1.5 py-1 font-mono text-primary font-bold text-right"
                              onChange={(e) => handleLengthChange(parseFloat(e.target.value))}
                            />
                            <span className="opacity-40">ft</span>
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-xs pt-2">
                        <span className="opacity-70">Thickness</span>
                        <span className="font-mono text-primary font-bold">{getInchesFromPx(selectedItems[0].thickness || 9 * (engineRef.current?.gridSize || 20) / 12)}"</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="36"
                        value={getInchesFromPx(selectedItems[0].thickness || 9 * (engineRef.current?.gridSize || 20) / 12)}
                        className="w-full h-1.5 bg-black/5 rounded-lg appearance-none cursor-pointer accent-primary"
                        onChange={(e) => handleThicknessChange(parseInt(e.target.value))}
                      />
                    </div>
                  </div>
                )}

                {selectedItems.length > 0 && selectedItems.every(i => i.type === 'wall') && (
                  <div className="flex flex-col gap-3 pt-4 border-t border-black/5">
                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-50">Visual Style</label>
                    <select
                      value={selectedItems[0].lineType || 'solid'}
                      className="w-full bg-black/5 border border-black/10 rounded-lg p-2 text-xs outline-none focus:border-primary transition-colors"
                      onChange={(e) => handleLineTypeChange(e.target.value)}
                    >
                      <option value="solid">Solid Wall</option>
                      <option value="dotted">Dotted (Half Wall)</option>
                    </select>
                  </div>
                )}

                {selectedItems.length > 0 && selectedItems.every(i => i.type === 'wall') && (
                  <div className="flex flex-col gap-3 pt-4 border-t border-black/5">
                    <label className="text-[10px] uppercase tracking-widest font-bold opacity-50">Wall Altitude (Height)</label>
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-mono text-blue-500 font-bold">{selectedItems[0].altitude || 8}ft</span>
                        <span className="opacity-40 tracking-tighter">1ft — 30ft</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="30"
                        step="0.5"
                        value={selectedItems[0].altitude || 8}
                        className="w-full h-1.5 bg-black/5 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        onChange={(e) => handleAltitudeChange(parseFloat(e.target.value))}
                      />
                    </div>
                  </div>
                )}

                {selectedItems.length > 0 && selectedItems.every(i => i.type === 'object') && (
                  <div className="text-xs space-y-2">
                    <div className="flex justify-between border-b border-black/5 pb-2">
                      <span className="opacity-50">Type</span>
                      <span className="font-bold uppercase tracking-tight">{selectedItems[0].subType}</span>
                    </div>
                    {selectedItems.length === 1 && (
                      <div className="flex justify-between">
                        <span className="opacity-50">Dimensions</span>
                        <span className="font-mono">{engineRef.current?.pixelsToFeet(selectedItems[0].width)} x {engineRef.current?.pixelsToFeet(selectedItems[0].height)}</span>
                      </div>
                    )}
                  </div>
                )}

                {selectedItems.length > 1 && !selectedItems.every(i => i.type === selectedItems[0].type) && (
                  <div className="text-xs opacity-60 italic text-center py-4 bg-black/5 rounded-lg border border-dashed border-black/10">
                    Mixed selection: Bulk editing restricted.
                  </div>
                )}

                <div className="pt-2 border-t border-black/5 flex gap-2">
                  <button
                    className="flex-1 text-[11px] font-bold py-2 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-lg transition-all flex items-center justify-center gap-2"
                    onClick={() => toolsRef.current?.setTool('delete')}
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="absolute bottom-6 right-6 flex items-center gap-1 bg-white/90 p-1.5 rounded-lg border border-black/10 z-10 backdrop-blur-sm">
            <button className="p-2 hover:bg-black/10 rounded text-black/70 hover:text-black transition-colors" onClick={() => engineRef.current && (engineRef.current.scale = Math.max(0.1, engineRef.current.scale - 0.1), engineRef.current.render())} title="Zoom Out">
              <Minus size={16} />
            </button>
            <button className="p-2 hover:bg-black/10 rounded text-black/70 hover:text-black transition-colors text-xs font-bold w-12 text-center" onClick={() => engineRef.current && (engineRef.current.scale = 1, engineRef.current.offsetX = 0, engineRef.current.offsetY = 0, engineRef.current.render())} title="Reset Zoom">
              100%
            </button>
            <button className="p-2 hover:bg-black/10 rounded text-black/70 hover:text-black transition-colors" onClick={() => engineRef.current && (engineRef.current.scale = Math.min(5, engineRef.current.scale + 0.1), engineRef.current.render())} title="Zoom In">
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
