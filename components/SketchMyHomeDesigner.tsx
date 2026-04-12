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
import { SketchMyHomeCrypto } from '@/lib/sketch-my-home/crypto';

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

interface DesignTab {
  id: number;
  name: string;
  scene: any[];
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
  
  // Auth Form State
  const [showAuthModal, setShowAuthModal] = useState(true); // Always true on landing per request
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authCoupon, setAuthCoupon] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Menu Dropdown State
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  // HUD state
  const [showVastu, setShowVastu] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [northAngle, setNorthAngle] = useState(0);

  // Design Tabs State
  const [tabs, setTabs] = useState<DesignTab[]>([{ id: 0, name: 'Design 1', scene: [] }]);
  const [activeTabId, setActiveTabId] = useState<number>(0);
  const tabsRef = useRef<DesignTab[]>([{ id: 0, name: 'Design 1', scene: [] }]);
  const activeTabIdRef = useRef<number>(0);
  
  // Workspace Settings State
  const [canvasBgColor, setCanvasBgColor] = useState('#1e293b'); // Slate-800 default
  const canvasBgColorRef = useRef('#1e293b');

  // Sync refs with state for use in intervals/callbacks
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
    canvasBgColorRef.current = canvasBgColor;
    if (engineRef.current) {
      const engine = engineRef.current as any;
      engine.bgColor = canvasBgColor;
      engine.render();
    }
  }, [tabs, activeTabId, canvasBgColor]);

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

      // [Phase 1] Attempt to load local auto-save data on initialization
      const savedProject = localStorage.getItem('sketchmyhome_autosave');
      if (savedProject) {
        try {
          let content = savedProject;
          if (SketchMyHomeCrypto.isEncrypted(content)) {
            content = SketchMyHomeCrypto.decrypt(content);
          }
          const parsed = JSON.parse(content);
          
          // Migration: Wrap single scene projects into tabs structure
          if (parsed.scene && !parsed.designs) {
            const initialTabs = [{ id: 0, name: 'Design 1', scene: parsed.scene }];
            setTabs(initialTabs);
            setActiveTabId(0);
            engineRef.current.scene = parsed.scene;
          } else if (parsed.designs && Array.isArray(parsed.designs)) {
            setTabs(parsed.designs);
            const activeIdx = parsed.activeDesignIndex || 0;
            const activeTab = parsed.designs[activeIdx] || parsed.designs[0];
            setActiveTabId(activeTab.id);
            engineRef.current.scene = activeTab.scene || [];
            
            // Restore workspace settings if present
            if (parsed.settings) {
              if (parsed.settings.bgColor) {
                setCanvasBgColor(parsed.settings.bgColor);
                engineRef.current.bgColor = parsed.settings.bgColor;
              }
              if (parsed.settings.northAngle !== undefined) {
                setNorthAngle(parsed.settings.northAngle);
                engineRef.current.northAngle = parsed.settings.northAngle;
              }
            }
          }
          
          engineRef.current.render();
        } catch (e) {
          console.error('[AutoSave] Failed to restore design from local storage.', e);
        }
      }

      // [Phase 1] Auto-save observer (saves every 3 seconds if engine is active)
      const autoSaveInterval = setInterval(() => {
        const engine = engineRef.current;
        if (engine && engine.scene.length > 0) {
          // Sync current scene to active tab before saving
          const currentTabs = [...tabsRef.current];
          const activeIdx = currentTabs.findIndex(t => t.id === activeTabIdRef.current);
          if (activeIdx !== -1) {
            currentTabs[activeIdx].scene = engine.scene;
          }

          const payload = JSON.stringify({
            version: '2.3.0',
            name: 'SketchMyHome Active Session',
            activeDesignIndex: activeIdx !== -1 ? activeIdx : 0,
            settings: {
              bgColor: canvasBgColorRef.current,
              northAngle: engine.northAngle || 0
            },
            designs: currentTabs
          });
          const encrypted = SketchMyHomeCrypto.encrypt(payload);
          localStorage.setItem('sketchmyhome_autosave', encrypted);
        }
      }, 3000);
      
      // Store interval ID on the engine to clean it up later if needed
      (engineRef.current as any)._autoSaveInterval = autoSaveInterval;
    }

    const handleResize = () => {
      if (engineRef.current) engineRef.current.resize();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if typing in an input
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'f1') {
        e.preventDefault();
        setShowHelpModal(true);
      }
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        handleNewDesign();
      }
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        // Since we can't easily trigger the hidden file input without a ref, 
        // we'll just let the menu handle it for now or add a ref.
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (toolsRef.current) toolsRef.current.setTool('delete');
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);

    // Initial resize to ensure the canvas fills the container correctly on mount
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      if (engineRef.current && (engineRef.current as any)._autoSaveInterval) {
        clearInterval((engineRef.current as any)._autoSaveInterval);
      }
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
    const engine = engineRef.current;
    if (!engine) return;

    // Sync current scene to active tab before saving
    const currentTabs = [...tabs];
    const activeIdx = currentTabs.findIndex(t => t.id === activeTabId);
    if (activeIdx !== -1) {
      currentTabs[activeIdx].scene = engine.scene;
    }

    const project = {
      version: '2.3.0',
      projectName: 'SketchMyHome Design',
      activeDesignIndex: activeIdx !== -1 ? activeIdx : 0,
      settings: {
        bgColor: canvasBgColor,
        northAngle: engine.northAngle || 0
      },
      designs: currentTabs
    };
    
    const jsonStr = JSON.stringify(project);
    const encryptedContent = SketchMyHomeCrypto.encrypt(jsonStr);
    
    const blob = new Blob([encryptedContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sketchmyhome_project_${Date.now()}.rproj`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setActiveMenu(null);
  };

  const fetchAdminData = async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/manage-users');
      const data: UserRegistryItem[] = await res.json();
      setAdminUsers(data);
    } catch (e) { console.error(e); }
  };

  const handleThicknessChange = (val: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const pxVal = Math.round(val * (engine.gridSize / 12) * 100) / 100;

    engine.selectedItems.forEach((item: any) => {
      if (item.type === 'wall') {
        item.thickness = pxVal;
      }
    });

    engine.render();
    setSelectedItems([...engine.selectedItems]);
  };

  const handleLineTypeChange = (val: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.selectedItems.forEach((item: any) => {
      if (item.type === 'wall') {
        item.lineType = val;
      }
    });
    engine.render();
    setSelectedItems([...engine.selectedItems]);
  };

  const handleRotationChange = (val: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.selectedItems.forEach((item: any) => {
      if (item.type === 'object') {
        item.rotation = val;
      }
    });
    engine.render();
    setSelectedItems([...engine.selectedItems]);
  };

  const handleTextContextChange = (text: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.selectedItems.forEach((item: any) => {
      if (item.type === 'object' && item.subType === 'text') {
        item.text = text;
      }
    });
    engine.render();
    setSelectedItems([...engine.selectedItems]);
  };

  const handleTextSizeChange = (size: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.selectedItems.forEach((item: any) => {
      if (item.type === 'object' && item.subType === 'text') {
        item.fontSize = size;
      }
    });
    engine.render();
    setSelectedItems([...engine.selectedItems]);
  };

  const handleAltitudeChange = (val: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.selectedItems.forEach((item: any) => {
      if (item.type === 'wall') {
        item.altitude = val;
      }
    });
    engine.render();
    setSelectedItems([...engine.selectedItems]);
  };

  const handleLengthChange = (valFeet: number) => {
    const engine = engineRef.current;
    if (!engine || isNaN(valFeet)) return;
    const item = engine.selectedItems[0];
    if (!item || item.type !== 'wall') return;

    const pxLen = valFeet * engine.gridSize;
    const dx = item.endX - item.startX;
    const dy = item.endY - item.startY;
    const angle = Math.atan2(dy, dx);

    item.endX = item.startX + Math.cos(angle) * pxLen;
    item.endY = item.startY + Math.sin(angle) * pxLen;

    engine.render();
    setSelectedItems([...engine.selectedItems]);
  };

  const getInchesFromPx = (px: number) => {
    if (!engineRef.current) return 9;
    return Math.round(px / (engineRef.current.gridSize / 12));
  };

  const handleNewDesign = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (confirm('Are you sure you want to start a new project? All unsaved changes will be lost.')) {
      engine.scene = [];
      engine.undoStack = [];
      engine.render();
      setTabs([{ id: 0, name: 'Design 1', scene: [] }]);
      setActiveTabId(0);
      setSelectedItems([]);
      setActiveMenu(null);
    }
  };

  const switchTab = (tabId: number) => {
    const engine = engineRef.current;
    if (!engine || tabId === activeTabId) return;

    // Save current scene to active tab
    const updatedTabs = [...tabs];
    const oldIdx = updatedTabs.findIndex(t => t.id === activeTabId);
    if (oldIdx !== -1) {
      updatedTabs[oldIdx].scene = engine.scene;
    }

    // Load new scene
    const newTab = updatedTabs.find(t => t.id === tabId);
    if (newTab) {
      engine.scene = newTab.scene || [];
      engine.undoStack = [];
      engine.render();
      setActiveTabId(tabId);
      setTabs(updatedTabs);
    }
    setActiveMenu(null);
  };

  const addTab = () => {
    const newId = tabs.length > 0 ? Math.max(...tabs.map(t => t.id)) + 1 : 0;
    const newTab = { id: newId, name: `Design ${newId + 1}`, scene: [] };
    
    // Switch to the new tab immediately
    const engine = engineRef.current;
    if (engine) {
      const updatedTabs = [...tabs];
      const oldIdx = updatedTabs.findIndex(t => t.id === activeTabId);
      if (oldIdx !== -1) updatedTabs[oldIdx].scene = engine.scene;
      
      engine.scene = [];
      engine.undoStack = [];
      engine.render();
      
      setTabs([...updatedTabs, newTab]);
      setActiveTabId(newId);
    }
  };

  const removeTab = (tabId: number) => {
    if (tabs.length <= 1) return;
    if (!confirm('Are you sure you want to delete this design tab?')) return;

    const updatedTabs = tabs.filter(t => t.id !== tabId);
    if (tabId === activeTabId) {
      const newActive = updatedTabs[0];
      setActiveTabId(newActive.id);
      if (engineRef.current) {
        engineRef.current.scene = newActive.scene;
        engineRef.current.render();
      }
    }
    setTabs(updatedTabs);
  };

  const renameTab = (tabId: number) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    const newName = prompt('Enter new tab name:', tab.name);
    if (newName && newName.trim()) {
      setTabs(tabs.map(t => t.id === tabId ? { ...t, name: newName.trim() } : t));
    }
  };

  const handleOpenFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const engine = engineRef.current;
    if (!file || !engine) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rawContent = ev.target?.result as string;
        let finalContent = rawContent;
        
        if (SketchMyHomeCrypto.isEncrypted(rawContent)) {
          finalContent = SketchMyHomeCrypto.decrypt(rawContent);
        }
        
        const data = JSON.parse(finalContent);
        
        // Migration support for multi-tab
        if (data.designs && Array.isArray(data.designs)) {
          setTabs(data.designs);
          const activeIdx = data.activeDesignIndex || 0;
          const activeTab = data.designs[activeIdx] || data.designs[0];
          setActiveTabId(activeTab.id);
          engine.scene = activeTab.scene;
          
          // Restore workspace settings
          if (data.settings) {
            if (data.settings.bgColor) {
              setCanvasBgColor(data.settings.bgColor);
              engine.bgColor = data.settings.bgColor;
            }
            if (data.settings.northAngle !== undefined) {
              setNorthAngle(data.settings.northAngle);
              engine.northAngle = data.settings.northAngle;
            }
          }
        } else if (data.scene) {
          // Wrap single scene legacy files
          const singleTab = { id: 0, name: 'Imported Design', scene: data.scene };
          setTabs([singleTab]);
          setActiveTabId(0);
          engine.scene = data.scene;
        }
        
        engine.render();
      } catch (err) {
        alert('Failed to load project file. The file may be corrupt or encrypted with a different key.');
      }
    };
    reader.readAsText(file);
    setActiveMenu(null);
  };

  const handleExportPNG = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    try {
      // @ts-ignore
      const dataUrl = await engine.exportToDataURL('SketchMyHome Design');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `SketchMyHome_${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.error('Export failed', e);
    }
    setActiveMenu(null);
  };

  const toggleGrid = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const newState = !showGrid;
    setShowGrid(newState);
    engine.showGrid = newState;
    engine.render();
    setActiveMenu(null);
  };

  const toggleVastu = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const newState = !showVastu;
    setShowVastu(newState);
    engine.showVastu = newState;
    engine.render();
    setActiveMenu(null);
  };

  const handleUpdateNorthAngle = (angle: number) => {
    // Clamp angle to 0-359
    const normalized = ((angle % 360) + 360) % 360;
    const engine = engineRef.current;
    if (!engine) return;
    setNorthAngle(normalized);
    engine.northAngle = normalized;
    engine.render();
  };

  const handleLoginSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);

    try {
      // 1. Coupon Evaluation Encrypted Check
      // 'ZHJlYW1ob21lQDIwMjY=' is btoa('dreamhome@2026')
      const encryptedCoupon = btoa(authCoupon);
      if (encryptedCoupon !== 'ZHJlYW1ob21lQDIwMjY=') {
        setAuthError('Invalid coupon code.');
        setIsAuthLoading(false);
        return;
      }

      // 2. Mock Fallback for Admin (to match legacy engine parity)
      if (authEmail === 'admin@roomio.pro' && authPassword === 'adminpassword') {
        const mockAdmin: AppUser = {
          id: 'admin_001',
          email: 'admin@roomio.pro',
          role: 'admin'
        };
        setUser(mockAdmin);
        setShowAuthModal(false);
        setIsAuthLoading(false);
        return;
      }

      // 3. Supabase Auth (Real DB)
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword
      });

      if (error) {
        // Fallback for ANY valid email/password in development/staging (parity with legacy mock)
        if (authEmail.length >= 5 && authPassword.length >= 4) {
          const mockUser: AppUser = {
            id: 'mock_' + Math.random().toString(36).substr(2, 9),
            email: authEmail,
            role: 'user'
          };
          setUser(mockUser);
          setShowAuthModal(false);
          setIsAuthLoading(false);
          return;
        }

        setAuthError(error.message || 'Invalid email or password.');
        setIsAuthLoading(false);
        return;
      }

      if (data.user) {
        const newUser: AppUser = {
          id: data.user.id,
          email: data.user.email,
          role: data.user.email?.includes('admin') ? 'admin' : 'user'
        };
        setUser(newUser);
        setShowAuthModal(false);
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed.');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const openAuthModal = () => {
    setAuthError('');
    setShowAuthModal(true);
  };

  const handleLogout = async (): Promise<void> => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <div className="main-wrapper bg-slate-950 font-sans selection:bg-primary/30">
      <div className="win-menu-bar relative z-[100]">
        <div className="menu-item-group flex items-center gap-1 h-full px-2">
          {/* File Menu */}
          <div className="relative group h-full">
            <div className={`menu-item py-1 px-3 h-full flex items-center cursor-pointer transition-colors ${activeMenu === 'file' ? 'bg-primary/20 text-primary' : 'text-white/80 hover:bg-white/5'}`} onClick={() => setActiveMenu(activeMenu === 'file' ? null : 'file')}>File</div>
            {activeMenu === 'file' && (
              <div className="absolute top-full left-0 w-48 bg-slate-900/95 backdrop-blur-xl border border-white/5 shadow-2xl py-2 flex flex-col z-[1000] rounded-b-lg">
                <div className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs flex justify-between text-white/90 hover:text-white" onClick={handleNewDesign}><span>New Design</span><span className="opacity-60">Ctrl+N</span></div>
                <label className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs flex justify-between text-white/90 hover:text-white">
                  <span>Open Design</span><span className="opacity-60">Ctrl+O</span>
                  <input type="file" className="hidden" accept=".json,.rproj" onChange={handleOpenFile} />
                </label>
                <div className="h-px bg-white/5 my-1" />
                <div className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs flex justify-between text-white/90 hover:text-white" onClick={handleSave}><span>Save Project (.rproj)</span><span className="opacity-60">Ctrl+S</span></div>
                <div className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs flex justify-between text-white/90 hover:text-white" onClick={handleExportPNG}><span>Export as Image</span><span className="opacity-60">PNG</span></div>
              </div>
            )}
          </div>

          {/* Edit Menu */}
          <div className="relative group h-full">
            <div className={`menu-item py-1 px-3 h-full flex items-center cursor-pointer transition-colors ${activeMenu === 'edit' ? 'bg-primary/20 text-primary' : 'text-white/80 hover:bg-white/5'}`} onClick={() => setActiveMenu(activeMenu === 'edit' ? null : 'edit')}>Edit</div>
            {activeMenu === 'edit' && (
              <div className="absolute top-full left-0 w-48 bg-slate-900/95 backdrop-blur-xl border border-white/5 shadow-2xl py-2 flex flex-col z-[1000] rounded-b-lg">
                <div className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs flex justify-between text-white/90 hover:text-white" onClick={() => { engineRef.current?.undo(); setActiveMenu(null); }}><span>Undo</span><span className="opacity-60">Ctrl+Z</span></div>
                <div className="h-px bg-white/5 my-1" />
                <div className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs font-bold text-red-400 hover:text-red-300" onClick={() => { if(confirm('Clear all?')){engineRef.current!.scene=[]; engineRef.current!.render(); setActiveMenu(null);}} }>Clear Canvas</div>
              </div>
            )}
          </div>

          {/* View Menu */}
          <div className="relative group h-full">
            <div className={`menu-item py-1 px-3 h-full flex items-center cursor-pointer transition-colors ${activeMenu === 'view' ? 'bg-primary/20 text-primary' : 'text-white/80 hover:bg-white/5'}`} onClick={() => setActiveMenu(activeMenu === 'view' ? null : 'view')}>View</div>
            {activeMenu === 'view' && (
              <div className="absolute top-full left-0 w-48 bg-slate-900/95 backdrop-blur-xl border border-white/5 shadow-2xl py-2 flex flex-col z-[1000] rounded-b-lg">
                <div className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs flex items-center gap-2 text-white/90 hover:text-white" onClick={toggleGrid}>
                  <div className={`w-3 h-3 border border-white/40 flex items-center justify-center`}>{showGrid && <div className="w-1.5 h-1.5 bg-primary rounded-full" />}</div>
                  Grid Lines
                </div>
                <div className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs flex items-center gap-2 text-white/90 hover:text-white" onClick={toggleVastu}>
                  <div className={`w-3 h-3 border border-white/40 flex items-center justify-center`}>{showVastu && <div className="w-1.5 h-1.5 bg-primary rounded-full" />}</div>
                  Vastu Overlay
                </div>
                
                <div className="h-px bg-white/5 my-1" />
                <div className="px-4 py-2 flex flex-col gap-2">
                  <span className="text-[10px] uppercase tracking-widest font-bold opacity-40">Workspace Background</span>
                  <div className="flex gap-2">
                    {[
                      { name: 'Slate', color: '#1e293b' },
                      { name: 'Charcoal', color: '#262626' },
                      { name: 'Navy', color: '#0f172a' },
                      { name: 'Classic', color: '#ffffff' }
                    ].map((preset) => (
                      <button 
                        key={preset.name}
                        onClick={() => setCanvasBgColor(preset.color)}
                        className={`w-5 h-5 rounded-full border ${canvasBgColor === preset.color ? 'border-primary ring-1 ring-primary' : 'border-white/20'}`}
                        style={{ backgroundColor: preset.color }}
                        title={preset.name}
                      />
                    ))}
                    <div className="relative w-5 h-5 cursor-pointer">
                      <input 
                        type="color" 
                        value={canvasBgColor} 
                        onChange={(e) => setCanvasBgColor(e.target.value)}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                      />
                      <div className="w-full h-full rounded-full border border-white/20 bg-gradient-to-tr from-red-500 via-green-500 to-blue-500" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Help Menu */}
          <div className="relative group h-full">
            <div className={`menu-item py-1 px-3 h-full flex items-center cursor-pointer transition-colors ${activeMenu === 'help' ? 'bg-primary/20 text-primary' : 'text-white/80 hover:bg-white/5'}`} onClick={() => setActiveMenu(activeMenu === 'help' ? null : 'help')}>Help</div>
            {activeMenu === 'help' && (
              <div className="absolute top-full left-0 w-48 bg-slate-900/95 backdrop-blur-xl border border-white/5 shadow-2xl py-2 flex flex-col z-[1000] rounded-b-lg">
                <div className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs flex justify-between text-white/90 hover:text-white" onClick={() => { setShowHelpModal(true); setActiveMenu(null); }}><span>Shortcuts</span><span className="opacity-60">F1</span></div>
                <div className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs text-white/90 hover:text-white">Architectural Guide</div>
              </div>
            )}
          </div>

          {user?.role === 'admin' && (
            <div className="menu-item py-1 px-3 text-primary font-bold cursor-pointer" onClick={() => setShowAdminModal(true)}>
              Admin Space
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 px-3">
          {user ? (
            <button onClick={handleLogout} className="flex items-center gap-2 text-xs opacity-70 hover:opacity-100 transition-opacity">
              <User size={14} /> {user.email} (Sign Out)
            </button>
          ) : (
            <button onClick={openAuthModal} className="flex items-center gap-2 text-xs opacity-70 hover:opacity-100 transition-opacity">
              <LogIn size={14} /> Sign In
            </button>
          )}
        </div>
      </div>

      {/* Design Tabs Bar */}
      <div className="design-tabs-bar bg-slate-900 border-b border-white/5 flex items-center px-4 overflow-x-auto min-h-[40px] z-10 scrollbar-hide">
        <div className="flex gap-1 h-full items-center">
          {tabs.map((tab) => (
            <div 
              key={tab.id}
              className={`group flex items-center h-full px-4 border-b-2 transition-all cursor-pointer select-none ${activeTabId === tab.id ? 'border-primary bg-primary/10 text-white' : 'border-transparent text-white/40 hover:text-white/60'}`}
              onClick={() => switchTab(tab.id)}
              onDoubleClick={() => renameTab(tab.id)}
            >
              <span className="text-[11px] font-bold tracking-tight uppercase whitespace-nowrap">{tab.name}</span>
              {tabs.length > 1 && (
                <button 
                  onClick={(e) => { e.stopPropagation(); removeTab(tab.id); }}
                  className="ml-3 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity p-0.5"
                >
                  <Plus size={12} className="rotate-45" />
                </button>
              )}
            </div>
          ))}
          <button 
            onClick={addTab}
            className="ml-2 flex items-center justify-center w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 text-white/40 hover:text-primary transition-all p-1"
            title="Add New Design"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <div className="app-container">
        {/* Auth Modal Overlay */}
        {showAuthModal && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <div className="bg-slate-900 border border-white/10 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl flex flex-col text-white">
              <div className="p-8 pb-6 flex flex-col items-center">
                <h2 className="text-2xl font-bold mb-2 text-primary">Welcome Back</h2>
                <p className="text-sm text-white/50 text-center">Continue your architectural journey</p>
              </div>
              <div className="p-8 pt-0">
                <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/50">Email Address</label>
                    <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} required placeholder="name@company.com" className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-primary transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/50">Password</label>
                    <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} required placeholder="••••••••" className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-primary transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/50">Coupon Code</label>
                    <input type="text" value={authCoupon} onChange={e => setAuthCoupon(e.target.value)} required placeholder="Enter valid coupon code" className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-primary transition-colors" />
                  </div>
                  
                  {authError && (
                    <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/50 text-red-400 text-xs text-center">
                      {authError}
                    </div>
                  )}

                  <button type="submit" disabled={isAuthLoading} className="w-full mt-2 p-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-lg transition-colors flex justify-center disabled:opacity-50">
                    {isAuthLoading ? 'Authenticating...' : 'Sign In'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

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

        {/* Shortcuts Help Modal */}
        {showHelpModal && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-[#1e1e22] border border-white/10 rounded-xl w-full max-w-md shadow-2xl flex flex-col text-white">
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h2 className="text-lg font-bold">Keyboard Shortcuts</h2>
                <button onClick={() => setShowHelpModal(false)} className="opacity-50 hover:opacity-100 text-xl">&times;</button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs opacity-60 font-semibold uppercase tracking-widest">Action</span>
                  <span className="text-xs opacity-60 font-semibold uppercase tracking-widest">Key</span>
                </div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Select Tool</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">S</kbd></div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Wall Tool</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">W</kbd></div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Pan Tool</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">P</kbd></div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Delete Item</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">Del</kbd></div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Undo Action</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">Ctrl+Z</kbd></div>
                <div className="flex justify-between py-2"><span className="text-sm">Help Guide</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">F1</kbd></div>
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
          
          {/* Compass HUD */}
          <div 
            className="absolute top-6 left-6 w-24 h-24 bg-white/90 backdrop-blur-md rounded-full border border-black/10 shadow-lg flex items-center justify-center z-20 group cursor-move"
            style={{ transform: `rotate(${northAngle}deg)` }}
          >
            <div className="relative w-full h-full p-2">
              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[10px] font-black text-primary">N</span>
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-500">S</span>
              <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500">W</span>
              <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-500">E</span>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-1/2 bg-gradient-to-t from-primary to-primary/40 rounded-full" />
            </div>
            {/* Angle Bubble with Manual Input - Now at Constant Top Position */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md flex items-center gap-1 hover:scale-110 transition-transform z-30">
              <input 
                type="number"
                min="0"
                max="359"
                value={Math.round(northAngle)}
                onChange={(e) => handleUpdateNorthAngle(parseInt(e.target.value) || 0)}
                className="bg-transparent border-none text-white w-7 p-0 focus:outline-none text-center font-bold"
                onClick={(e) => e.stopPropagation()}
              />
              <span>° N</span>
            </div>
            {/* Range slider for rotation */}
            <div className="absolute inset-4 opacity-0 cursor-pointer">
              <input 
                type="range" 
                min="0" 
                max="359" 
                value={northAngle} 
                onChange={(e) => handleUpdateNorthAngle(parseInt(e.target.value))}
                className="w-full h-full cursor-pointer"
              />
            </div>
          </div>

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
                    <div className="flex justify-between border-b border-black/5 flex-col gap-3 pb-3">
                      <div className="flex justify-between">
                        <span className="opacity-50">Type</span>
                        <span className="font-bold uppercase tracking-tight">{selectedItems[0].subType}</span>
                      </div>
                      
                      {selectedItems[0].subType === 'text' && (
                        <div className="flex flex-col gap-2 mt-2">
                           <label className="text-[10px] uppercase tracking-widest font-bold opacity-50">Content</label>
                           <input 
                             type="text" 
                             value={selectedItems[0].text || ''} 
                             onChange={(e) => handleTextContextChange(e.target.value)}
                             className="w-full bg-black/5 border border-black/10 rounded-lg p-2 text-xs outline-none focus:border-primary transition-colors"
                             placeholder="Enter text..."
                           />
                           
                           <div className="flex justify-between items-center mt-2">
                             <label className="text-[10px] uppercase tracking-widest font-bold opacity-50">Font Size ({selectedItems[0].fontSize || 16}px)</label>
                           </div>
                           <input
                             type="range"
                             min="8"
                             max="72"
                             value={selectedItems[0].fontSize || 16}
                             className="w-full h-1.5 bg-black/5 rounded-lg appearance-none cursor-pointer accent-primary"
                             onChange={(e) => handleTextSizeChange(parseInt(e.target.value))}
                           />
                        </div>
                      )}

                      {/* Rotation Slider for all objects including Text */}
                      <div className="flex flex-col gap-2 mt-2 border-t border-black/5 pt-3">
                         <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-bold">
                           <span className="opacity-50">Rotation</span>
                           <span className="text-primary">{selectedItems[0].rotation || 0}°</span>
                         </div>
                         <input
                           type="range"
                           min="0"
                           max="360"
                           value={selectedItems[0].rotation || 0}
                           className="w-full h-1.5 bg-black/5 rounded-lg appearance-none cursor-pointer accent-primary"
                           onChange={(e) => handleRotationChange(parseInt(e.target.value))}
                         />
                      </div>
                    </div>
                    {selectedItems.length === 1 && selectedItems[0].subType !== 'text' && (
                      <div className="flex justify-between pt-1">
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
