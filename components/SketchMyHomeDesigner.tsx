'use client';

/**
 * components/SketchMyHomeDesigner.tsx
 * High-performance React wrapper for the Sketch My Home 2D Floor Plan Designer.
 */

import React, { useEffect, useRef, useState } from 'react';
// @ts-ignore
import { CanvasEngine } from '@/lib/sketch-my-home/engine';
import { createClient } from '@/utils/supabase/client';
import { Layout, Hammer, Square, Trash2, Undo, Save, User, LogIn, MousePointer, Hand, DoorOpen, AppWindow, AlignJustify, Bed, Circle, Library, Bath, Droplets, Armchair, Type, Maximize2, Minus, Plus, Maximize, Ruler, Box, LandPlot, CircleOff, Layers, Image, Home } from 'lucide-react';
// @ts-ignore
import { ToolsManager } from '@/lib/sketch-my-home/tools';
import { SketchMyHomeCrypto } from '@/lib/sketch-my-home/crypto';
import { SESSION_3D_SCENE_KEY } from '@/lib/plan3d/sessionScene';
import {
  needsSiteBoundary,
  DEFAULT_PLAN_SCALE_DENOMINATOR,
  MIN_VIEW_SCALE,
  MAX_VIEW_SCALE,
  syncObjectAabbFromPolygonPoints,
  getRoomPoints,
} from '@/lib/sketch-my-home/planBoundary';

const AUTH_LOG_PREFIX = '[SketchMyHome auth]';

const ROOM_TYPE_OPTIONS = [
  { id: 'living_room', label: 'Living room' },
  { id: 'dining_room', label: 'Dining room' },
  { id: 'bedroom', label: 'Bedroom' },
  { id: 'bathroom', label: 'Bathroom' },
  { id: 'kitchen', label: 'Kitchen' },
  { id: 'pooja_room', label: 'Pooja room' },
  { id: 'reading_room', label: 'Reading room' },
  { id: 'office_room', label: 'Office room' },
] as const;

/** Composite onto white so PNG alpha does not leave holes in plan fills. */
function dataUrlToOpaquePng(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new globalThis.Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(dataUrl);
          return;
        }
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUrl;
  });
}

const PLAN_IMAGE_SUBTYPES = ['door', 'window', 'hole', 'frame'] as const;

function authLog(step: string, detail?: Record<string, unknown>) {
  if (detail) {
    console.info(AUTH_LOG_PREFIX, step, detail);
  } else {
    console.info(AUTH_LOG_PREFIX, step);
  }
}

function isValidEmail(email: string): boolean {
  const s = email.trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

/** Temporary fixed demo login — remove or replace when real auth is enforced */
const DEV_LOGIN_EMAIL = 'a@b.com';
const DEV_LOGIN_PASSWORD = 'test';
const DEV_LOGIN_COUPON = 'coupon';

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
  /** Vertical stacking order (0 = ground). */
  floorIndex?: number;
  /** Height of this floor slab in feet (metadata for future 3D). */
  elevationFt?: number;
}

