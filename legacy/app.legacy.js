document.addEventListener('DOMContentLoaded', () => {
    const canvasEl = document.getElementById('design-canvas');
    const engine = new CanvasEngine(canvasEl);
    const toolsManager = new ToolsManager(engine);
    const projectNameInput = document.getElementById('project-name');

    // ==================== CLOUD SYNC & AUTH ====================
    const authBtn = document.getElementById('menu-auth-btn');
    const authBtnText = document.getElementById('auth-btn-text');
    const cloudProjectsBtn = document.getElementById('menu-cloud-projects');

    const syncStatusEl = document.getElementById('sync-status');
    const adminPanelBtn = document.getElementById('menu-admin-panel');
    const adminModal = document.getElementById('modal-admin');
    const adminUserList = document.getElementById('admin-user-list');

    function updateAuthUI(user) {
        if (user) {
            authBtnText.innerText = `Sign Out (${user.email})`;
            cloudProjectsBtn.style.opacity = '1';
            cloudProjectsBtn.style.pointerEvents = 'all';
            if (syncStatusEl) syncStatusEl.innerText = 'Connected';
            
            // Show/Hide Admin Panel based on role
            if (adminPanelBtn) {
                if (user.role === 'admin') {
                    adminPanelBtn.style.display = 'flex';
                } else {
                    adminPanelBtn.style.display = 'none';
                }
            }
        } else {
            authBtnText.innerText = 'Sign In';
            cloudProjectsBtn.style.opacity = '0.5';
            cloudProjectsBtn.style.pointerEvents = 'none';
            if (syncStatusEl) syncStatusEl.innerText = 'Local Mode';
            if (adminPanelBtn) adminPanelBtn.style.display = 'none';
        }
    }

    if (authBtn) {
        authBtn.addEventListener('click', async () => {
            if (RoomioAuth.isAuthenticated()) {
                await RoomioAuth.signOut();
            } else {
                await RoomioAuth.signIn();
            }
        });
    }

    if (cloudProjectsBtn) {
        cloudProjectsBtn.addEventListener('click', async () => {
            if (!RoomioAuth.isAuthenticated()) return;
            const projects = await RoomioApi.fetchProjects();
            if (projects.length === 0) {
                alert("No projects found in the cloud.");
                return;
            }
            const names = projects.map((p, i) => `${i + 1}. ${p.projectName} (Last updated: ${new Date(p.updatedAt).toLocaleString()})`).join("\n");
            const choice = prompt(`Select a project to load (1-${projects.length}):\n\n${names}`);
            const idx = parseInt(choice) - 1;
            if (projects[idx]) {
                loadProjectFromJSON(projects[idx]);
            }
        });
    }

    const cloudSyncBtn = document.getElementById('menu-cloud-sync');
    if (cloudSyncBtn) {
        cloudSyncBtn.addEventListener('click', async () => {
            if (!RoomioAuth.isAuthenticated()) {
                alert("Please Sign In to sync your project to the cloud.");
                return;
            }
            await syncToCloud();
            alert("Project synced to cloud successfully!");
        });
    }

    RoomioAuth.onAuthStateChange = (user) => {
        updateAuthUI(user);
    };
    updateAuthUI(RoomioAuth.user);

    // ==================== ADMIN PANEL LOGIC ====================
    if (adminPanelBtn && adminModal) {
        adminPanelBtn.addEventListener('click', async () => {
            if (RoomioAuth.user?.role !== 'admin') return;
            adminModal.classList.remove('hidden');
            document.getElementById('modal-backdrop').classList.remove('hidden');
            
            // Fetch users from our new admin API
            try {
                const res = await fetch('/api/admin/manage-users');
                if (!res.ok) throw new Error('Failed to fetch user list');
                const users = await res.json();
                renderAdminUserList(users);
                
                // Update stats
                document.getElementById('admin-total-users').innerText = users.length;
                document.getElementById('admin-total-designs').innerText = users.reduce((acc, u) => acc + (u.projectsCount || 0), 0);
            } catch (err) {
                console.error("Admin error:", err);
                alert("Failed to load user management data.");
            }
        });
    }

    function renderAdminUserList(users) {
        if (!adminUserList) return;
        adminUserList.innerHTML = '';
        
        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding:12px; border-bottom:1px solid var(--border-light);">${user.email}</td>
                <td style="padding:12px; border-bottom:1px solid var(--border-light); font-weight:700; color:var(--primary);">${user.role || 'user'}</td>
                <td style="padding:12px; border-bottom:1px solid var(--border-light);">${user.status || 'active'}</td>
                <td style="padding:12px; border-bottom:1px solid var(--border-light);">
                    <button class="action-btn-sm edit-role-btn" data-email="${user.email}" data-role="${user.role || 'user'}" style="padding:4px 8px; font-size:11px; cursor:pointer;">Update Role</button>
                </td>
            `;
            const editBtn = tr.querySelector('.edit-role-btn');
            editBtn.addEventListener('click', async () => {
                const newRole = prompt(`Update role for ${user.email} (current: ${user.role || 'user'}):`, user.role || 'user');
                if (newRole && newRole !== user.role) {
                    try {
                        const res = await fetch('/api/admin/manage-users', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ email: user.email, role: newRole, status: user.status || 'active' })
                        });
                        if (res.ok) {
                            alert("User role updated successfully.");
                            adminPanelBtn.click(); // Refresh list
                        } else {
                            throw new Error("Failed to update role");
                        }
                    } catch (err) {
                        alert("Error updating user: " + err.message);
                    }
                }
            });
            adminUserList.appendChild(tr);
        });
    }

    async function syncToCloud() {
        if (!RoomioAuth.isAuthenticated()) return;
        if (syncStatusEl) syncStatusEl.innerText = 'Syncing...';
        saveCurrentTab();
        const designs = [];
        for (const [id, data] of tabs) {
            designs.push({ id, name: data.name, scene: data.scene });
        }
        const project = {
            projectName: getProjectName(),
            version: CURRENT_VERSION,
            settings: {
                theme: document.body.classList.contains('theme-light') ? 'light' : 'dark',
                bgColor: engine.bgColor,
                northAngle: engine.northAngle,
                showGrid: engine.showGrid,
                wallThickness: parseInt(document.getElementById('wall-thickness').value, 10) || 9
            },
            designs: designs
        };
        await RoomioApi.saveProject(project);
        if (syncStatusEl) syncStatusEl.innerText = 'Last Sync: ' + new Date().toLocaleTimeString();
        console.log("[Cloud] Project synced successfully.");
    }

    // ==================== UNDO BUTTON ====================
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            engine.undo();
            updateJsonEditor();
        });
    }

    // ==================== TAB SYSTEM ====================
    let tabCounter = 1;
    let activeTabId = 0;
    const tabs = new Map(); // tabId -> { name, scene }
    tabs.set(0, { name: 'Design 1', scene: [] });

    const tabList = document.getElementById('tab-list');
    const tabAddBtn = document.getElementById('tab-add');

    function saveCurrentTab() {
        const data = tabs.get(activeTabId);
        if (data) data.scene = JSON.parse(JSON.stringify(engine.scene));
    }

    function switchTab(tabId) {
        if (tabId === activeTabId) return;
        saveCurrentTab();
        activeTabId = tabId;
        const data = tabs.get(tabId);
        if (data) {
            engine.scene = JSON.parse(JSON.stringify(data.scene));
            engine.clearSelection();
            engine.render();
        }
        renderTabBar();
        updateJsonEditor();
    }

    function renderTabBar() {
        tabList.innerHTML = '';
        for (const [id, data] of tabs) {
            const tabEl = document.createElement('div');
            tabEl.className = 'tab' + (id === activeTabId ? ' active' : '');
            tabEl.dataset.tabId = id;

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tab-name';
            nameSpan.textContent = data.name;
            const startRename = (e) => {
                e.stopPropagation();
                const input = document.createElement('input');
                input.type = 'text';
                input.value = data.name;
                input.style.cssText = 'background:transparent;border:1px solid var(--primary);color:var(--text-main);font-size:12px;width:100%;outline:none;padding:1px 4px;border-radius:3px;font-family:inherit;';
                nameSpan.replaceWith(input);
                input.focus();
                input.select();
                const finish = () => {
                    const newName = input.value.trim() || data.name;
                    data.name = newName;
                    nameSpan.textContent = newName;
                    input.replaceWith(nameSpan);
                };
                input.addEventListener('blur', finish);
                input.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') input.blur();
                    if (ev.key === 'Escape') { input.value = data.name; input.blur(); }
                });
            };
            nameSpan.addEventListener('dblclick', startRename);

            const renameBtn = document.createElement('button');
            renameBtn.className = 'tab-rename';
            renameBtn.title = 'Rename tab';
            renameBtn.innerHTML = '&#9998;';
            renameBtn.addEventListener('click', startRename);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close';
            closeBtn.title = 'Close tab';
            closeBtn.innerHTML = '&times;';
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (tabs.size <= 1) return;
                tabs.delete(id);
                if (activeTabId === id) {
                    const firstKey = tabs.keys().next().value;
                    switchTab(firstKey);
                }
                renderTabBar();
            });

            tabEl.appendChild(nameSpan);
            tabEl.appendChild(renameBtn);
            tabEl.appendChild(closeBtn);
            tabEl.addEventListener('click', () => switchTab(id));
            tabList.appendChild(tabEl);
        }
    }

    tabAddBtn.addEventListener('click', () => {
        const newId = tabCounter++;
        tabs.set(newId, { name: `Design ${newId + 1}`, scene: [] });
        switchTab(newId);
    });

    // ---- Properties panel visibility & minimize ----
    const propPanel = document.getElementById('properties-panel');
    const propHeader = document.getElementById('properties-header');
    const propBody = document.getElementById('properties-body');
    const propMinBtn = document.getElementById('prop-minimize-btn');
    const propCloseBtn = document.getElementById('prop-close-btn');
    const togglePropSidebarBtn = document.getElementById('toggle-properties-sidebar');
    let propMinimized = false;

    if (propMinBtn && propBody) {
        propMinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            propMinimized = !propMinimized;
            if (propMinimized) {
                propBody.classList.add('collapsed');
                propMinBtn.title = 'Expand';
                propMinBtn.innerHTML = '<i data-lucide="plus" style="width:14px;height:14px;"></i>';
            } else {
                propBody.classList.remove('collapsed');
                propMinBtn.title = 'Minimize';
                propMinBtn.innerHTML = '<i data-lucide="minus" style="width:14px;height:14px;"></i>';
            }
            lucide.createIcons({ nodes: [propMinBtn] });
        });
    }

    if (propCloseBtn && propPanel) {
        propCloseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            propPanel.classList.add('hidden');
        });
    }

    if (togglePropSidebarBtn && propPanel) {
        togglePropSidebarBtn.addEventListener('click', () => {
            propPanel.classList.toggle('hidden');
        });
    }

    // ---- Properties panel drag ----
    if (propPanel && propHeader) {
        let isDragging = false;
        let dragOffX = 0, dragOffY = 0;

        propHeader.style.cursor = 'grab';

        propHeader.addEventListener('mousedown', (e) => {
            if (e.target.closest('#prop-minimize-btn') || e.target.closest('#prop-close-btn')) return;
            isDragging = true;
            const rect = propPanel.getBoundingClientRect();
            dragOffX = e.clientX - rect.left;
            dragOffY = e.clientY - rect.top;
            propHeader.style.cursor = 'grabbing';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let newX = e.clientX - dragOffX;
            let newY = e.clientY - dragOffY;

            // Clamp to viewport
            newX = Math.max(0, Math.min(newX, window.innerWidth - propPanel.offsetWidth));
            newY = Math.max(0, Math.min(newY, window.innerHeight - 40));

            propPanel.style.left = newX + 'px';
            propPanel.style.top = newY + 'px';
            propPanel.style.right = 'auto';
            propPanel.style.bottom = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                propHeader.style.cursor = 'grab';
                document.body.style.userSelect = '';
            }
        });
    }

    // ==================== COLLAPSIBLE SIDEBAR OVERLAY ====================
    const mainToolbar = document.getElementById('main-toolbar');
    const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

    const forceCollapseSidebar = () => {
        if (!mainToolbar.classList.contains('collapsed')) {
            mainToolbar.classList.add('collapsed');
            if (sidebarToggleBtn) sidebarToggleBtn.classList.remove('hidden');
            setTimeout(() => engine.resize(), 300);
        }
    };

    if (sidebarCollapseBtn && mainToolbar) {
        sidebarCollapseBtn.addEventListener('click', () => {
            forceCollapseSidebar();
        });
    }

    if (sidebarToggleBtn && mainToolbar) {
        sidebarToggleBtn.addEventListener('click', () => {
            mainToolbar.classList.remove('collapsed');
            sidebarToggleBtn.classList.add('hidden');
            // Re-render engine scale after layout reflow
            setTimeout(() => engine.resize(), 300);
        });
    }

    // Auto-hide sidebar when using Header Bar operations
    document.querySelectorAll('.win-menu-bar .menu-item').forEach(menu => {
        menu.addEventListener('mouseenter', forceCollapseSidebar);
        menu.addEventListener('click', forceCollapseSidebar);
    });

    // ==================== COLLAPSIBLE ELEMENTS ====================
    const elementsHeader = document.getElementById('elements-header');
    const elementsBody = document.getElementById('elements-body');
    const elementsChevron = document.getElementById('elements-chevron');
    let elementsCollapsed = false;

    if (elementsHeader && elementsBody && elementsChevron) {
        elementsHeader.addEventListener('click', () => {
            elementsCollapsed = !elementsCollapsed;
            if (elementsCollapsed) {
                elementsBody.classList.add('collapsed');
                elementsChevron.classList.add('rotated');
            } else {
                elementsBody.classList.remove('collapsed');
                elementsChevron.classList.remove('rotated');
            }
        });
    }

    // ==================== TOOLBAR TOOL BUTTONS ====================
    const toolBtns = document.querySelectorAll('.tool-btn');
    toolBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            toolBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const toolName = e.currentTarget.dataset.tool;
            toolsManager.setTool(toolName);
            if (toolName === 'select') {
                canvasEl.classList.add('tool-select');
            } else {
                canvasEl.classList.remove('tool-select');
            }
        });
    });

    // ==================== WALL THICKNESS SLIDER ====================
    const wallThicknessInput = document.getElementById('wall-thickness');
    const thicknessVal = document.getElementById('thickness-val');
    wallThicknessInput.addEventListener('input', (e) => {
        thicknessVal.innerText = `${e.target.value}"`;
    });

    // ==================== EDIT SLIDERS ====================
    const editThicknessContainer = document.getElementById('edit-thickness-container');
    const editWallThicknessInput = document.getElementById('edit-wall-thickness');
    const editThicknessVal = document.getElementById('edit-thickness-val');
    const editLineTypeContainer = document.getElementById('edit-line-type-container');
    const editWallLineType = document.getElementById('edit-wall-line-type');
    const editWallAltitudeInput = document.getElementById('edit-wall-altitude');
    const editAltitudeVal = document.getElementById('edit-altitude-val');
    const editAltitudeContainer = document.getElementById('edit-altitude-container');

    editWallThicknessInput.addEventListener('input', (e) => {
        const valInches = parseInt(e.target.value, 10);
        editThicknessVal.innerText = `${valInches}"`;
        let changed = false;
        const pxVal = Math.round(valInches * (engine.gridSize / 12) * 100) / 100;
        for (const selected of engine.selectedItems) {
            if (selected && selected.type === 'wall') {
                selected.thickness = pxVal;
                changed = true;
            }
        }
        if (changed) {
            engine.render();
            updateJsonEditor();
        }
    });

    editWallAltitudeInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        editAltitudeVal.innerText = `${val}ft`;
        let changed = false;
        for (const selected of engine.selectedItems) {
            if (selected && selected.type === 'wall') {
                selected.altitude = val;
                changed = true;
            }
        }
        if (changed) engine.render();
    });

    // ==================== ROTATE / FLIP ====================
    const rotateBtn = document.getElementById('rotate-btn');
    if (rotateBtn) {
        rotateBtn.addEventListener('click', () => {
            const selected = engine.selectedItems[0];
            if (selected && selected.type === 'object') {
                const oldW = selected.width;
                selected.width = selected.height;
                selected.height = oldW;
                selected.rotation = ((selected.rotation || 0) + 90) % 360;
                engine.render();
                engine.onSelectionChange([selected]);
            }
        });
    }

    const flipHBtn = document.getElementById('flip-h-btn');
    if (flipHBtn) {
        flipHBtn.addEventListener('click', () => {
            if (engine.selectedItems.length === 1 && engine.selectedItems[0].type === 'object') {
                const item = engine.selectedItems[0];
                item.flipX = !item.flipX;
                engine.render();
                updateJsonEditor();
            }
        });
    }

    const flipVBtn = document.getElementById('flip-v-btn');
    if (flipVBtn) {
        flipVBtn.addEventListener('click', () => {
            if (engine.selectedItems.length === 1 && engine.selectedItems[0].type === 'object') {
                const item = engine.selectedItems[0];
                item.flipY = !item.flipY;
                engine.render();
                updateJsonEditor();
            }
        });
    }

    // ==================== ZOOM ====================
    document.getElementById('zoom-in').addEventListener('click', () => {
        engine.setZoom(engine.scale * 1.25);
    });
    document.getElementById('zoom-out').addEventListener('click', () => {
        engine.setZoom(engine.scale * 0.8);
    });
    document.getElementById('zoom-reset').addEventListener('click', () => {
        engine.zoomToFit();
    });

    const zoomValInput = document.getElementById('zoom-val');
    if (zoomValInput) {
        zoomValInput.addEventListener('change', (e) => {
            const raw = e.target.value.replace(/%/g, '');
            let level = parseFloat(raw) / 100;
            if (isNaN(level)) {
                e.target.value = Math.round(engine.scale * 100) + '%';
                return;
            }
            level = Math.max(0.1, Math.min(level, 5));
            engine.setZoom(level);
        });
        // Prevent pan being triggered if user clicks the input
        zoomValInput.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    // ==================== PROJECT IO ====================
    function getProjectName() {
        return (projectNameInput ? projectNameInput.value.trim() : '') || 'My Home';
    }

    function getActiveDesignName() {
        const data = tabs.get(activeTabId);
        return data ? data.name : 'Design 1';
    }

    function sanitizeFilename(name) {
        return name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
    }

    function applySettings(settings) {
        if (!settings) return;
        if (settings.bgColor) {
            engine.bgColor = settings.bgColor;
            if (bgColorInput) bgColorInput.value = settings.bgColor;
        }
        if (settings.northAngle !== undefined) {
            engine.northAngle = settings.northAngle;
            updateCompassUI(settings.northAngle);
        }
        // Sync Menu UI
        if (settings.theme) {
            document.body.classList.remove('theme-light', 'theme-dark');
            document.body.classList.add(settings.theme === 'light' ? 'theme-light' : 'theme-dark');
            const themeStatus = document.getElementById('theme-status');
            if (themeStatus) themeStatus.innerText = settings.theme === 'light' ? 'Light' : 'Dark';
        }

        if (settings.showVastu !== undefined) {
            engine.showVastu = settings.showVastu;
        }
        if (settings.showGrid !== undefined) {
            engine.showGrid = settings.showGrid;
        }
        if (settings.showCrosshairs !== undefined) {
            engine.showCrosshairs = settings.showCrosshairs;
        }
        if (settings.stickyWalls !== undefined) {
            engine.stickyWalls = settings.stickyWalls;
        }
        if (settings.hideStructure !== undefined) {
            engine.hideStructure = settings.hideStructure;
            const toggleStructureBtn = document.getElementById('toggle-structure');
            if (toggleStructureBtn) {
                if (engine.hideStructure) {
                    toggleStructureBtn.style.background = 'var(--danger)';
                    toggleStructureBtn.style.color = 'white';
                } else {
                    toggleStructureBtn.style.background = 'rgba(239, 68, 68, 0.1)';
                    toggleStructureBtn.style.color = 'var(--danger)';
                }
            }
        }
        if (settings.showGrid !== undefined) {
            engine.showGrid = settings.showGrid;
            const toggleGridBtn = document.getElementById('toggle-grid');
            if (toggleGridBtn) {
                if (engine.showGrid) {
                    toggleGridBtn.style.background = 'rgba(56, 189, 248, 0.1)';
                    toggleGridBtn.style.color = '#0ea5e9';
                } else {
                    toggleGridBtn.style.background = 'rgba(0, 0, 0, 0.1)';
                    toggleGridBtn.style.color = 'var(--text-muted)';
                }
            }
        }
        if (settings.showCrosshairs !== undefined) {
            engine.showCrosshairs = settings.showCrosshairs;
            const toggleCrosshairsBtn = document.getElementById('toggle-crosshairs');
            if (toggleCrosshairsBtn) {
                if (engine.showCrosshairs) {
                    toggleCrosshairsBtn.style.background = 'var(--purple-600)';
                    toggleCrosshairsBtn.style.color = 'white';
                } else {
                    toggleCrosshairsBtn.style.background = 'rgba(168, 85, 247, 0.1)';
                    toggleCrosshairsBtn.style.color = '#a855f7';
                }
            }
        }
        if (settings.stickyWalls !== undefined) {
            engine.stickyWalls = settings.stickyWalls;
            const toggleStickyBtn = document.getElementById('toggle-sticky');
            if (toggleStickyBtn) {
                if (engine.stickyWalls) {
                    toggleStickyBtn.style.background = '#84cc16';
                    toggleStickyBtn.style.color = 'white';
                } else {
                    toggleStickyBtn.style.background = 'rgba(132, 204, 22, 0.1)';
                    toggleStickyBtn.style.color = '#84cc16';
                }
            }
        }
        if (settings.wallThickness !== undefined) {
            if (wallThicknessInput) wallThicknessInput.value = settings.wallThickness;
            if (thicknessVal) thicknessVal.innerText = `${settings.wallThickness}\"`;
        }
        if (settings.wallLineType) {
            const lineTypeSelect = document.getElementById('wall-line-type');
            if (lineTypeSelect) lineTypeSelect.value = settings.wallLineType;
        }
    }

    // ---- Save: saves ALL designs in a single project file ----
    document.getElementById('save-json-btn').addEventListener('click', async () => {
        try {
            saveCurrentTab();
            const designs = [];
            for (const [id, data] of tabs) {
                designs.push({
                    id: id,
                    name: data.name,
                    scene: data.scene
                });
            }
            const project = {
                version: CURRENT_VERSION,
                projectName: getProjectName(),
                activeDesignIndex: [...tabs.keys()].indexOf(activeTabId),
                settings: {
                    theme: document.body.classList.contains('theme-light') ? 'light' : 'dark',
                    bgColor: engine.bgColor || '#1e1e22',
                    northAngle: engine.northAngle || 0,
                    showVastu: engine.showVastu || false,
                    showGrid: engine.showGrid !== undefined ? engine.showGrid : true,
                    showCrosshairs: engine.showCrosshairs || false,
                    stickyWalls: engine.stickyWalls !== undefined ? engine.stickyWalls : true,
                    hideStructure: engine.hideStructure || false,
                    wallThickness: parseInt(wallThicknessInput.value, 10) || 9
                },
                designs: designs
            };

            const jsonStr = JSON.stringify(project, null, 2);
            let fileContent, fileExt;

            if (document.getElementById('encrypt-toggle')?.checked) {
                fileContent = await SketchMyHomeCrypto.encrypt(jsonStr);
                fileExt = 'rproj';
            } else {
                fileContent = jsonStr;
                fileExt = 'json';
            }

            const blob = new Blob([fileContent], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${sanitizeFilename(getProjectName())}.${fileExt}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Failed to save project:", err);
            alert("Error saving project. Check console.");
        }
    });

    const CURRENT_VERSION = '2.3.0';

    function migrateProjectIfNeeded(parsedInput) {
        if (!parsedInput) return null;
        let parsed = parsedInput;

        // Legacy V1 (Array-only) normalization
        if (Array.isArray(parsed)) {
            parsed = {
                version: '1.0.0',
                designs: [{
                    id: 0,
                    name: 'Imported v1 Design',
                    scene: JSON.parse(JSON.stringify(parsed))
                }],
                settings: {}
            };
        }

        const fileVersion = parsed.version || '1.0.0';

        // If versions match exactly, no migration needed
        if (fileVersion === CURRENT_VERSION) return parsed;

        // USER ACCEPTANCE BANNER
        const message = `Project Migration Available (v${fileVersion} → v${CURRENT_VERSION})\n\n` +
            `Would you like to upgrade this project to the latest version?\n\n` +
            `• Enables Sticky Wall Joins & Smart Alignment\n` +
            `• Improves rendering performance for architectural objects\n` +
            `• Standardizes data formats for Vastu & Orientation\n\n` +
            `Only select OK if you accept these structural changes.`;

        if (!confirm(message)) {
            console.warn("[MIGRATION] User declined migration. Loading in legacy mode.");
            return parsed;
        }

        // START MIGRATION
        console.warn(`[MIGRATION] UPGRADING PROJECT from v${fileVersion} to v${CURRENT_VERSION}`);

        // 1. Move flat scene to designs catalog if needed
        if (parsed.scene && !parsed.designs) {
            parsed.designs = [{
                id: 0,
                name: parsed.projectName || 'Migrated Design',
                scene: parsed.scene
            }];
            delete parsed.scene;
        }

        // 2. Default modern settings
        const s = parsed.settings || {};
        if (s.stickyWalls === undefined) s.stickyWalls = true;
        if (s.showGrid === undefined) s.showGrid = true;
        if (s.theme === undefined) s.theme = 'dark';
        parsed.settings = s;

        // 3. Update version string
        parsed.version = CURRENT_VERSION;
        console.log("[MIGRATION] Migration complete.");
        return parsed;
    }

    // ---- Load: restores all designs, settings, and project name ----
    function loadProjectFromJSON(parsedInput) {
        try {
            console.log("Starting project load sequence...");
            const parsed = migrateProjectIfNeeded(parsedInput);

            if (parsed && parsed.designs && Array.isArray(parsed.designs)) {
                // Modern unified structure
                if (parsed.projectName && projectNameInput) {
                    projectNameInput.value = parsed.projectName;
                }

                try {
                    applySettings(parsed.settings || null);
                } catch (settErr) {
                    console.warn("Settings application partially failed:", settErr);
                }

                tabs.clear();
                tabCounter = 0;
                for (const design of parsed.designs) {
                    const tid = tabCounter++;
                    tabs.set(tid, {
                        name: design.name || `Design ${tid + 1}`,
                        scene: design.scene || []
                    });
                }

                const targetIdx = parsed.activeDesignIndex || 0;
                const keys = [...tabs.keys()];
                if (keys.length === 0) throw new Error("No design tabs found in project.");

                activeTabId = keys[Math.min(targetIdx, keys.length - 1)] || keys[0];

                const activeData = tabs.get(activeTabId);
                if (!activeData) throw new Error("Could not retrieve active design data.");

                engine.scene = JSON.parse(JSON.stringify(activeData.scene));
                engine.clearSelection();
                engine.undoStack = [];

                try {
                    engine.render();
                    renderTabBar();
                } catch (renderErr) {
                    console.error("Initial render failed:", renderErr);
                }
            } else {
                throw new Error("Missing design catalog or invalid project root.");
            }

            if (typeof engine.zoomToFit === 'function') engine.zoomToFit();
            updateJsonEditor();
            console.log("Project loaded successfully.");
        } catch (loadErr) {
            console.error("Critical error in loadProjectFromJSON:", loadErr);
            alert(`Load Failed: ${loadErr.message || 'Invalid File Format'}`);
        }
    }

    document.getElementById('load-json-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                let rawContent = event.target.result;
                if (!rawContent) throw new Error("File is empty.");

                // Sanitize: remove BOM and trim
                rawContent = rawContent.replace(/^\uFEFF/, "").trim();

                // Auto-detect encrypted files
                if (typeof SketchMyHomeCrypto !== 'undefined' && SketchMyHomeCrypto.isEncrypted(rawContent)) {
                    console.log("Encrypted project detected. Initiatives decryption strategy...");
                    const strategy = SketchMyHomeCrypto.detectStrategy(rawContent);
                    let passphrase = null;

                    if (strategy === 'aes') {
                        passphrase = prompt('This file is AES-encrypted. Enter passphrase:');
                        if (!passphrase) {
                            e.target.value = '';
                            return;
                        }
                    }
                    rawContent = await SketchMyHomeCrypto.decrypt(rawContent, passphrase);
                }

                let parsed;
                try {
                    parsed = JSON.parse(rawContent);
                } catch (parseErr) {
                    console.error("JSON Parse Error:", parseErr);
                    throw new Error(`Invalid JSON syntax: ${parseErr.message}`);
                }

                loadProjectFromJSON(parsed);
                e.target.value = '';
            } catch (err) {
                console.error("FileReader Error:", err);
                if (err.message && err.message.includes('passphrase')) {
                    alert('Decryption failed. Wrong passphrase or corrupted file.');
                } else {
                    alert(`Load Error: ${err.message}`);
                }
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the canvas?')) {
            engine.clearScene();
            updateJsonEditor();
        }
    });

    const exportBtn = document.getElementById('export-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            const projectName = getProjectName();
            const projectData = {
                scene: engine.scene,
                settings: { northAngle: engine.northAngle }
            };
            const dataURL = await engine.exportToDataURL(projectName, projectData);
            const a = document.createElement('a');
            a.href = dataURL;
            const filename = `${sanitizeFilename(projectName)}_${sanitizeFilename(getActiveDesignName())}.png`;
            a.download = filename;
            a.click();
        });
    }

    // ==================== VASTU / NORTH / BG / STRUCTURE ====================
    // ---- Windows Style Menu Bindings ----
    const menuThemeToggle = document.getElementById('menu-theme-toggle');
    if (menuThemeToggle) {
        menuThemeToggle.addEventListener('click', () => {
            const isLight = document.body.classList.contains('theme-light');
            const newTheme = isLight ? 'theme-dark' : 'theme-light';
            document.body.classList.remove('theme-light', 'theme-dark');
            document.body.classList.add(newTheme);

            const themeStatus = document.getElementById('theme-status');
            if (themeStatus) themeStatus.innerText = isLight ? 'Dark' : 'Light';

            // Auto-update canvas background if user hasn't explicitly changed it to something else
            const currentBG = document.getElementById('bg-color').value;
            if (currentBG === '#1e1e22' || currentBG === '#ffffff') {
                const nextBG = isLight ? '#1e1e22' : '#ffffff';
                document.getElementById('bg-color').value = nextBG;
                engine.bgColor = nextBG;
            }

            engine.render();
        });
    }

    const menuToggleGrid = document.getElementById('menu-toggle-grid');
    if (menuToggleGrid) {
        menuToggleGrid.addEventListener('click', () => {
            engine.showGrid = !engine.showGrid;
            engine.render();
        });
    }

    const menuToggleVastu = document.getElementById('menu-toggle-vastu');
    if (menuToggleVastu) {
        menuToggleVastu.addEventListener('click', () => {
            engine.showVastu = !engine.showVastu;
            engine.render();
        });
    }

    const menuToggleGuide = document.getElementById('menu-toggle-guide');
    if (menuToggleGuide) {
        menuToggleGuide.addEventListener('click', () => {
            engine.showCrosshairs = !engine.showCrosshairs;
            engine.render();
        });
    }

    const menuToggleSticky = document.getElementById('menu-toggle-sticky');
    if (menuToggleSticky) {
        menuToggleSticky.addEventListener('click', () => {
            engine.stickyWalls = !engine.stickyWalls;
        });
    }

    const menuZoomReset = document.getElementById('menu-zoom-reset');
    if (menuZoomReset) {
        menuZoomReset.addEventListener('click', () => {
            if (typeof engine.zoomToFit === 'function') engine.zoomToFit();
        });
    }

    const menuToggleJson = document.getElementById('menu-toggle-json');
    if (menuToggleJson) {
        menuToggleJson.addEventListener('click', () => {
            document.getElementById('toggle-json-sidebar')?.click();
        });
    }

    const menuToggleProps = document.getElementById('menu-toggle-props');
    if (menuToggleProps) {
        menuToggleProps.addEventListener('click', () => {
            document.getElementById('toggle-properties-sidebar')?.click();
        });
    }

    // Modal Logic
    const backdrop = document.getElementById('modal-backdrop');
    const modals = {
        shortcuts: document.getElementById('modal-shortcuts'),
        about: document.getElementById('modal-about'),
        guide: document.getElementById('modal-guide')
    };

    function openModal(id) {
        backdrop.classList.remove('hidden');
        Object.values(modals).forEach(m => m.classList.add('hidden'));
        modals[id]?.classList.remove('hidden');
        lucide.createIcons(); // refresh icons in content
    }

    function closeModal() {
        backdrop.classList.add('hidden');
    }

    document.getElementById('menu-help-shortcuts')?.addEventListener('click', () => openModal('shortcuts'));
    document.getElementById('menu-help-about')?.addEventListener('click', () => openModal('about'));
    document.getElementById('menu-help-guide')?.addEventListener('click', () => openModal('guide'));

    document.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', closeModal));
    backdrop?.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !backdrop.classList.contains('hidden')) closeModal();
        if (e.key === 'F1') { e.preventDefault(); openModal('shortcuts'); }
    });

    const toggleVastuBtn = document.getElementById('toggle-vastu');
    if (toggleVastuBtn) {
        toggleVastuBtn.addEventListener('click', () => {
            engine.showVastu = !engine.showVastu;
            if (engine.showVastu) {
                toggleVastuBtn.style.background = 'var(--primary)';
                toggleVastuBtn.style.color = 'white';
            } else {
                toggleVastuBtn.style.background = 'rgba(99, 102, 241, 0.1)';
                toggleVastuBtn.style.color = 'var(--primary)';
            }
            engine.render();
        });
    }

    const toggleGridBtn = document.getElementById('toggle-grid');
    if (toggleGridBtn) {
        toggleGridBtn.addEventListener('click', () => {
            engine.showGrid = !engine.showGrid;
            if (engine.showGrid) {
                toggleGridBtn.style.background = 'rgba(56, 189, 248, 0.1)';
                toggleGridBtn.style.color = '#0ea5e9';
            } else {
                toggleGridBtn.style.background = 'rgba(0, 0, 0, 0.1)';
                toggleGridBtn.style.color = 'var(--text-muted)';
            }
            engine.render();
        });
    }

    const toggleCrosshairsBtn = document.getElementById('toggle-crosshairs');
    if (toggleCrosshairsBtn) {
        toggleCrosshairsBtn.addEventListener('click', () => {
            engine.showCrosshairs = !engine.showCrosshairs;
            if (engine.showCrosshairs) {
                toggleCrosshairsBtn.style.background = '#a855f7';
                toggleCrosshairsBtn.style.color = 'white';
            } else {
                toggleCrosshairsBtn.style.background = 'rgba(168, 85, 247, 0.1)';
                toggleCrosshairsBtn.style.color = '#a855f7';
            }
            engine.render();
        });
    }

    const toggleStickyBtn = document.getElementById('toggle-sticky');
    if (toggleStickyBtn) {
        toggleStickyBtn.addEventListener('click', () => {
            engine.stickyWalls = !engine.stickyWalls;
            if (engine.stickyWalls) {
                toggleStickyBtn.style.background = '#84cc16';
                toggleStickyBtn.style.color = 'white';
            } else {
                toggleStickyBtn.style.background = 'rgba(132, 204, 22, 0.1)';
                toggleStickyBtn.style.color = '#84cc16';
            }
            engine.render();
        });
    }

    const toggleStructureBtn = document.getElementById('toggle-structure');
    if (toggleStructureBtn) {
        toggleStructureBtn.addEventListener('click', () => {
            engine.hideStructure = !engine.hideStructure;
            if (engine.hideStructure) {
                toggleStructureBtn.style.background = 'var(--danger)';
                toggleStructureBtn.style.color = 'white';
            } else {
                toggleStructureBtn.style.background = 'rgba(239, 68, 68, 0.1)';
                toggleStructureBtn.style.color = 'var(--danger)';
            }
            engine.render();
        });
    }

    // ==================== NORTH ANGLE & COMPASS ====================
    const northAngleInput = document.getElementById('north-angle');
    const compassWidget = document.getElementById('compass-widget');
    const compassNeedle = document.getElementById('compass-needle');
    const compassLabels = document.getElementById('compass-labels');
    const compassBubble = document.getElementById('compass-angle-bubble');

    // Initialize widget position
    if (compassWidget) {
        compassWidget.style.top = '100px';
        compassWidget.style.right = '40px';
    }

    function updateCompassUI(angle) {
        if (compassLabels) {
            // Stationary needle points left (-90), so labels must rotate to meet it
            // When angle is 0 (North), 'N' should be at the needle position (left)
            compassLabels.style.transform = `rotate(${angle}deg)`;
        }
        if (compassBubble) {
            compassBubble.innerText = `${angle}°`;
        }
        if (northAngleInput) {
            northAngleInput.value = angle;
            const valLabel = document.getElementById('north-angle-val');
            if (valLabel) valLabel.innerText = `${angle}°`;
        }
    }

    if (northAngleInput) {
        northAngleInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            engine.northAngle = val;
            updateCompassUI(val);
            engine.render();
        });
    }

    // Interactive Compass: Move & Rotate
    if (compassWidget) {
        let isDraggingCompass = false;
        let isMovingCompass = false;
        let startX, startY, startRight, startTop;

        const handleInteraction = (e) => {
            if (isMovingCompass) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                compassWidget.style.right = (startRight - dx) + 'px';
                compassWidget.style.top = (startTop + dy) + 'px';
                return;
            }

            if (isDraggingCompass) {
                const rect = compassWidget.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                const angleRad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
                let angleDeg = Math.round(angleRad * (180 / Math.PI) + 90);

                if (angleDeg < 0) angleDeg += 360;
                angleDeg = angleDeg % 360;

                engine.northAngle = angleDeg;
                updateCompassUI(angleDeg);
                if (engine.showVastu) engine.render();
            }
        };

        compassWidget.addEventListener('mousedown', (e) => {
            const rect = compassWidget.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // If click is near center (within 35px), rotate. Otherwise, move.
            const dist = Math.hypot(e.clientX - centerX, e.clientY - centerY);

            if (dist < 35) {
                isDraggingCompass = true;
            } else {
                isMovingCompass = true;
                startX = e.clientX;
                startY = e.clientY;
                const style = window.getComputedStyle(compassWidget);
                startRight = parseInt(style.right, 10);
                startTop = parseInt(style.top, 10);
                compassWidget.style.cursor = 'move';
            }

            document.addEventListener('mousemove', handleInteraction);
        });

        document.addEventListener('mouseup', () => {
            if (isDraggingCompass || isMovingCompass) {
                isDraggingCompass = false;
                isMovingCompass = false;
                compassWidget.style.cursor = 'crosshair';
                document.removeEventListener('mousemove', handleInteraction);
            }
        });
    }

    const bgColorInput = document.getElementById('bg-color');
    if (bgColorInput) {
        bgColorInput.addEventListener('input', (e) => {
            engine.bgColor = e.target.value;
            engine.render();
        });
    }

    // ==================== FLOATING JSON EDITOR ====================
    let isEditorSyncing = false;
    const jsonSidebar = document.getElementById('json-sidebar');
    const jsonEditor = document.getElementById('json-editor');
    const toggleJsonBtn = document.getElementById('toggle-json-sidebar');
    const jsonStatus = document.getElementById('json-status');
    const floatingClose = document.getElementById('floating-editor-close');

    function updateJsonEditor() {
        if (isEditorSyncing || !jsonSidebar || jsonSidebar.classList.contains('hidden')) return;
        isEditorSyncing = true;
        jsonEditor.value = JSON.stringify(engine.scene, null, 2);
        if (jsonStatus) {
            jsonStatus.innerText = 'Valid JSON';
            jsonStatus.className = 'status-badge success';
            jsonStatus.style = '';
        }
        isEditorSyncing = false;
    }

    engine.onSceneChange = () => {
        saveCurrentTab();
        updateJsonEditor();
    };

    if (toggleJsonBtn) {
        toggleJsonBtn.addEventListener('click', () => {
            jsonSidebar.classList.toggle('hidden');
            if (!jsonSidebar.classList.contains('hidden')) {
                updateJsonEditor();
            }
        });
    }

    if (floatingClose) {
        floatingClose.addEventListener('click', () => {
            jsonSidebar.classList.add('hidden');
        });
    }

    if (editWallLineType) {
        editWallLineType.addEventListener('change', (e) => {
            let changed = false;
            engine.selectedItems.forEach(item => {
                if (item.type === 'wall') {
                    item.lineType = e.target.value;
                    changed = true;
                }
            });
            if (changed) {
                engine.render();
                updateJsonEditor();
            }
        });
    }

    let jsonDebounce;
    if (jsonEditor) {
        jsonEditor.addEventListener('input', (e) => {
            if (isEditorSyncing) return;
            clearTimeout(jsonDebounce);
            if (jsonStatus) {
                jsonStatus.innerText = '...';
                jsonStatus.className = 'status-badge';
                jsonStatus.style.background = 'rgba(255, 255, 255, 0.1)';
                jsonStatus.style.color = '#ccc';
            }
            jsonDebounce = setTimeout(() => {
                try {
                    isEditorSyncing = true;
                    const newScene = JSON.parse(e.target.value);
                    if (Array.isArray(newScene)) {
                        engine.scene = newScene;
                        engine.clearSelection();
                        engine.render();
                        saveCurrentTab();
                        if (jsonStatus) {
                            jsonStatus.innerText = 'Valid JSON';
                            jsonStatus.className = 'status-badge success';
                            jsonStatus.style = '';
                        }
                    } else {
                        throw new Error("Must be array");
                    }
                } catch (err) {
                    if (jsonStatus) {
                        jsonStatus.innerText = 'Format Error';
                        jsonStatus.className = 'status-badge error';
                        jsonStatus.style = '';
                    }
                } finally {
                    isEditorSyncing = false;
                }
            }, 600);
        });
    }

    // ---- Floating editor drag ----
    const titlebar = document.getElementById('floating-editor-titlebar');
    if (titlebar && jsonSidebar) {
        let isDragging = false;
        let dragOffX = 0, dragOffY = 0;

        titlebar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.floating-editor-close') || e.target.closest('.status-badge')) return;
            isDragging = true;
            const rect = jsonSidebar.getBoundingClientRect();
            dragOffX = e.clientX - rect.left;
            dragOffY = e.clientY - rect.top;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            let newX = e.clientX - dragOffX;
            let newY = e.clientY - dragOffY;
            // Clamp to viewport
            newX = Math.max(0, Math.min(newX, window.innerWidth - 100));
            newY = Math.max(0, Math.min(newY, window.innerHeight - 40));
            jsonSidebar.style.left = newX + 'px';
            jsonSidebar.style.top = newY + 'px';
            jsonSidebar.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                document.body.style.userSelect = '';
            }
        });
    }

    // ---- Floating editor resize ----
    const resizeHandle = document.getElementById('floating-editor-resize');
    if (resizeHandle && jsonSidebar) {
        let isResizing = false;
        let resizeStartX, resizeStartY, startW, startH;

        resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            resizeStartX = e.clientX;
            resizeStartY = e.clientY;
            const rect = jsonSidebar.getBoundingClientRect();
            startW = rect.width;
            startH = rect.height;
            document.body.style.userSelect = 'none';
            e.stopPropagation();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newW = Math.max(280, startW + (e.clientX - resizeStartX));
            const newH = Math.max(200, startH + (e.clientY - resizeStartY));
            jsonSidebar.style.width = newW + 'px';
            jsonSidebar.style.height = newH + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
            }
        });
    }

    // ==================== RESIZE ====================
    window.addEventListener('resize', () => {
        engine.resize();
    });

    // ==================== SELECTION UI UPDATES ====================
    const editTextContainer = document.getElementById('edit-text-container');
    const editTextContent = document.getElementById('edit-text-content');
    const editTextSize = document.getElementById('edit-text-size');
    const editTextSizeVal = document.getElementById('edit-text-size-val');

    if (editTextContent) {
        editTextContent.addEventListener('input', (e) => {
            if (engine.selectedItems.length === 1 && engine.selectedItems[0].subType === 'text') {
                engine.selectedItems[0].text = e.target.value;
                engine.render();
                updateJsonEditor();
            }
        });
    }
    if (editTextSize) {
        editTextSize.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            if (editTextSizeVal) editTextSizeVal.innerText = `${val}px`;
            if (engine.selectedItems.length === 1 && engine.selectedItems[0].subType === 'text') {
                engine.selectedItems[0].fontSize = val;
                engine.render();
                updateJsonEditor();
            }
        });
    }

    engine.onSelectionChange = (items) => {
        const infoDiv = document.getElementById('selection-info');
        const itemProp = document.getElementById('item-properties');
        const rotateContainer = document.getElementById('rotate-container');
        const hideTextControls = () => { if (editTextContainer) editTextContainer.style.display = 'none'; };

        if (items.length === 1) {
            const item = items[0];
            itemProp.style.display = 'block';

            if (item.type === 'room' || item.type === 'object') {
                const w = engine.pixelsToFeet(item.width);
                const h = engine.pixelsToFeet(item.height);
                const tName = item.type === 'object' ? (item.subType.charAt(0).toUpperCase() + item.subType.slice(1)) : 'Room';
                infoDiv.innerHTML = `<strong>Selected ${tName}</strong><br/>Size: ${w} \u00d7 ${h}`;
                editThicknessContainer.style.display = 'none';
                if (editLineTypeContainer) editLineTypeContainer.style.display = 'none';
                editAltitudeContainer.style.display = 'none';
                rotateContainer.style.display = item.type === 'object' ? 'block' : 'none';
                if (item.subType === 'text' && editTextContainer) {
                    editTextContainer.style.display = 'flex';
                    editTextContent.value = item.text || '';
                    editTextSize.value = item.fontSize || 16;
                    if (editTextSizeVal) editTextSizeVal.innerText = `${item.fontSize || 16}px`;
                } else {
                    hideTextControls();
                }
            } else if (item.type === 'wall') {
                const dx = item.endX - item.startX;
                const dy = item.endY - item.startY;
                const len = engine.pixelsToFeet(Math.sqrt(dx * dx + dy * dy));
                let angleDeg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
                if (angleDeg < 0) angleDeg += 360;
                infoDiv.innerHTML = `<strong>Selected Wall</strong><br/>Length: ${len}<br/>Angle: ${angleDeg}\u00b0`;
                editThicknessContainer.style.display = 'flex';
                const currentInches = Math.round((item.thickness || 9 * (engine.gridSize / 12)) / (engine.gridSize / 12));
                editWallThicknessInput.value = currentInches;
                editThicknessVal.innerText = `${currentInches}"`;
                if (editLineTypeContainer && editWallLineType) {
                    editLineTypeContainer.style.display = 'block';
                    editWallLineType.value = item.lineType || 'solid';
                }
                editAltitudeContainer.style.display = 'flex';
                editWallAltitudeInput.value = item.altitude || 8;
                editAltitudeVal.innerText = `${editWallAltitudeInput.value}ft`;
                rotateContainer.style.display = 'none';
                hideTextControls();
            } else if (item.type === 'measure') {
                const dx = item.endX - item.startX;
                const dy = item.endY - item.startY;
                const len = engine.pixelsToFeet(Math.sqrt(dx * dx + dy * dy));
                infoDiv.innerHTML = `<strong>Measurement Line</strong><br/>Length: ${len}`;
                editThicknessContainer.style.display = 'none';
                if (editLineTypeContainer) editLineTypeContainer.style.display = 'none';
                editAltitudeContainer.style.display = 'none';
                rotateContainer.style.display = 'none';
                hideTextControls();
            } else if (item.type === 'area_measure') {
                let areaPx = 0;
                for (let i = 0; i < item.points.length; i++) {
                    const current = item.points[i];
                    const next = item.points[(i + 1) % item.points.length];
                    areaPx += current.x * next.y;
                    areaPx -= next.x * current.y;
                }
                areaPx = Math.abs(areaPx) / 2;
                const areaSqFt = (areaPx / (engine.gridSize * engine.gridSize)).toFixed(2);
                infoDiv.innerHTML = `<strong>Area Measurement</strong><br/>Points: ${item.points.length}<br/>Area: ${areaSqFt} sq. ft`;
                editThicknessContainer.style.display = 'none';
                if (editLineTypeContainer) editLineTypeContainer.style.display = 'none';
                editAltitudeContainer.style.display = 'none';
                rotateContainer.style.display = 'none';
                hideTextControls();
            }
        } else if (items.length > 1) {
            hideTextControls();
            const allWalls = items.every(i => i.type === 'wall');
            if (allWalls) {
                infoDiv.innerHTML = `<strong>${items.length} Walls Selected</strong>`;
                editThicknessContainer.style.display = 'flex';
                const currentInches = Math.round((items[0].thickness || 9 * (engine.gridSize / 12)) / (engine.gridSize / 12));
                editWallThicknessInput.value = currentInches;
                editThicknessVal.innerText = `${currentInches}"`;
                if (editLineTypeContainer && editWallLineType) {
                    editLineTypeContainer.style.display = 'block';
                    editWallLineType.value = items[0].lineType || 'solid';
                }
                editAltitudeContainer.style.display = 'flex';
                editWallAltitudeInput.value = items[0].altitude || 8;
                editAltitudeVal.innerText = `${editWallAltitudeInput.value}ft`;
                rotateContainer.style.display = 'none';
            } else {
                infoDiv.innerHTML = `<strong>${items.length} Items Selected</strong>`;
                editThicknessContainer.style.display = 'none';
                if (editLineTypeContainer) editLineTypeContainer.style.display = 'none';
                editAltitudeContainer.style.display = 'none';
                rotateContainer.style.display = 'none';
            }
        } else {
            infoDiv.innerText = 'No item selected.';
            itemProp.style.display = 'none';
            editThicknessContainer.style.display = 'none';
            if (editLineTypeContainer) editLineTypeContainer.style.display = 'none';
            editAltitudeContainer.style.display = 'none';
            rotateContainer.style.display = 'none';
            hideTextControls();
        }
    };

    // ==================== INIT ====================
    const defaultToolBtn = document.querySelector('.tool-btn[data-tool="pan"]');
    if (defaultToolBtn) {
        defaultToolBtn.click();
    } else {
        toolsManager.setTool('pan');
        canvasEl.classList.add('tool-pan');
    }
    renderTabBar();
});
