document.addEventListener('DOMContentLoaded', () => {
    const canvasEl = document.getElementById('design-canvas');
    const engine = new CanvasEngine(canvasEl);
    const toolsManager = new ToolsManager(engine);
    const projectNameInput = document.getElementById('project-name');

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

    // ==================== COLLAPSIBLE SIDEBAR ====================
    const mainToolbar = document.getElementById('main-toolbar');
    const sidebarCollapseBtn = document.getElementById('sidebar-collapse-btn');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');

    if (sidebarCollapseBtn && mainToolbar && sidebarToggleBtn) {
        sidebarCollapseBtn.addEventListener('click', () => {
            mainToolbar.classList.add('collapsed');
            sidebarToggleBtn.classList.remove('hidden');
            setTimeout(() => engine.resize(), 300);
        });
        sidebarToggleBtn.addEventListener('click', () => {
            mainToolbar.classList.remove('collapsed');
            sidebarToggleBtn.classList.add('hidden');
            setTimeout(() => engine.resize(), 300);
        });
    }

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
            if (northAngleInput) northAngleInput.value = settings.northAngle;
            const northVal = document.getElementById('north-angle-val');
            if (northVal) northVal.innerText = `${settings.northAngle}\u00b0`;
            const ring = document.querySelector('.compass-ring');
            if (ring) ring.style.transform = `rotate(${settings.northAngle}deg)`;
        }
        if (settings.showVastu !== undefined) {
            engine.showVastu = settings.showVastu;
            if (toggleVastuBtn) {
                if (engine.showVastu) {
                    toggleVastuBtn.style.background = 'var(--primary)';
                    toggleVastuBtn.style.color = 'white';
                } else {
                    toggleVastuBtn.style.background = 'rgba(99, 102, 241, 0.1)';
                    toggleVastuBtn.style.color = 'var(--primary)';
                }
            }
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
                version: '2.1.0',
                projectName: getProjectName(),
                activeDesignIndex: [...tabs.keys()].indexOf(activeTabId),
                settings: {
                    bgColor: engine.bgColor || '#1e1e22',
                    northAngle: engine.northAngle || 0,
                    showVastu: engine.showVastu || false,
                    showGrid: engine.showGrid !== undefined ? engine.showGrid : true,
                    hideStructure: engine.hideStructure || false,
                    wallThickness: parseInt(wallThicknessInput.value, 10) || 9,
                    wallLineType: document.getElementById('wall-line-type')?.value || 'solid'
                },
                designs: designs
            };
            const jsonStr = JSON.stringify(project, null, 2);
            const shouldEncrypt = true; // Encryption is now enforced for all project saves.

            let fileContent, fileExt;
            if (shouldEncrypt && typeof RoomioCrypto !== 'undefined') {
                fileContent = await RoomioCrypto.encrypt(jsonStr);
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

    // ---- Load: restores all designs, settings, and project name ----
    function loadProjectFromJSON(parsed) {
        if (Array.isArray(parsed)) {
            // Legacy v1: flat scene array
            engine.scene = parsed;
            engine.clearSelection();
            engine.render();
            const td = tabs.get(activeTabId);
            if (td) td.scene = JSON.parse(JSON.stringify(parsed));
        } else if (parsed && parsed.designs && Array.isArray(parsed.designs)) {
            // v2.1.0+: full project with multiple designs
            if (parsed.projectName && projectNameInput) {
                projectNameInput.value = parsed.projectName;
            }
            applySettings(parsed.settings || null);

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
            activeTabId = keys[Math.min(targetIdx, keys.length - 1)] || keys[0];

            const activeData = tabs.get(activeTabId);
            engine.scene = JSON.parse(JSON.stringify(activeData.scene));
            engine.clearSelection();
            engine.undoStack = [];
            engine.render();
            renderTabBar();
        } else if (parsed && parsed.scene && Array.isArray(parsed.scene)) {
            // v2.0.0: single-scene project with settings
            if (parsed.projectName && projectNameInput) {
                projectNameInput.value = parsed.projectName;
            }
            applySettings(parsed.settings || null);
            engine.scene = parsed.scene;
            engine.clearSelection();
            engine.render();
            const td = tabs.get(activeTabId);
            if (td) td.scene = JSON.parse(JSON.stringify(parsed.scene));
        } else {
            alert('Invalid project file format.');
            return;
        }
        engine.zoomToFit();
        updateJsonEditor();
    }

    document.getElementById('load-json-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                let rawContent = event.target.result;

                // Auto-detect encrypted files
                if (typeof RoomioCrypto !== 'undefined' && RoomioCrypto.isEncrypted(rawContent)) {
                    const strategy = RoomioCrypto.detectStrategy(rawContent);
                    let passphrase = null;

                    if (strategy === 'aes') {
                        passphrase = prompt('This file is AES-encrypted. Enter passphrase:');
                        if (!passphrase) {
                            e.target.value = '';
                            return;
                        }
                    }

                    rawContent = await RoomioCrypto.decrypt(rawContent, passphrase);
                }

                const parsed = JSON.parse(rawContent);
                loadProjectFromJSON(parsed);
                e.target.value = '';
            } catch (err) {
                console.error(err);
                if (err.message && err.message.includes('passphrase')) {
                    alert('Decryption failed. Wrong passphrase or corrupted file.');
                } else {
                    alert('Error loading project file.');
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
        exportBtn.addEventListener('click', () => {
            const dataURL = engine.exportToDataURL();
            const a = document.createElement('a');
            a.href = dataURL;
            const filename = `${sanitizeFilename(getProjectName())}_${sanitizeFilename(getActiveDesignName())}.png`;
            a.download = filename;
            a.click();
        });
    }

    // ==================== VASTU / NORTH / BG / STRUCTURE ====================
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

    const northAngleInput = document.getElementById('north-angle');
    if (northAngleInput) {
        northAngleInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            engine.northAngle = val;
            document.getElementById('north-angle-val').innerText = `${val}°`;
            const ring = document.querySelector('.compass-ring');
            if (ring) ring.style.transform = `rotate(${val}deg)`;
            if (engine.showVastu) engine.render();
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