export default function SketchMyHomeDesigner({ initialUser }: { initialUser: AppUser | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const toolsRef = useRef<ToolsManager | null>(null);
  const planImageInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTool, setActiveTool] = useState<string>('boundary');
  const [layoutHint, setLayoutHint] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(initialUser);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUsers, setAdminUsers] = useState<UserRegistryItem[]>([]);
  
  // Auth Form State
  const [showAuthModal, setShowAuthModal] = useState(true); // Always true on landing per request
  const [authEmail, setAuthEmail] = useState(DEV_LOGIN_EMAIL);
  const [authPassword, setAuthPassword] = useState(DEV_LOGIN_PASSWORD);
  const [authCoupon, setAuthCoupon] = useState(DEV_LOGIN_COUPON);
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // Menu Dropdown State
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  // HUD state
  const [showVastu, setShowVastu] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [northAngle, setNorthAngle] = useState(0);

  /** Shown before the Wall tool activates; sets `#wall-height` for new wall segments. */
  const [showWallHeightModal, setShowWallHeightModal] = useState(false);
  const [draftWallHeightFt, setDraftWallHeightFt] = useState(10);

  /** Shown before the Door tool activates; sets `#door-height` for new doors (3D opening height). */
  const [showDoorHeightModal, setShowDoorHeightModal] = useState(false);
  const [draftDoorHeightFt, setDraftDoorHeightFt] = useState(7.5);

  /** Shown before the Window tool activates; sets `#window-height` for new windows (3D opening height). */
  const [showWindowHeightModal, setShowWindowHeightModal] = useState(false);
  const [draftWindowHeightFt, setDraftWindowHeightFt] = useState(5);

  /** Pick room category before drawing the room polygon. */
  const [showRoomTypeModal, setShowRoomTypeModal] = useState(false);

  /** Pulse “Room is ready” after a room outline is closed until the user acts or timeout. */
  const [roomReadyButtonBlink, setRoomReadyButtonBlink] = useState(false);

  // Design Tabs State
  const [tabs, setTabs] = useState<DesignTab[]>([
    { id: 0, name: 'Ground floor', scene: [], floorIndex: 0, elevationFt: 0 },
  ]);
  const [activeTabId, setActiveTabId] = useState<number>(0);
  const tabsRef = useRef<DesignTab[]>([
    { id: 0, name: 'Ground floor', scene: [], floorIndex: 0, elevationFt: 0 },
  ]);
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
      engineRef.current.planScaleDenominator = DEFAULT_PLAN_SCALE_DENOMINATOR;
      toolsRef.current = new ToolsManager(engineRef.current);

      // Sync selection state with React
      engineRef.current.onSelectionChange = (items: any[]) => {
        setSelectedItems([...items]);
      };

      (engineRef.current as any).onRoomOutlineCompleted = () => {
        setRoomReadyButtonBlink(true);
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
            const initialTabs = [{ id: 0, name: 'Ground floor', scene: parsed.scene, floorIndex: 0, elevationFt: 0 }];
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
              if (parsed.settings.planScaleDenominator != null) {
                (engineRef.current as any).planScaleDenominator = parsed.settings.planScaleDenominator;
              }
            }
          }
          
          engineRef.current.render();
        } catch (e) {
          console.error('[AutoSave] Failed to restore design from local storage.', e);
        }
      }

      const engInit = engineRef.current;
      const toolsInit = toolsRef.current;
      if (engInit && toolsInit) {
        if (needsSiteBoundary(engInit.scene)) {
          toolsInit.setTool('boundary');
          setActiveTool('boundary');
        } else {
          toolsInit.setTool('select');
          setActiveTool('select');
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
              northAngle: engine.northAngle || 0,
              planScaleDenominator: (engine as any).planScaleDenominator ?? DEFAULT_PLAN_SCALE_DENOMINATOR,
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
      if (e.key.toLowerCase() === 'm') {
        handleToolClick('measure');
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

  useEffect(() => {
    if (!showWallHeightModal && !showDoorHeightModal && !showWindowHeightModal && !showRoomTypeModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowWallHeightModal(false);
        setShowDoorHeightModal(false);
        setShowWindowHeightModal(false);
        setShowRoomTypeModal(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showWallHeightModal, showDoorHeightModal, showWindowHeightModal, showRoomTypeModal]);

  useEffect(() => {
    if (!roomReadyButtonBlink) return;
    const t = window.setTimeout(() => setRoomReadyButtonBlink(false), 14000);
    return () => clearTimeout(t);
  }, [roomReadyButtonBlink]);

  const confirmRoomType = (roomTypeId: string) => {
    const tools = toolsRef.current;
    const engine = engineRef.current;
    if (!tools || !engine) return;
    if (needsSiteBoundary(engine.scene)) {
      setLayoutHint(
        'Draw the site boundary (lot) first: click each corner, then click near the first corner or press Enter to close. Walls, rooms, openings, and area shapes stay inside the amber outline.'
      );
      setShowRoomTypeModal(false);
      return;
    }
    tools.setPendingRoomType(roomTypeId);
    const ok = tools.setTool('room');
    if (!ok) {
      setLayoutHint(
        'Draw the site boundary (lot) first: click each corner, then click near the first corner or press Enter to close. Walls, rooms, openings, and area shapes stay inside the amber outline.'
      );
      setShowRoomTypeModal(false);
      return;
    }
    setShowRoomTypeModal(false);
    setLayoutHint(null);
    setRoomReadyButtonBlink(false);
    setActiveTool('room');
  };

  const handleRoomReadyBuildWalls = () => {
    setRoomReadyButtonBlink(false);
    const engine = engineRef.current;
    if (!engine) return;

    const selectedRooms = engine.selectedItems.filter((s: any) => s.type === 'room');
    const targets =
      selectedRooms.length > 0 ? selectedRooms : engine.scene.filter((s: any) => s.type === 'room');
    if (targets.length === 0) {
      setLayoutHint('Add at least one room (outline), or select a room, then press Room is ready.');
      return;
    }

    const thicknessInput = document.getElementById('wall-thickness') as HTMLInputElement | null;
    const inchVal = thicknessInput ? parseInt(thicknessInput.value, 10) : 9;
    const thickness = Math.round(inchVal * (engine.gridSize / 12) * 100) / 100;
    const typeInput = document.getElementById('wall-line-type') as HTMLSelectElement | null;
    const lineType = typeInput?.value || 'solid';
    const heightInput = document.getElementById('wall-height') as HTMLInputElement | null;
    let altitudeFt = 10;
    if (heightInput?.value !== '') {
      const v = parseFloat(heightInput?.value ?? '');
      if (Number.isFinite(v) && v > 0) altitudeFt = Math.min(30, Math.max(1, v));
    }

    const targetIds = new Set(targets.map((r: any) => r.id));
    const kept = engine.scene.filter(
      (s: any) => !(s.type === 'wall' && s.sourceRoomId && targetIds.has(s.sourceRoomId))
    );
    const newWalls: any[] = [];
    const MIN_LEN = 3;

    for (const room of targets) {
      const corners = getRoomPoints(room);
      if (!corners || corners.length < 3) continue;
      const n = corners.length;
      for (let i = 0; i < n; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % n];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < MIN_LEN) continue;
        newWalls.push({
          id: `wall-${Math.random().toString(36).substr(2, 9)}`,
          type: 'wall',
          startX: a.x,
          startY: a.y,
          endX: b.x,
          endY: b.y,
          thickness,
          lineType,
          altitude: altitudeFt,
          sourceRoomId: room.id,
        });
      }
    }

    engine.scene = [...kept, ...newWalls];
    engine.buildJointCache();
    engine.render();
    engine.triggerSceneChange();
    setLayoutHint(null);
  };

  const handleToolClick = (toolTarget: string) => {
    if (!toolsRef.current || !engineRef.current) return;

    if (toolTarget === 'wall') {
      if (needsSiteBoundary(engineRef.current.scene)) {
        setLayoutHint(
          'Draw the site boundary (lot) first: click each corner, then click near the first corner or press Enter to close. Walls, rooms, openings, and area shapes stay inside the amber outline.'
        );
        return;
      }
      const hEl = document.getElementById('wall-height') as HTMLInputElement | null;
      const parsed = hEl?.value ? parseFloat(hEl.value) : NaN;
      setDraftWallHeightFt(Number.isFinite(parsed) && parsed > 0 ? Math.min(30, Math.max(1, parsed)) : 10);
      setShowWallHeightModal(true);
      return;
    }

    if (toolTarget === 'door') {
      if (needsSiteBoundary(engineRef.current.scene)) {
        setLayoutHint(
          'Draw the site boundary (lot) first: click each corner, then click near the first corner or press Enter to close. Walls, rooms, openings, and area shapes stay inside the amber outline.'
        );
        return;
      }
      const dEl = document.getElementById('door-height') as HTMLInputElement | null;
      const parsed = dEl?.value ? parseFloat(dEl.value) : NaN;
      setDraftDoorHeightFt(Number.isFinite(parsed) && parsed > 0 ? Math.min(30, Math.max(1, parsed)) : 7.5);
      setShowDoorHeightModal(true);
      return;
    }

    if (toolTarget === 'window') {
      if (needsSiteBoundary(engineRef.current.scene)) {
        setLayoutHint(
          'Draw the site boundary (lot) first: click each corner, then click near the first corner or press Enter to close. Walls, rooms, openings, and area shapes stay inside the amber outline.'
        );
        return;
      }
      const wEl = document.getElementById('window-height') as HTMLInputElement | null;
      const parsed = wEl?.value ? parseFloat(wEl.value) : NaN;
      setDraftWindowHeightFt(Number.isFinite(parsed) && parsed > 0 ? Math.min(30, Math.max(1, parsed)) : 5);
      setShowWindowHeightModal(true);
      return;
    }

    if (toolTarget === 'room') {
      if (needsSiteBoundary(engineRef.current.scene)) {
        setLayoutHint(
          'Draw the site boundary (lot) first: click each corner, then click near the first corner or press Enter to close. Walls, rooms, openings, and area shapes stay inside the amber outline.'
        );
        return;
      }
      setShowRoomTypeModal(true);
      return;
    }

    const ok = toolsRef.current.setTool(toolTarget);
    if (!ok) {
      setLayoutHint(
        'Draw the site boundary (lot) first: click each corner, then click near the first corner or press Enter to close. Walls, rooms, openings, and area shapes stay inside the amber outline.'
      );
      return;
    }
    setLayoutHint(null);
    setActiveTool(toolTarget);
  };

  const handleWallHeightConfirm = () => {
    const ft = Math.min(30, Math.max(1, draftWallHeightFt));
    const hEl = document.getElementById('wall-height') as HTMLInputElement | null;
    if (hEl) hEl.value = String(ft);
    if (!toolsRef.current) return;
    toolsRef.current.setTool('wall');
    setActiveTool('wall');
    setLayoutHint(null);
    setShowWallHeightModal(false);
  };

  const handleWallHeightCancel = () => {
    setShowWallHeightModal(false);
  };

  const handleDoorHeightConfirm = () => {
    const ft = Math.min(30, Math.max(1, draftDoorHeightFt));
    const dEl = document.getElementById('door-height') as HTMLInputElement | null;
    if (dEl) dEl.value = String(ft);
    if (!toolsRef.current) return;
    toolsRef.current.setTool('door');
    setActiveTool('door');
    setLayoutHint(null);
    setShowDoorHeightModal(false);
  };

  const handleDoorHeightCancel = () => {
    setShowDoorHeightModal(false);
  };

  const handleWindowHeightConfirm = () => {
    const ft = Math.min(30, Math.max(1, draftWindowHeightFt));
    const wEl = document.getElementById('window-height') as HTMLInputElement | null;
    if (wEl) wEl.value = String(ft);
    if (!toolsRef.current) return;
    toolsRef.current.setTool('window');
    setActiveTool('window');
    setLayoutHint(null);
    setShowWindowHeightModal(false);
  };

  const handleWindowHeightCancel = () => {
    setShowWindowHeightModal(false);
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
        northAngle: engine.northAngle || 0,
        planScaleDenominator: (engine as any).planScaleDenominator ?? DEFAULT_PLAN_SCALE_DENOMINATOR,
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

  const handlePlanImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const engine = engineRef.current;
    if (!engine) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = reader.result as string;
      try {
        const opaque = await dataUrlToOpaquePng(raw);
        engine.selectedItems.forEach((item: any) => {
          if (item.type === 'object' && PLAN_IMAGE_SUBTYPES.includes(item.subType)) {
            item.imageDataUrl = opaque;
          }
        });
        engine.render();
        engine.triggerSceneChange();
        setSelectedItems([...engine.selectedItems]);
      } catch {
        /* ignore */
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleClearPlanImage = () => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.selectedItems.forEach((item: any) => {
      if (item.type === 'object' && PLAN_IMAGE_SUBTYPES.includes(item.subType)) {
        delete item.imageDataUrl;
      }
    });
    engine.render();
    engine.triggerSceneChange();
    setSelectedItems([...engine.selectedItems]);
  };

  const handleStaircaseWidthFtChange = (valFt: number) => {
    const engine = engineRef.current;
    if (!engine || !Number.isFinite(valFt)) return;
    const ft = Math.min(20, Math.max(0.5, valFt));
    const targetWpx = ft * engine.gridSize;
    engine.selectedItems.forEach((item: any) => {
      if (item.type === 'object' && item.subType === 'staircase') {
        item.widthFt = ft;
        if (item.points && item.points.length >= 3) {
          const cx = item.x + item.width / 2;
          const cy = item.y + item.height / 2;
          const ref = Math.max(item.width, 1e-6);
          const scale = targetWpx / ref;
          for (const p of item.points) {
            p.x = cx + (p.x - cx) * scale;
            p.y = cy + (p.y - cy) * scale;
          }
          syncObjectAabbFromPolygonPoints(item);
        } else {
          item.width = Math.round(targetWpx * 100) / 100;
        }
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
      setTabs([{ id: 0, name: 'Ground floor', scene: [], floorIndex: 0, elevationFt: 0 }]);
      setActiveTabId(0);
      setSelectedItems([]);
      setActiveMenu(null);
      setLayoutHint(null);
      toolsRef.current?.setTool('boundary');
      setActiveTool('boundary');
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
      setLayoutHint(null);
      if (needsSiteBoundary(engine.scene)) {
        toolsRef.current?.setTool('boundary');
        setActiveTool('boundary');
      } else {
        toolsRef.current?.setTool('select');
        setActiveTool('select');
      }
    }
    setActiveMenu(null);
  };

  const addTab = () => {
    const newId = tabs.length > 0 ? Math.max(...tabs.map(t => t.id)) + 1 : 0;
    const floorIdx = tabs.length;
    const newTab: DesignTab = {
      id: newId,
      name: `Floor ${floorIdx}`,
      scene: [],
      floorIndex: floorIdx,
      elevationFt: floorIdx * 10,
    };
    
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
      setLayoutHint(null);
      toolsRef.current?.setTool('boundary');
      setActiveTool('boundary');
    }
  };

  const removeTab = (tabId: number) => {
    if (tabs.length <= 1) return;
    if (!confirm('Delete this floor? Its layout will be removed.')) return;

    const updatedTabs = tabs.filter(t => t.id !== tabId);
    if (tabId === activeTabId) {
      const newActive = updatedTabs[0];
      setActiveTabId(newActive.id);
      if (engineRef.current) {
        engineRef.current.scene = newActive.scene;
        engineRef.current.undoStack = [];
        engineRef.current.render();
        setLayoutHint(null);
        if (needsSiteBoundary(engineRef.current.scene)) {
          toolsRef.current?.setTool('boundary');
          setActiveTool('boundary');
        } else {
          toolsRef.current?.setTool('select');
          setActiveTool('select');
        }
      }
    }
    setTabs(updatedTabs);
  };

  const renameTab = (tabId: number) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    const newName = prompt('Floor name:', tab.name);
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
            if (data.settings.planScaleDenominator != null) {
              (engine as any).planScaleDenominator = data.settings.planScaleDenominator;
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
        setLayoutHint(null);
        if (needsSiteBoundary(engine.scene)) {
          toolsRef.current?.setTool('boundary');
          setActiveTool('boundary');
        } else {
          toolsRef.current?.setTool('select');
          setActiveTool('select');
        }
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

    authLog('submit started', {
      emailLen: authEmail.length,
      passwordLen: authPassword.length,
      couponLen: authCoupon.length,
      emailLooksLikeDev: authEmail.trim() === DEV_LOGIN_EMAIL,
      passwordMatchesDev: authPassword === DEV_LOGIN_PASSWORD,
      couponMatchesDev: authCoupon.trim() === DEV_LOGIN_COUPON,
    });

    try {
      const email = authEmail.trim();
      const emailOk = isValidEmail(email);
      authLog('email validation', { email, emailOk, regexTest: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) });

      if (!emailOk) {
        authLog('blocked: invalid email format');
        setAuthError('Enter a valid email address.');
        setIsAuthLoading(false);
        return;
      }

      // 0. Fixed demo credentials (always succeeds, no Supabase)
      const devEmailMatch = email === DEV_LOGIN_EMAIL;
      const devPasswordMatch = authPassword === DEV_LOGIN_PASSWORD;
      const devCouponMatch = authCoupon.trim() === DEV_LOGIN_COUPON;
      authLog('dev credential check', {
        devEmailMatch,
        devPasswordMatch,
        devCouponMatch,
        expected: { email: DEV_LOGIN_EMAIL, passwordLen: DEV_LOGIN_PASSWORD.length, coupon: DEV_LOGIN_COUPON },
      });

      if (devEmailMatch && devPasswordMatch && devCouponMatch) {
        authLog('success: dev_session (fixed demo credentials)');
        setUser({
          id: 'dev_session',
          email: DEV_LOGIN_EMAIL,
          role: 'user',
        });
        setShowAuthModal(false);
        setIsAuthLoading(false);
        return;
      }

      // 1. Mock admin (optional password gate for admin role)
      if (email === 'admin@roomio.pro' && authPassword === 'adminpassword') {
        authLog('success: mock admin');
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

      // 2. Supabase when password present — catch throws so mock fallback still works
      if (authPassword.length > 0) {
        authLog('calling supabase.signInWithPassword', { email });
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password: authPassword
          });

          if (error) {
            authLog('supabase returned error (will try local mock next)', {
              message: error.message,
              name: error.name,
              status: (error as { status?: number }).status,
            });
          } else if (data.user) {
            authLog('success: supabase session', { userId: data.user.id });
            const newUser: AppUser = {
              id: data.user.id,
              email: data.user.email ?? email,
              role: data.user.email?.includes('admin') ? 'admin' : 'user'
            };
            setUser(newUser);
            setShowAuthModal(false);
            setIsAuthLoading(false);
            return;
          } else {
            authLog('supabase: no user in response', { hasSession: !!data.session });
          }
        } catch (supaErr: unknown) {
          authLog('supabase threw (continuing to local mock)', {
            message: supaErr instanceof Error ? supaErr.message : String(supaErr),
          });
        }
      } else {
        authLog('skipping supabase (empty password)');
      }

      // 3. Local session: valid email is enough (password / coupon optional for now)
      authLog('success: local mock user (fallback)');
      const mockUser: AppUser = {
        id: 'mock_' + Math.random().toString(36).substr(2, 9),
        email,
        role: 'user'
      };
      setUser(mockUser);
      setShowAuthModal(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      authLog('unexpected error in handleLoginSubmit', { message: msg, err });
      setAuthError(msg || 'Authentication failed.');
    } finally {
      setIsAuthLoading(false);
      authLog('submit finished (loading cleared in finally)');
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

  const handleOpen3DPreview = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const currentTabs = [...tabs];
    const activeIdx = currentTabs.findIndex((t) => t.id === activeTabId);
    if (activeIdx !== -1) {
      currentTabs[activeIdx] = { ...currentTabs[activeIdx], scene: [...engine.scene] };
    }
    const scene = activeIdx !== -1 ? currentTabs[activeIdx].scene : [...engine.scene];
    const gridPxPerFoot = (engine as { gridSize?: number }).gridSize ?? 25;
    const payload = JSON.stringify({ scene, gridPxPerFoot });
    // localStorage is shared across tabs on the same origin; sessionStorage is not, so new-tab 3D preview would miss the scene otherwise.
    try {
      localStorage.setItem(SESSION_3D_SCENE_KEY, payload);
      sessionStorage.setItem(SESSION_3D_SCENE_KEY, payload);
    } catch {
      /* quota / private mode */
    }
    setActiveMenu(null);
    const url = `${window.location.origin}/preview-3d`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="main-wrapper bg-slate-950 font-sans selection:bg-primary/30">
      {/* Read by lib/sketch-my-home/tools.js when drawing walls (legacy DOM ids). */}
      <div className="sr-only" aria-hidden="true">
        <label htmlFor="wall-height">Wall height ft</label>
        <input id="wall-height" type="number" min={1} max={30} step={0.5} defaultValue={10} />
        <label htmlFor="wall-thickness">Wall thickness in</label>
        <input id="wall-thickness" type="range" min={4} max={24} defaultValue={9} />
        <label htmlFor="wall-line-type">Wall line type</label>
        <select id="wall-line-type" defaultValue="solid">
          <option value="solid">solid</option>
          <option value="dotted">dotted</option>
        </select>
        <label htmlFor="door-height">Door opening height ft</label>
        <input id="door-height" type="number" min={1} max={30} step={0.5} defaultValue={7.5} />
        <label htmlFor="window-height">Window opening height ft</label>
        <input id="window-height" type="number" min={1} max={30} step={0.5} defaultValue={5} />
      </div>

      {showWindowHeightModal && (
        <div
          className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="window-height-dialog-title"
          onClick={handleWindowHeightCancel}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1e1e22] p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="window-height-dialog-title" className="text-lg font-semibold tracking-tight">
              Window height
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Set the opening height for new windows (default 5 ft). Used in the 3D preview for the window volume and wall dimensions.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="window-height-modal-input" className="text-xs uppercase tracking-widest text-white/50">
                Feet
              </label>
              <input
                id="window-height-modal-input"
                type="number"
                min={1}
                max={30}
                step={0.5}
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
                value={draftWindowHeightFt}
                onChange={(e) => setDraftWindowHeightFt(parseFloat(e.target.value) || 5)}
              />
              <span className="text-sm text-white/40">ft</span>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-white/70 hover:bg-white/10"
                onClick={handleWindowHeightCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                onClick={handleWindowHeightConfirm}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showDoorHeightModal && (
        <div
          className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="door-height-dialog-title"
          onClick={handleDoorHeightCancel}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1e1e22] p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="door-height-dialog-title" className="text-lg font-semibold tracking-tight">
              Door height
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Set the opening height for new doors (default 7.5 ft). Used in the 3D preview for the door volume and labels.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="door-height-modal-input" className="text-xs uppercase tracking-widest text-white/50">
                Feet
              </label>
              <input
                id="door-height-modal-input"
                type="number"
                min={1}
                max={30}
                step={0.5}
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
                value={draftDoorHeightFt}
                onChange={(e) => setDraftDoorHeightFt(parseFloat(e.target.value) || 7.5)}
              />
              <span className="text-sm text-white/40">ft</span>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-white/70 hover:bg-white/10"
                onClick={handleDoorHeightCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                onClick={handleDoorHeightConfirm}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {showRoomTypeModal && (
        <div
          className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="room-type-dialog-title"
          onClick={() => setShowRoomTypeModal(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-white/10 bg-[#1e1e22] p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="room-type-dialog-title" className="text-lg font-semibold tracking-tight">
              Room type
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Choose how this space is used. Then click corners inside the site boundary to outline the room (like the lot boundary); click near the first corner or press Enter to finish. Drag vertices to adjust. When the outline looks right, press <span className="font-medium text-white/90">Room is ready</span> next to 3D view to generate walls along the outline.
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROOM_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-left text-sm font-medium text-white/90 hover:bg-primary/25 hover:border-primary/40 transition-colors"
                  onClick={() => confirmRoomType(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-white/70 hover:bg-white/10"
                onClick={() => setShowRoomTypeModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showWallHeightModal && (
        <div
          className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wall-height-dialog-title"
          onClick={handleWallHeightCancel}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-white/10 bg-[#1e1e22] p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="wall-height-dialog-title" className="text-lg font-semibold tracking-tight">
              Wall height
            </h2>
            <p className="mt-2 text-sm text-white/60">
              Set the height for new wall segments (default 10 ft). You can change individual walls later in the properties panel.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <label htmlFor="wall-height-modal-input" className="text-xs uppercase tracking-widest text-white/50">
                Feet
              </label>
              <input
                id="wall-height-modal-input"
                type="number"
                min={1}
                max={30}
                step={0.5}
                className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-primary"
                value={draftWallHeightFt}
                onChange={(e) => setDraftWallHeightFt(parseFloat(e.target.value) || 10)}
              />
              <span className="text-sm text-white/40">ft</span>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-4 py-2 text-sm text-white/70 hover:bg-white/10"
                onClick={handleWallHeightCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                onClick={handleWallHeightConfirm}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

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
                <div
                  className="px-4 py-2 hover:bg-primary/20 cursor-pointer text-xs flex items-center gap-2 text-white/90 hover:text-white"
                  onClick={handleOpen3DPreview}
                >
                  <Box size={14} className="opacity-70" />
                  3D preview (walls)
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

        <div className="flex items-center gap-2 px-3 flex-wrap justify-end">
          <button
            type="button"
            onClick={handleRoomReadyBuildWalls}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-[box-shadow,background-color,border-color] duration-300 ${
              roomReadyButtonBlink
                ? 'animate-pulse border-emerald-200 bg-emerald-400/35 text-white shadow-[0_0_20px_rgba(52,211,153,0.55)] ring-2 ring-emerald-300/95 hover:bg-emerald-400/45'
                : 'border-emerald-400/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25'
            }`}
            title="Create wall segments along each selected room outline (or all rooms if none selected). After you close a room outline, this button pulses until you click it."
          >
            <Home size={14} className="opacity-90" />
            Room is ready
          </button>
          <button
            type="button"
            onClick={handleOpen3DPreview}
            className="flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/90 hover:bg-white/10"
            title="Open 3D preview in a new tab"
          >
            <Box size={14} className="opacity-80" />
            3D view
          </button>
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
      <div className="design-tabs-bar bg-slate-900 border-b border-white/5 flex items-center px-4 overflow-x-auto min-h-[40px] z-10 scrollbar-hide gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/35 shrink-0">Floors</span>
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
            title="Add floor (new level)"
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
                <form noValidate onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/50">Email Address</label>
                    <input
                      type="text"
                      inputMode="email"
                      autoComplete="email"
                      value={authEmail}
                      onChange={e => setAuthEmail(e.target.value)}
                      required
                      placeholder="name@company.com"
                      className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/50">Password <span className="text-white/35 font-normal">(optional)</span></label>
                    <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)} placeholder="Leave blank for quick sign-in" className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-primary transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-white/50">Coupon code <span className="text-white/35 font-normal">(optional)</span></label>
                    <input type="text" value={authCoupon} onChange={e => setAuthCoupon(e.target.value)} placeholder="Optional" className="w-full p-3 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:border-primary transition-colors" />
                  </div>
                  <p className="text-[10px] text-white/35 -mt-2">
                    Demo login is pre-filled (a@b.com / test / coupon). Other valid emails still get a local session if Supabase sign-in does not apply.
                  </p>
                  
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
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Site boundary</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">L</kbd></div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Wall Tool</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">W</kbd></div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Pan Tool</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">P</kbd></div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Length Tool</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">M</kbd></div>
                <div className="flex justify-between py-2 border-b border-white/5"><span className="text-sm">Area Tool</span><kbd className="bg-white/10 px-2 rounded font-mono text-xs">A</kbd></div>
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
          {layoutHint && (
            <div className="mx-3 mb-3 rounded-lg border border-amber-300/80 bg-amber-50 text-amber-950 text-[11px] p-2.5 leading-snug">
              {layoutHint}
            </div>
          )}
          <div className="tools-group h-full overflow-y-auto no-scrollbar pb-24">
            <h3 className="text-xs uppercase text-black/50 mb-2 px-2 tracking-widest font-bold">Tools</h3>
            <button type="button" data-tool="select" className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => handleToolClick('select')}>
              <MousePointer size={20} /> <span>Select</span>
            </button>
            <button type="button" data-tool="pan" className={`tool-btn ${activeTool === 'pan' ? 'active' : ''}`} onClick={() => handleToolClick('pan')}>
              <Hand size={20} /> <span>Pan</span>
            </button>
            <h3 className="text-[10px] uppercase text-amber-700/80 mb-1 mt-3 px-2 tracking-widest font-bold">Site (first)</h3>
            <button type="button" data-tool="boundary" className={`tool-btn border border-amber-200/80 ${activeTool === 'boundary' ? 'active' : ''}`} onClick={() => handleToolClick('boundary')} title="Site boundary (L)">
              <LandPlot size={20} className="text-amber-700" /> <span>Boundary</span>
            </button>
            <button type="button" data-tool="wall" className={`tool-btn ${activeTool === 'wall' ? 'active' : ''}`} onClick={() => handleToolClick('wall')}>
              <Hammer size={20} /> <span>Wall</span>
            </button>
            <button type="button" data-tool="room" className={`tool-btn ${activeTool === 'room' ? 'active' : ''}`} onClick={() => handleToolClick('room')}>
              <Layout size={20} /> <span>Room</span>
            </button>
            <div className="flex gap-2 w-full">
              <button type="button" data-tool="measure" className={`tool-btn flex-1 ${activeTool === 'measure' ? 'active' : ''}`} onClick={() => handleToolClick('measure')} title="Length Measurement (M)">
                <Ruler size={20} /> <span className="text-[10px]">Length</span>
              </button>
              <button type="button" data-tool="measure_area" className={`tool-btn flex-1 ${activeTool === 'measure_area' ? 'active' : ''}`} onClick={() => handleToolClick('measure_area')} title="Area Measurement (A)">
                <Maximize2 size={20} /> <span className="text-[10px]">Area</span>
              </button>
            </div>

            <h3 className="text-xs uppercase text-black/50 mt-4 mb-2 px-2 tracking-widest font-bold border-t border-black/10 pt-4">Elements</h3>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" data-tool="door" className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'door' ? 'active' : ''}`} onClick={() => handleToolClick('door')}>
                <DoorOpen size={16} /> <span className="text-[9px]">Door</span>
              </button>
              <button type="button" data-tool="window" className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'window' ? 'active' : ''}`} onClick={() => handleToolClick('window')}>
                <AppWindow size={16} /> <span className="text-[9px]">Window</span>
              </button>
              <button type="button" data-tool="hole" className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'hole' ? 'active' : ''}`} onClick={() => handleToolClick('hole')}>
                <CircleOff size={16} /> <span className="text-[9px]">Opening</span>
              </button>
              <button type="button" data-tool="stairs" className={`tool-btn !min-h-[60px] !h-auto ${activeTool === 'stairs' ? 'active' : ''}`} onClick={() => handleToolClick('stairs')}>
                <AlignJustify size={16} /> <span className="text-[9px]">Stairs</span>
              </button>
              <button type="button" data-tool="staircase" className={`tool-btn !min-h-[60px] !h-auto col-span-2 ${activeTool === 'staircase' ? 'active' : ''}`} onClick={() => handleToolClick('staircase')} title="Up to 4 corners (triangle or quad). Click each corner, then click near the first point or press Enter to finish; drag vertices to adjust.">
                <Layers size={16} /> <span className="text-[9px]">Staircase</span>
              </button>
              <button
                type="button"
                data-tool="frame"
                className={`tool-btn !min-h-[60px] !h-auto col-span-2 border border-violet-200/90 ${activeTool === 'frame' ? 'active' : ''}`}
                onClick={() => handleToolClick('frame')}
                title="Draw a purple wall frame (polygon). Add a photo in the properties panel; drag corners to resize like the site boundary."
              >
                <Image size={16} className="text-violet-700" /> <span className="text-[9px]">Wall frame</span>
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
                        <span className="font-mono text-blue-500 font-bold">{selectedItems[0].altitude ?? 10}ft</span>
                        <span className="opacity-40 tracking-tighter">1ft — 30ft</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="30"
                        step="0.5"
                        value={selectedItems[0].altitude ?? 10}
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
                      
                      {selectedItems.length === 1 &&
                        selectedItems[0].type === 'object' &&
                        PLAN_IMAGE_SUBTYPES.includes(selectedItems[0].subType) && (
                          <div className="flex flex-col gap-2 mt-2 border-t border-black/5 pt-3">
                            <label className="text-[10px] uppercase tracking-widest font-bold opacity-50">
                              Plan image (opaque)
                            </label>
                            <p className="text-[10px] text-black/45 leading-snug">
                              Resize the element on canvas to fit; transparent areas are filled with white.
                            </p>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                type="button"
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-50 text-violet-800 border border-violet-200 hover:bg-violet-100"
                                onClick={() => planImageInputRef.current?.click()}
                              >
                                Choose image…
                              </button>
                              {selectedItems[0].imageDataUrl && (
                                <button
                                  type="button"
                                  className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-black/5 text-black/70 border border-black/10 hover:bg-black/10"
                                  onClick={handleClearPlanImage}
                                >
                                  Remove image
                                </button>
                              )}
                            </div>
                            <input
                              ref={planImageInputRef}
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={handlePlanImageFile}
                            />
                          </div>
                        )}

                      {selectedItems[0].subType === 'staircase' && (
                        <div className="flex flex-col gap-2 mt-2 border-t border-black/5 pt-3">
                          <label className="text-[10px] uppercase tracking-widest font-bold opacity-50">Width (ft)</label>
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-mono text-rose-700 font-bold">
                              {(selectedItems[0].widthFt != null && Number.isFinite(selectedItems[0].widthFt)
                                ? selectedItems[0].widthFt
                                : selectedItems[0].width / (engineRef.current?.gridSize ?? 25)
                              ).toFixed(1)} ft
                            </span>
                            <span className="opacity-40 tracking-tighter">0.5–20 ft</span>
                          </div>
                          <input
                            type="range"
                            min={0.5}
                            max={20}
                            step={0.5}
                            value={
                              selectedItems[0].widthFt != null && Number.isFinite(selectedItems[0].widthFt)
                                ? selectedItems[0].widthFt
                                : Math.round((selectedItems[0].width / (engineRef.current?.gridSize ?? 25)) * 10) / 10
                            }
                            className="w-full h-1.5 bg-black/5 rounded-lg appearance-none cursor-pointer accent-rose-500"
                            onChange={(e) => handleStaircaseWidthFtChange(parseFloat(e.target.value))}
                          />
                        </div>
                      )}

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

                      {/* Rotation — hidden for polygon staircase / wall frame (footprint is edited by vertices) */}
                      {!(
                        selectedItems[0].type === 'object' &&
                        ['staircase', 'frame'].includes(selectedItems[0].subType) &&
                        Array.isArray(selectedItems[0].points) &&
                        selectedItems[0].points.length >= 3
                      ) && (
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
                      )}
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

          <div className="absolute bottom-6 right-6 flex flex-col items-end gap-1 z-10">
            <div className="flex items-center gap-1 bg-white/90 p-1.5 rounded-lg border border-black/10 backdrop-blur-sm">
              <button
                type="button"
                className="p-2 hover:bg-black/10 rounded text-black/70 hover:text-black transition-colors"
                onClick={() => {
                  const eng = engineRef.current;
                  if (!eng) return;
                  const next = Math.max(eng.minViewScale, eng.scale - 0.1);
                  eng.zoomAtCanvasCenter(next);
                }}
                title="Zoom out (down to 5%)"
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                className="p-2 hover:bg-black/10 rounded text-black/70 hover:text-black transition-colors text-xs font-bold w-12 text-center"
                onClick={() => {
                  const eng = engineRef.current;
                  if (!eng) return;
                  eng.setZoom(1);
                }}
                title="Reset zoom"
              >
                100%
              </button>
              <button
                type="button"
                className="p-2 hover:bg-black/10 rounded text-black/70 hover:text-black transition-colors"
                onClick={() => {
                  const eng = engineRef.current;
                  if (!eng) return;
                  const next = Math.min(eng.maxViewScale, eng.scale + 0.1);
                  eng.zoomAtCanvasCenter(next);
                }}
                title="Zoom in (up to 5000%)"
              >
                <Plus size={16} />
              </button>
            </div>
            <div className="text-[9px] text-black/45 text-right max-w-[200px] leading-tight px-1">
              Drawing scale 1:{DEFAULT_PLAN_SCALE_DENOMINATOR} · zoom {Math.round(MIN_VIEW_SCALE * 100)}%–{Math.round(MAX_VIEW_SCALE * 100)}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
