'use client';

/**
 * components/SketchMyHomeDesigner.tsx
 * High-performance React wrapper for the Sketch My Home 2D Floor Plan Designer.
 */

import React, { useEffect, useRef, useState } from 'react';
import { CanvasEngine } from '@/lib/sketch-my-home/engine';
import { createClient } from '@/utils/supabase/client';
import { Layout, Hammer, Square, Trash2, Undo, Save, User, LogIn } from 'lucide-react';

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
  const [user, setUser] = useState<AppUser | null>(initialUser);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminUsers, setAdminUsers] = useState<UserRegistryItem[]>([]);
  const supabase = createClient();

  useEffect(() => {
    if (canvasRef.current && !engineRef.current) {
      engineRef.current = new CanvasEngine(canvasRef.current);
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

  const fetchAdminData = async (): Promise<void> => {
     try {
       const res = await fetch('/api/admin/manage-users');
       const data: UserRegistryItem[] = await res.json();
       setAdminUsers(data);
     } catch (e) { console.error(e); }
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
             <div className="bg-[#1e1e22] border border-white/10 rounded-xl w-full max-w-4xl max-h-[80vh] overflow-hidden shadow-2xl flex flex-col">
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <User size={20} className="text-primary" /> Admin Space Management
                  </h2>
                  <button onClick={() => setShowAdminModal(false)} className="opacity-50 hover:opacity-100 text-2xl">&times;</button>
                </div>
                <div className="flex-1 overflow-y-auto p-6">
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                      <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                        <span className="text-[10px] uppercase tracking-widest opacity-50">Total Users</span>
                        <div className="text-2xl font-bold text-primary">{adminUsers.length || '--'}</div>
                      </div>
                      <div className="bg-white/5 p-4 rounded-lg border border-white/10">
                        <span className="text-[10px] uppercase tracking-widest opacity-50">System Status</span>
                        <div className="text-2xl font-bold text-blue-400">Stable</div>
                      </div>
                   </div>

                   <table className="w-full text-left">
                      <thead className="text-[10px] uppercase tracking-widest opacity-50 border-b border-white/10">
                        <tr>
                          <th className="pb-4">User Email</th>
                          <th className="pb-4">Role</th>
                          <th className="pb-4">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {adminUsers.map((u) => (
                           <tr key={u.email} className="border-b border-white/5">
                              <td className="py-4">{u.email}</td>
                              <td className="py-4 font-bold text-primary">{u.role}</td>
                              <td className="py-4">
                                 <button className="text-xs bg-white/5 px-2 py-1 rounded">Update</button>
                              </td>
                           </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
                <div className="p-4 border-t border-white/10 flex justify-end">
                   <button onClick={() => setShowAdminModal(false)} className="px-4 py-2 bg-white/5 rounded text-sm">Close Panel</button>
                </div>
             </div>
          </div>
        )}
        <div className="toolbar">
          <div className="brand">
            <h1>sketch my home</h1>
          </div>
          <div className="tools-group">
            <button className="tool-btn active"><Layout size={20} /> <span>Room</span></button>
            <button className="tool-btn"><Hammer size={20} /> <span>Wall</span></button>
            <button className="tool-btn"><Square size={20} /> <span>Object</span></button>
          </div>
          <div className="tools-group bottom">
            <button className="action-btn primary"><Save size={18} /> <span>Save</span></button>
          </div>
        </div>
        <div className="canvas-container">
           <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
}
