class ToolsManager {
    constructor(engine) {
        this.engine = engine;
        this.currentTool = null;
        this.state = {}; // to store temporary drawing state
        this.isSpaceDown = false;
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
                this.state.resizeHandle = handleHit.handle;
                this.state.dragItem = handleHit.item;
                this.state.origProps = { ...handleHit.item };
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
            this.state.isDrawing = true;
            this.state.startX = x;
            this.state.startY = y;
            this.state.endX = x;
            this.state.endY = y;
        }
        else if (this.currentTool === 'room') {
            this.state.isDrawing = true;
            this.state.startX = x;
            this.state.startY = y;
        }
        else if (typeof ElementRegistry !== 'undefined' && ElementRegistry.get(this.currentTool)) {
            const def = ElementRegistry.get(this.currentTool);
            const width = def.width;
            const height = def.height;
            const newItem = {
                id: `obj-${Math.random().toString(36).substr(2, 9)}`,
                type: 'object',
                subType: this.currentTool,
                x: x - width/2,
                y: y - height/2,
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
                const item = this.state.dragItem;
                const orig = this.state.origProps;
                
                if (item.type === 'wall' || item.type === 'measure') {
                    if (this.state.resizeHandle === 'start') {
                        item.startX = x;
                        item.startY = y;
                    } else if (this.state.resizeHandle === 'end') {
                        item.endX = x;
                        item.endY = y;
                    }
                } else if (item.type === 'room' || item.type === 'object') {
                    if (this.state.resizeHandle === 'br') {
                        item.width = Math.max(10, x - item.x);
                        item.height = Math.max(10, y - item.y);
                    } else if (this.state.resizeHandle === 'tl') {
                        const newW = orig.width + (orig.x - x);
                        const newH = orig.height + (orig.y - y);
                        if (newW >= 10) { item.x = x; item.width = newW; }
                        if (newH >= 10) { item.y = y; item.height = newH; }
                    } else if (this.state.resizeHandle === 'tr') {
                        const newW = Math.max(10, x - item.x);
                        const newH = orig.height + (orig.y - y);
                        item.width = newW;
                        if (newH >= 10) { item.y = y; item.height = newH; }
                    } else if (this.state.resizeHandle === 'bl') {
                        const newW = orig.width + (orig.x - x);
                        const newH = Math.max(10, y - item.y);
                        if (newW >= 10) { item.x = x; item.width = newW; }
                        item.height = newH;
                    }
                }
                this.engine.render();
                if (this.engine.onSelectionChange) this.engine.onSelectionChange(this.engine.selectedItems);
            } else if (this.state.isDragging) {
                const dx = x - this.state.startX;
                const dy = y - this.state.startY;
                
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
            this.state.endX = x;
            this.state.endY = y;
            this.engine.render();
        }
        else if (this.currentTool === 'room' && this.state.isDrawing) {
            this.state.endX = x;
            this.state.endY = y;
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
                    const thickness = inchVal * (this.engine.gridSize / 12);
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

        if (e.code === 'Space' && !this.isSpaceDown) {
            this.isSpaceDown = true;
            this.engine.canvas.style.cursor = 'grab';
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            this.engine.deleteSelected(); 
        }
        if (e.key === 'Escape') {
            this.engine.clearSelection();
            if (this.state.isDrawing) {
                this.state.isDrawing = false;
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
            if (['wall', 'room', 'door', 'window', 'stairs', 'bed', 'table', 'measure'].includes(this.currentTool)) {
                const mx = this.engine.snap(this.engine.mouseX);
                const my = this.engine.snap(this.engine.mouseY);
                ctx.fillStyle = 'rgba(99, 102, 241, 0.5)';
                ctx.beginPath();
                ctx.arc(mx, my, 4 / this.engine.scale, 0, Math.PI * 2);
                ctx.fill();
            }
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
