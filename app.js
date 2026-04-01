document.addEventListener('DOMContentLoaded', () => {
    const canvasEl = document.getElementById('design-canvas');
    const engine = new CanvasEngine(canvasEl);
    const toolsManager = new ToolsManager(engine);

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

    // ==================== PROPERTIES MINIMIZE ====================
    const propMinBtn = document.getElementById('prop-minimize-btn');
    const propBody = document.getElementById('properties-body');
    let propMinimized = false;

    if (propMinBtn && propBody) {
        propMinBtn.addEventListener('click', () => {
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
        const pxVal = valInches * (engine.gridSize / 12);
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
        engine.setZoom(1);
        engine.offsetX = 0;
        engine.offsetY = 0;
        engine.render();
        document.getElementById('zoom-val').innerText = '100%';
    });

    // ==================== PROJECT IO ====================
    function getFormattedDate() {
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const dd = String(now.getDate()).padStart(2, '0');
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        const ss = String(now.getSeconds()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
    }

    document.getElementById('save-json-btn').addEventListener('click', () => {
        try {
            const data = JSON.stringify(engine.scene, null, 2);
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(data);
            const a = document.createElement('a');
            a.href = dataStr;
            a.download = `${getFormattedDate()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            console.error("Failed to save JSON:", err);
            alert("Error saving project. Check console.");
        }
    });

    document.getElementById('load-json-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const loadedScene = JSON.parse(event.target.result);
                if (Array.isArray(loadedScene)) {
                    engine.scene = loadedScene;
                    engine.clearSelection();
                    engine.render();
                    // Also update current tab data
                    const data = tabs.get(activeTabId);
                    if (data) data.scene = JSON.parse(JSON.stringify(loadedScene));
                    updateJsonEditor();
                    e.target.value = '';
                } else {
                    alert('Invalid project file format.');
                }
            } catch (err) {
                console.error(err);
                alert('Error parsing JSON file.');
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
            a.download = `${getFormattedDate()}.png`;
            a.click();
        });
    }

    // ==================== VASTU / NORTH / BG ====================
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
    toolsManager.setTool('select');
    canvasEl.classList.add('tool-select');
    renderTabBar();
});
