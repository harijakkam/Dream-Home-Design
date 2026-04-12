class ToolsManager {
    constructor(engine) {
        this.engine = engine;
        this.currentTool = null;
        this.state = {}; // to store temporary drawing state
        this.isSpaceDown = false;
        this.isShiftDown = false;  // tracks Shift key for ortho-lock
        this.clipboard = [];
        
        // Bind events
        const canvas = engine.canvas;
        canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
        document.addEventListener('keydown', this.onKeyDown.bind(this));
        document.addEventListener('keyup', this.onKeyUp.bind(this));
        
        this.engine.activeOverlayCallback = this.drawOverlay.bind(this);
    }

    setTool(toolName) {
        if (toolName === 'delete') {
            this.engine.deleteSelected();
            const btn = document.querySelector('[data-tool="select"]');
            if (btn) btn.click();
            return;
        }
        
        this.currentTool = toolName;
        this.state = {};
        
        if (toolName !== 'select') {
            this.engine.clearSelection();
        }
    }

    getHandleHit(x, y) {
        if (this.engine.selectedItems.length === 0) return null;
        // only allow resizing if a single item is selected
        if (this.engine.selectedItems.length > 1) return null;
        
        const item = this.engine.selectedItems[0];
        const tolerance = 12 / this.engine.scale;

        if (item.type === 'wall' || item.type === 'measure') {
            if (Math.hypot(item.startX - x, item.startY - y) < tolerance) return { item, handle: 'start' };
            if (Math.hypot(item.endX - x, item.endY - y) < tolerance) return { item, handle: 'end' };
        } else if (item.type === 'room' || item.type === 'object') {
            const corners = [
                { id: 'tl', cx: item.x, cy: item.y },
                { id: 'tr', cx: item.x + item.width, cy: item.y },
                { id: 'bl', cx: item.x, cy: item.y + item.height },
                { id: 'br', cx: item.x + item.width, cy: item.y + item.height }
            ];
            for (const c of corners) {
                if (Math.hypot(c.cx - x, c.cy - y) < tolerance) return { item, handle: c.id };
            }
        }
        return null;
    }

    getRelativePos(e) {
        const rect = this.engine.canvas.getBoundingClientRect();
        const clientX = e.clientX - rect.left;
        const clientY = e.clientY - rect.top;
        
        let x = (clientX - this.engine.offsetX) / this.engine.scale;
        let y = (clientY - this.engine.offsetY) / this.engine.scale;

        if (this.engine.snapToGrid) {
            x = this.engine.snap(x);
            y = this.engine.snap(y);
        }
        return { x, y };
    }

    getSnapPoint(x, y) {
        const threshold = 15 / this.engine.scale;
        for (const item of this.engine.scene) {
            if (item.type === 'wall' || item.type === 'measure') {
                // Center Snaps
                if (Math.hypot(item.startX - x, item.startY - y) < threshold) return { x: item.startX, y: item.startY };
                if (Math.hypot(item.endX - x, item.endY - y) < threshold) return { x: item.endX, y: item.endY };
                
                // Face Snaps (Side Snapping)
                if (item.type === 'wall' && item.thickness > 0) {
                    const dx = item.endX - item.startX;
                    const dy = item.endY - item.startY;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len > 0) {
                        const nx = -dy / len;
                        const ny = dx / len;
                        const off = item.thickness / 2;
                        const faces = [{x:item.startX+nx*off, y:item.startY+ny*off}, {x:item.startX-nx*off, y:item.startY-ny*off},
                                       {x:item.endX+nx*off, y:item.endY+ny*off}, {x:item.endX-nx*off, y:item.endY-ny*off}];
                        for (const f of faces) {
                            if (Math.hypot(f.x - x, f.y - y) < threshold) return f;
                        }
                    }
                }
            }
        }
        return null;
    }

    getAxisAlignments(x, y) {
        const threshold = 5 / this.engine.scale;
        const aligns = { x: null, y: null };
        
        for (const item of this.engine.scene) {
            const points = [];
            if (item.type === 'wall' || item.type === 'measure') {
                points.push({ x: item.startX, y: item.startY }, { x: item.endX, y: item.endY });
                
                // Add Face Alignment Points (for different wall thicknesses)
                if (item.type === 'wall' && item.thickness > 0) {
                    const dx = item.endX - item.startX;
                    const dy = item.endY - item.startY;
                    const len = Math.sqrt(dx*dx + dy*dy);
                    if (len > 0) {
                        const nx = -dy / len; // Normal X
                        const ny = dx / len;  // Normal Y
                        const off = item.thickness / 2;
                        
                        // Faces at each end
                        points.push({ x: item.startX + nx*off, y: item.startY + ny*off });
                        points.push({ x: item.startX - nx*off, y: item.startY - ny*off });
                        points.push({ x: item.endX + nx*off, y: item.endY + ny*off });
                        points.push({ x: item.endX - nx*off, y: item.endY - ny*off });
                    }
                }
            } else if (item.type === 'room' || item.type === 'object') {
                points.push({ x: item.x, y: item.y }, { x: item.x + item.width, y: item.y + item.height });
                // Also center points
                points.push({ x: item.x + item.width / 2, y: item.y + item.height / 2 });
            } else if (item.type === 'area_measure') {
                points.push(...item.points);
            }

            for (const p of points) {
                if (Math.abs(p.x - x) < threshold) aligns.x = p.x;
                if (Math.abs(p.y - y) < threshold) aligns.y = p.y;
            }
        }
        return aligns;
    }

    onMouseDown(e) {
        if(e.button !== 0 || e.altKey || this.engine.isPanning) return; // Left click only and not panning
        
        if (this.currentTool === 'pan' || this.isSpaceDown) {
            this.engine.startPan(e.clientX, e.clientY);
            return;
        }

        const { x, y } = this.getRelativePos(e);
        
        if (this.currentTool === 'select') {
            let hit = this.engine.hitTest(x, y);
            
            if (!hit && this.engine.selectedItems && this.engine.selectedItems.length > 1) {
                const bounds = this.engine.getSelectionBounds();
                if (bounds) {
                    const pad = 10 / this.engine.scale;
                    if (x >= bounds.minX - pad && x <= bounds.maxX + pad && 
                        y >= bounds.minY - pad && y <= bounds.maxY + pad) {
                        hit = this.engine.selectedItems[0];
                    }
                }
            }
            
            const handleHit = this.getHandleHit(x, y);
            
            if (handleHit) {
                this.state.isResizing = true;
                this.state.resizeItem = handleHit.item;
                this.state.handleId = handleHit.handle;
                this.state.initialItemProps = { ...handleHit.item };
                
                // Track initial position for sticky joints
                if (handleHit.item.type === 'wall' || handleHit.item.type === 'measure') {
                    this.state.initialHandleX = handleHit.handle === 'start' ? handleHit.item.startX : handleHit.item.endX;
                    this.state.initialHandleY = handleHit.handle === 'start' ? handleHit.item.startY : handleHit.item.endY;
                }
                this.engine.selectItem(handleHit.item);
            } else if (hit) {
                // Determine if we need to add to selection or set new selection
                if (e.shiftKey) {
                    this.engine.selectItem(hit, true);
                } else if (!this.engine.selectedItems.includes(hit)) {
                    this.engine.selectItem(hit);
                }
                
                this.state.isDragging = true;
                this.state.startX = x;
                this.state.startY = y;
                this.state.origPropsArray = this.engine.selectedItems.map(item => ({
                    item,
                    orig: { ...item }
                }));
            } else {
                if (!e.shiftKey) this.engine.clearSelection();
                this.state.isMarquee = true;
                this.state.startX = x;
                this.state.startY = y;
                this.state.endX = x;
                this.state.endY = y;
            }
        } 
        else if (this.currentTool === 'wall' || this.currentTool === 'measure') {
            const snap = this.getSnapPoint(x, y);
            const aligns = this.getAxisAlignments(x, y);
            
            let startX = snap ? snap.x : (aligns.x !== null ? aligns.x : x);
            let startY = snap ? snap.y : (aligns.y !== null ? aligns.y : y);
            
            this.state.isDrawing = true;
            this.state.startX = startX;
            this.state.startY = startY;
            this.state.endX = startX;
            this.state.endY = startY;
        }
        else if (this.currentTool === 'room') {
            this.state.isDrawing = true;
            this.state.startX = x;
            this.state.startY = y;
        }
        else if (this.currentTool === 'measure_area') {
            if (!this.state.points) {
                this.state.points = [{ x, y }];
                this.state.isDrawing = true;
            } else {
                const firstPoint = this.state.points[0];
                const distToFirst = Math.hypot(x - firstPoint.x, y - firstPoint.y);
                const threshold = 15 / this.engine.scale;

                if (distToFirst < threshold && this.state.points.length >= 3) {
                    // Close the shape and create persistent measure_area
                    const newItem = {
                        id: `area-${Math.random().toString(36).substr(2, 9)}`,
                        type: 'area_measure',
                        points: [...this.state.points]
                    };
                    this.engine.addShape(newItem);
                    this.state = {}; // Clear state
                    this.engine.selectItem(newItem);
                    const selBtn = document.querySelector('[data-tool="select"]');
                    if (selBtn) selBtn.click();
                } else {
                    // Just add the point if it's not close enough or not enough points yet
                    this.state.points.push({ x, y });
                }
            }
        }
        else if (typeof ElementRegistry !== 'undefined' && ElementRegistry.get(this.currentTool)) {
            const def = ElementRegistry.get(this.currentTool);
            const width = def.width;
            const height = def.height;
            const newItem = {
                id: `obj-${Math.random().toString(36).substr(2, 9)}`,
                type: 'object',
                subType: this.currentTool,
                x: Math.round((x - width/2) * 100) / 100,
                y: Math.round((y - height/2) * 100) / 100,
                width,
                height,
                rotation: 0
            };
            // Merge any extra properties (e.g., text, fontSize)
            if (def.extraProps) {
                Object.assign(newItem, JSON.parse(JSON.stringify(def.extraProps)));
            }
            this.engine.addShape(newItem);
            
            const selectBtn = document.querySelector('[data-tool="select"]');
            if (selectBtn && !selectBtn.classList.contains('active')) {
                selectBtn.click();
            }
            this.engine.selectItem(newItem);
        }
        
        this.engine.render();
    }

    onMouseMove(e) {
        const { x, y } = this.getRelativePos(e);
        
        if (this.currentTool === 'select') {
            if (this.state.isMarquee) {
                this.state.endX = x;
                this.state.endY = y;
                this.engine.render();
            } else if (this.state.isResizing) {
                const item = this.state.resizeItem;
                const handle = this.state.handleId;
                const snap = this.getSnapPoint(x, y);
                const aligns = this.getAxisAlignments(x, y);
                const targetX = snap ? snap.x : (aligns.x !== null ? aligns.x : x);
                const targetY = snap ? snap.y : (aligns.y !== null ? aligns.y : y);

                if (item.type === 'wall' || item.type === 'measure') {
                    const oldX = handle === 'start' ? item.startX : item.endX;
                    const oldY = handle === 'start' ? item.startY : item.endY;

                    if (handle === 'start') {
                        item.startX = targetX;
                        item.startY = targetY;
                    } else {
                        item.endX = targetX;
                        item.endY = targetY;
                    }

                    // Sticky Joins: Move connected walls together
                    if (this.engine.stickyWalls && this.state.initialHandleX !== undefined) {
                        for (const other of this.engine.scene) {
                            if (other === item) continue;
                            if (other.type === 'wall' || other.type === 'measure') {
                                if (other.startX === oldX && other.startY === oldY) {
                                    other.startX = targetX;
                                    other.startY = targetY;
                                }
                                if (other.endX === oldX && other.endY === oldY) {
                                    other.endX = targetX;
                                    other.endY = targetY;
                                }
                            }
                        }
                    }
                } else if (item.type === 'room' || item.type === 'object') {
                    const orig = this.state.initialItemProps;
                    if (handle === 'br') {
                        item.width = Math.max(10, x - item.x);
                        item.height = Math.max(10, y - item.y);
                    } else if (handle === 'tl') {
                        const newW = orig.width + (orig.x - x);
                        const newH = orig.height + (orig.y - y);
                        if (newW >= 10) { item.x = x; item.width = newW; }
                        if (newH >= 10) { item.y = y; item.height = newH; }
                    } else if (handle === 'tr') {
                        const newW = Math.max(10, x - item.x);
                        const newH = orig.height + (orig.y - y);
                        item.width = newW;
                        if (newH >= 10) { item.y = y; item.height = newH; }
                    } else if (handle === 'bl') {
                        const newW = orig.width + (orig.x - x);
                        const newH = Math.max(10, y - item.y);
                        if (newW >= 10) { item.x = x; item.width = newW; }
                        item.height = newH;
                    }
                }
                this.engine.render();
                if (this.engine.onSelectionChange) this.engine.onSelectionChange(this.engine.selectedItems);
            } else if (this.state.isDragging) {
                const snap = this.getSnapPoint(x, y);
                const aligns = this.getAxisAlignments(x, y);
                const tx = snap ? snap.x : (aligns.x !== null ? aligns.x : x);
                const ty = snap ? snap.y : (aligns.y !== null ? aligns.y : y);
                
                const dx = tx - this.state.startX;
                const dy = ty - this.state.startY;
                
                for (const {item, orig} of this.state.origPropsArray) {
                    if (item.type === 'room' || item.type === 'object') {
                        item.x = orig.x + dx;
                        item.y = orig.y + dy;
                    } else if (item.type === 'wall' || item.type === 'measure') {
                        item.startX = orig.startX + dx;
                        item.startY = orig.startY + dy;
                        item.endX = orig.endX + dx;
                        item.endY = orig.endY + dy;
                    }
                }
                this.engine.render();
                if (this.engine.onSelectionChange) this.engine.onSelectionChange(this.engine.selectedItems);
            } else {
                const handleHit = this.getHandleHit(x, y);
                if (handleHit) {
                    if (handleHit.item.type === 'room' || handleHit.item.type === 'object') {
                        if (['tl', 'br'].includes(handleHit.handle)) this.engine.canvas.style.cursor = 'nwse-resize';
                        else this.engine.canvas.style.cursor = 'nesw-resize';
                    } else {
                        this.engine.canvas.style.cursor = 'crosshair';
                    }
                } else if (this.engine.hitTest(x, y)) {
                    this.engine.canvas.style.cursor = 'move';
                } else {
                    this.engine.canvas.style.cursor = '';
                }
            }
        } 
        else if ((this.currentTool === 'wall' || this.currentTool === 'measure') && this.state.isDrawing) {
            const snap = this.getSnapPoint(x, y);
            const aligns = this.getAxisAlignments(x, y);
            let rawX = snap ? snap.x : (aligns.x !== null ? aligns.x : x);
            let rawY = snap ? snap.y : (aligns.y !== null ? aligns.y : y);

            // --- Ortho / Axis-Alignment Constraint ---
            const dx = rawX - this.state.startX;
            const dy = rawY - this.state.startY;
            const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);

            const forceOrtho = this.isShiftDown;
            const nearHoriz = angle < 15 || angle > 165;
            const nearVert  = (angle > 75 && angle < 105);
            const autoSnap  = !forceOrtho && (nearHoriz || nearVert);

            if (forceOrtho || autoSnap) {
                if (forceOrtho ? Math.abs(dx) > Math.abs(dy) : nearHoriz) {
                    rawY = this.state.startY;  // Lock horizontal
                } else {
                    rawX = this.state.startX;  // Lock vertical
                }
            }
            this.state.orthoAxis = (forceOrtho || autoSnap)
                ? ((rawY === this.state.startY) ? 'H' : 'V')
                : null;

            this.state.endX = rawX;
            this.state.endY = rawY;
            this.engine.render();
        }
        else if (this.currentTool === 'room' && this.state.isDrawing) {
            this.state.endX = x;
            this.state.endY = y;
            this.engine.render();
        }
        else if (this.currentTool === 'measure_area' && this.state.isDrawing) {
            this.state.currX = x;
            this.state.currY = y;
            this.engine.render();
        }
    }

    onMouseUp(e) {
        if (this.currentTool === 'select') {
            if (this.state.isMarquee) {
                const hits = this.engine.hitTestBox(this.state.startX, this.state.startY, this.state.endX, this.state.endY);
                if (e.shiftKey) {
                    const newSelection = new Set(this.engine.selectedItems);
                    hits.forEach(h => newSelection.add(h));
                    this.engine.setSelection(Array.from(newSelection));
                } else {
                    this.engine.setSelection(hits);
                }
            }
            if (this.state.isDragging || this.state.isResizing) {
                this.engine.triggerSceneChange();
            }
            this.state.isDragging = false;
            this.state.isResizing = false;
            this.state.isMarquee = false;
        }
        else if ((this.currentTool === 'wall' || this.currentTool === 'measure') && this.state.isDrawing) {
            this.state.isDrawing = false;
            if (this.state.startX !== this.state.endX || this.state.startY !== this.state.endY) {
                if (this.currentTool === 'wall') {
                    const thicknessInput = document.getElementById('wall-thickness');
                    const inchVal = thicknessInput ? parseInt(thicknessInput.value, 10) : 9;
                    const thickness = Math.round(inchVal * (this.engine.gridSize / 12) * 100) / 100;
                    const typeInput = document.getElementById('wall-line-type');
                    const lineType = typeInput ? typeInput.value : 'solid';
                    this.engine.addShape({
                        id: `wall-${Math.random().toString(36).substr(2, 9)}`,
                        type: 'wall',
                        startX: this.state.startX,
                        startY: this.state.startY,
                        endX: this.state.endX,
                        endY: this.state.endY,
                        thickness: thickness,
                        lineType: lineType,
                        altitude: 8
                    });
                } else {
                    this.engine.addShape({
                        id: `measure-${Math.random().toString(36).substr(2, 9)}`,
                        type: 'measure',
                        startX: this.state.startX,
                        startY: this.state.startY,
                        endX: this.state.endX,
                        endY: this.state.endY
                    });
                }
            }
        }
        else if (this.currentTool === 'room' && this.state.isDrawing) {
            this.state.isDrawing = false;
            const w = this.state.endX - this.state.startX;
            const h = this.state.endY - this.state.startY;
            
            if (Math.abs(w) > 10 && Math.abs(h) > 10) {
                this.engine.addShape({
                    id: `room-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'room',
                    x: Math.min(this.state.startX, this.state.endX),
                    y: Math.min(this.state.startY, this.state.endY),
                    width: Math.abs(w),
                    height: Math.abs(h)
                });
            }
        }
        this.engine.render();
    }

    onKeyDown(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        const isCmdOrCtrl = e.metaKey || e.ctrlKey;
        
        // Tool shortcuts
        if (!isCmdOrCtrl && !e.altKey && !e.shiftKey) {
            const keyMap = {
                'v': 'select', 's': 'select',
                'p': 'pan', 'h': 'pan',
                'w': 'wall',
                'r': 'room',
                'd': 'door',
                'i': 'window',
                't': 'text',
                'm': 'measure',
                'a': 'measure_area',
                'b': 'bed',
                'c': 'chair',
                'o': 'sofa'
            };
            const toolName = keyMap[e.key.toLowerCase()];
            if (toolName) {
                // Toggle to select/pan: if already on this tool, toggle between pan and select
                if (this.currentTool === toolName) {
                    const toggleName = toolName === 'pan' ? 'select' : 'pan';
                    const toggleBtn = document.querySelector(`.tool-btn[data-tool="${toggleName}"]`);
                    if (toggleBtn) toggleBtn.click();
                } else {
                    const btn = document.querySelector(`.tool-btn[data-tool="${toolName}"]`);
                    if (btn) btn.click();
                }
                return;
            }
        }
        
        if ((e.key === 'c' || e.key === 'C') && isCmdOrCtrl) {
            if (this.engine.selectedItems.length > 0) {
                this.clipboard = this.engine.selectedItems.map(item => ({ ...item }));
            }
        }
        if ((e.key === 'x' || e.key === 'X') && isCmdOrCtrl) {
            if (this.engine.selectedItems.length > 0) {
                this.clipboard = this.engine.selectedItems.map(item => ({ ...item }));
                this.engine.deleteSelected();
            }
        }
        if ((e.key === 'v' || e.key === 'V') && isCmdOrCtrl) {
            if (this.clipboard && this.clipboard.length > 0) {
                const newItems = [];
                const offset = this.engine.gridSize;
                
                for (const clipItem of this.clipboard) {
                    const newItem = { ...clipItem, id: `${clipItem.type}-${Math.random().toString(36).substr(2, 9)}` };
                    if (newItem.type === 'room' || newItem.type === 'object') {
                        newItem.x += offset;
                        newItem.y += offset;
                    } else if (newItem.type === 'wall' || newItem.type === 'measure') {
                        newItem.startX += offset;
                        newItem.startY += offset;
                        newItem.endX += offset;
                        newItem.endY += offset;
                    } else if (newItem.type === 'area_measure') {
                        newItem.points = newItem.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
                    }
                    this.engine.scene.push(newItem);
                    newItems.push(newItem);
                }
                
                this.clipboard = newItems.map(i => ({ ...i })); 
                this.engine.setSelection(newItems);
                this.engine.render();
                this.engine.triggerSceneChange();
                
                const selectBtn = document.querySelector('[data-tool="select"]');
                if (selectBtn && !selectBtn.classList.contains('active')) {
                    selectBtn.click();
                }
            }
        }
        if ((e.key === 'z' || e.key === 'Z') && isCmdOrCtrl) {
            e.preventDefault();
            this.engine.undo();
        }

        if (e.code === 'Space' && !this.isSpaceDown) {
            this.isSpaceDown = true;
            this.engine.canvas.style.cursor = 'grab';
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            this.engine.deleteSelected(); 
        }
        if (e.key === 'Enter') {
            if (this.currentTool === 'measure_area' && this.state.points && this.state.points.length >= 3) {
                const newItem = {
                    id: `area-${Math.random().toString(36).substr(2, 9)}`,
                    type: 'area_measure',
                    points: [...this.state.points]
                };
                this.engine.addShape(newItem);
                this.state = {};
                this.engine.selectItem(newItem);
                const selBtn = document.querySelector('[data-tool="select"]');
                if (selBtn) selBtn.click();
                this.engine.render();
            }
        }
        if (e.key === 'Escape') {
            this.engine.clearSelection();
            if (this.state.isDrawing) {
                this.state.isDrawing = false;
                this.state.points = null;
                this.engine.render();
            }
        }
    }

    onKeyUp(e) {
        if (e.code === 'Space') {
            this.isSpaceDown = false;
            this.engine.canvas.style.cursor = '';
        }
    }

    drawOverlay(ctx) {
        // Draw snap point indicator and axis alignment guides
        if (this.currentTool !== 'pan') {
            const mx = this.engine.mouseX;
            const my = this.engine.mouseY;
            const snap = this.getSnapPoint(mx, my);
            const aligns = this.getAxisAlignments(mx, my);

            ctx.save();
            ctx.lineWidth = 1 / this.engine.scale;
            ctx.setLineDash([4 / this.engine.scale, 4 / this.engine.scale]);
            ctx.strokeStyle = '#38bdf8'; // Sky-400 for smart guides

            const startX = -this.engine.offsetX / this.engine.scale;
            const endX = startX + this.engine.canvas.width / this.engine.scale;
            const startY = -this.engine.offsetY / this.engine.scale;
            const endY = startY + this.engine.canvas.height / this.engine.scale;

            if (aligns.x !== null) {
                ctx.beginPath();
                ctx.moveTo(aligns.x, startY);
                ctx.lineTo(aligns.x, endY);
                ctx.stroke();
            }
            if (aligns.y !== null) {
                ctx.beginPath();
                ctx.moveTo(startX, aligns.y);
                ctx.lineTo(endX, aligns.y);
                ctx.stroke();
            }
            ctx.restore();

            if (snap) {
                ctx.save();
                ctx.strokeStyle = '#22c55e'; // Green for snap
                ctx.lineWidth = 2 / this.engine.scale;
                ctx.beginPath();
                ctx.arc(snap.x, snap.y, 6 / this.engine.scale, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }
        }

        if (this.state.isMarquee) {
            ctx.save();
            ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.8)';
            ctx.lineWidth = 1 / this.engine.scale;
            ctx.setLineDash([5 / this.engine.scale, 5 / this.engine.scale]);
            const w = this.state.endX - this.state.startX;
            const h = this.state.endY - this.state.startY;
            ctx.fillRect(this.state.startX, this.state.startY, w, h);
            ctx.strokeRect(this.state.startX, this.state.startY, w, h);
            ctx.restore();
        }

        if (!this.state.isDrawing) {
            // Hover cursors crosshair mapping to snap grid
            if (['wall', 'room', 'door', 'window', 'stairs', 'bed', 'table', 'measure', 'measure_area'].includes(this.currentTool)) {
                const mx = this.engine.snap(this.engine.mouseX);
                const my = this.engine.snap(this.engine.mouseY);
                ctx.fillStyle = 'rgba(99, 102, 241, 0.5)';
                ctx.beginPath();
                ctx.arc(mx, my, 4 / this.engine.scale, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }

        if (this.currentTool === 'measure_area' && this.state.points) {
            const points = this.state.points;
            ctx.save();
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.7)'; // 70% opacity
            ctx.lineWidth = 2 / this.engine.scale;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            for (let i = 1; i < points.length; i++) {
                ctx.lineTo(points[i].x, points[i].y);
            }
            
            // Draw current segment to mouse
            if (this.state.currX !== undefined) {
                const first = points[0];
                const threshold = 15 / this.engine.scale;
                const isNearStart = Math.hypot(this.state.currX - first.x, this.state.currY - first.y) < threshold;

                if (isNearStart && points.length >= 3) {
                    ctx.strokeStyle = 'rgba(34, 197, 94, 0.7)'; // Green for closing
                    ctx.lineTo(first.x, first.y);
                } else {
                    ctx.lineTo(this.state.currX, this.state.currY);
                }
            }
            ctx.stroke();

            // Draw points
            ctx.fillStyle = '#6366f1';
            const r = 3 / this.engine.scale;
            for (const p of points) {
                ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
            }
            ctx.restore();
            return;
        }

        if (this.currentTool === 'wall' || this.currentTool === 'measure') {
            const isMeasure = this.currentTool === 'measure';
            ctx.save();
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
            if (isMeasure) {
                ctx.lineWidth = 2;
                ctx.setLineDash([8 / this.engine.scale, 6 / this.engine.scale]);
            } else {
                const thicknessInput = document.getElementById('wall-thickness');
                ctx.lineWidth = thicknessInput ? parseInt(thicknessInput.value, 10) : 6;
                const typeInput = document.getElementById('wall-line-type');
                if (typeInput && typeInput.value === 'dotted') {
                    ctx.setLineDash([15 / this.engine.scale, 10 / this.engine.scale]);
                }
            }
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(this.state.startX, this.state.startY);
            ctx.lineTo(this.state.endX, this.state.endY);
            ctx.stroke();
            if (!isMeasure) ctx.setLineDash([]);
            
            const dx = this.state.endX - this.state.startX;
            const dy = this.state.endY - this.state.startY;
            const lenFt = this.engine.pixelsToFeet(Math.sqrt(dx*dx + dy*dy));
            ctx.translate(this.state.startX + dx/2, this.state.startY + dy/2);
            let angle = Math.atan2(dy, dx);
            if (angle > Math.PI/2 || angle < -Math.PI/2) angle += Math.PI;
            ctx.rotate(angle);
            ctx.fillStyle = '#818cf8';
            const fontSize = 12 / this.engine.scale;
            ctx.font = `${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(lenFt, 0, -6 / this.engine.scale);
            ctx.restore();
        } 
        else if (this.currentTool === 'room') {
            ctx.fillStyle = 'rgba(99, 102, 241, 0.1)';
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
            ctx.lineWidth = 2;
            const x = Math.min(this.state.startX, this.state.endX);
            const y = Math.min(this.state.startY, this.state.endY);
            const w = Math.abs(this.state.endX - this.state.startX);
            const h = Math.abs(this.state.endY - this.state.startY);
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            
            const wFt = this.engine.pixelsToFeet(w);
            const hFt = this.engine.pixelsToFeet(h);
            ctx.fillStyle = '#818cf8';
            const fontSize = 12 / this.engine.scale;
            ctx.font = `${fontSize}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${wFt} × ${hFt}`, x + w/2, y + h/2);
        }
    }
}
