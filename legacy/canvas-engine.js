class CanvasEngine {
    constructor(canvasEl) {
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext('2d');
        this.scene = [];
        this.selectedItems = [];
        this.onSelectionChange = null;

        // Settings
        this.gridSize = 25;
        this.snapToGrid = true;

        this.scale = 1;
        this.showVastu = false;
        this.showGrid = true;
        this.showCrosshairs = false;
        this.stickyWalls = true;
        this.hideStructure = false;
        this.northAngle = 0;
        this.isLoading = false;

        // Callback bindings
        this.onSelectionChange = null;
        this.activeOverlayCallback = null;
        this.onSceneChange = null;

        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;

        this.mouseX = 0;
        this.mouseY = 0;

        // Contrast color cache
        this._lastBgColor = null;
        this.isLightBg = false;
        this.compColor = '#cbd5e1';
        this.wallColor = '#94a3b8';
        this.compFill = 'rgba(255, 255, 255, 0.05)';
        this.baseText = '#94a3b8';
        this.gridColor = 'rgba(255, 255, 255, 0.05)';
        this.exportWallColor = '#334155';

        // Undo history
        this.undoStack = [];
        this.maxUndoSteps = 50;
        this._undoLock = false;

        this.resize();
        this.setupPanAndZoom();

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const clientX = e.clientX - rect.left;
            const clientY = e.clientY - rect.top;
            this.mouseX = (clientX - this.offsetX) / this.scale;
            this.mouseY = (clientY - this.offsetY) / this.scale;
            if (!this.isPanning) this.render();
        });

        this.updateContrastColors();
        this.render();
    }

    /**
     * Recomputes contrast/complementary colors only when bgColor actually changes.
     * Called from render() but skips if bgColor hasn't changed — O(1) check each frame.
     */
    updateContrastColors() {
        const bg = this.bgColor || '#1e1e22';
        if (bg === this._lastBgColor) return;
        this._lastBgColor = bg;

        let r = 0, g = 0, b = 0;
        if (bg.startsWith('#')) {
            const hex = bg.replace('#', '');
            r = parseInt(hex.substr(0, 2), 16) || 0;
            g = parseInt(hex.substr(2, 2), 16) || 0;
            b = parseInt(hex.substr(4, 2), 16) || 0;
        }

        // ITU-R BT.709 Luma
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        this.isLightBg = luma > 128;

        let cr = 255 - r, cg = 255 - g, cb = 255 - b;
        const diff = Math.abs(cr - r) + Math.abs(cg - g) + Math.abs(cb - b);
        if (diff < 80) {
            cr = this.isLightBg ? 0 : 255;
            cg = this.isLightBg ? 0 : 255;
            cb = this.isLightBg ? 0 : 255;
        }

        this.compColor = `rgb(${cr}, ${cg}, ${cb})`;
        this.wallColor = `rgb(${cr}, ${cg}, ${cb})`;
        this.compFill = `rgba(${cr}, ${cg}, ${cb}, 0.15)`;
        this.exportWallColor = `rgb(${Math.max(0, cr - 40)}, ${Math.max(0, cg - 40)}, ${Math.max(0, cb - 40)})`;
        this.baseText = this.exportWallColor;
        this.gridColor = `rgba(${cr}, ${cg}, ${cb}, 0.2)`;
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.render();
    }

    setupPanAndZoom() {
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            this.zoomAtPosition(mx, my, this.scale * zoomFactor);
        }, { passive: false });

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1 || (e.button === 0 && e.altKey)) {
                this.startPan(e.clientX, e.clientY);
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isPanning) {
                this.offsetX = e.clientX - this.panStartX;
                this.offsetY = e.clientY - this.panStartY;
                this.render();
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (this.isPanning) {
                this.isPanning = false;
                this.canvas.style.cursor = '';
            }
        });
    }

    startPan(clientX, clientY) {
        this.isPanning = true;
        this.panStartX = clientX - this.offsetX;
        this.panStartY = clientY - this.offsetY;
        this.canvas.style.cursor = 'grabbing';
    }

    zoomAtPosition(x, y, newScale) {
        newScale = Math.max(0.1, Math.min(newScale, 5));
        this.offsetX = x - (x - this.offsetX) * (newScale / this.scale);
        this.offsetY = y - (y - this.offsetY) * (newScale / this.scale);
        this.scale = newScale;
        this.render();
        const zoomLabel = document.getElementById('zoom-val');
        if (zoomLabel) {
            const display = Math.round(this.scale * 100) + '%';
            if (zoomLabel.tagName === 'INPUT') {
                zoomLabel.value = display;
            } else {
                zoomLabel.innerText = display;
            }
        }
    }

    setZoom(level) {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        this.zoomAtPosition(cx, cy, level);
    }

    clearScene() {
        this.scene = [];
        this.clearSelection();
        this.render();
        this.triggerSceneChange();
    }

    addShape(shape) {
        this.scene.push(shape);
        this.render();
        this.triggerSceneChange();
    }

    removeShape(shape) {
        this.scene = this.scene.filter(s => s !== shape);
        this.render();
        this.triggerSceneChange();
    }

    triggerSceneChange() {
        if (!this._undoLock) {
            this.undoStack.push(JSON.parse(JSON.stringify(this.scene)));
            if (this.undoStack.length > this.maxUndoSteps) {
                this.undoStack.shift();
            }
        }
        if (this.onSceneChange) this.onSceneChange();
    }

    undo() {
        if (this.undoStack.length === 0) return false;
        this._undoLock = true;
        this.scene = this.undoStack.pop();
        this.clearSelection();
        this.render();
        this._undoLock = false;
        if (this.onSceneChange) this.onSceneChange();
        return true;
    }

    selectItem(item, keepExisting = false) {
        if (!item) {
            if (!keepExisting) this.clearSelection();
            return;
        }
        if (keepExisting) {
            if (!this.selectedItems.includes(item)) {
                this.selectedItems.push(item);
            } else {
                this.selectedItems = this.selectedItems.filter(i => i !== item);
            }
        } else {
            this.selectedItems = [item];
        }
        if (this.onSelectionChange) this.onSelectionChange(this.selectedItems);
        this.render();
    }

    setSelection(items) {
        this.selectedItems = [...items];
        if (this.onSelectionChange) this.onSelectionChange(this.selectedItems);
        this.render();
    }

    clearSelection() {
        if (this.selectedItems.length === 0) return;
        this.selectedItems = [];
        if (this.onSelectionChange) this.onSelectionChange(this.selectedItems);
        this.render();
    }

    deleteSelected() {
        this.selectedItems.forEach(item => this.removeShape(item));
        this.selectedItems = [];
        if (this.onSelectionChange) this.onSelectionChange(this.selectedItems);
        this.render();
        this.triggerSceneChange();
    }

    exportToDataURL() {
        // Redraw without grid or selection highlights
        this.render(false);
        const dataURL = this.canvas.toDataURL('image/png');
        // Re-render with grid and selection highlights
        this.render();
        return dataURL;
    }

    snap(value) {
        if (!this.snapToGrid) return value;
        const inchPx = this.gridSize / 12;
        const snapped = Math.round(value / inchPx) * inchPx;
        return Math.round(snapped * 100) / 100;
    }

    pixelsToFeet(px) {
        const totalInches = Math.round(px / (this.gridSize / 12));
        const ft = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
        if (ft === 0) return `${inches}"`;
        if (inches === 0) return `${ft}'`;
        return `${ft}' ${inches}"`;
    }

    // Generic point-in-shape and distance-to-line hit detection
    hitTest(x, y) {
        // Iterate backwards to pick top-most item
        for (let i = this.scene.length - 1; i >= 0; i--) {
            const item = this.scene[i];

            if (item.type === 'room' || item.type === 'object') {
                if (x >= item.x && x <= item.x + item.width &&
                    y >= item.y && y <= item.y + item.height) {
                    return item;
                }
            } else if (item.type === 'wall' || item.type === 'measure') {
                // Distance from point to line segment
                const dist = this.distToSegment(
                    { x, y },
                    { x: item.startX, y: item.startY },
                    { x: item.endX, y: item.endY }
                );
                if (dist < 8) return item; // 8px tolerance
            } else if (item.type === 'area_measure') {
                // Check if point is inside the polygon (even if it's just lines, we usually hit test the fill area for measurement)
                let inside = false;
                for (let i = 0, j = item.points.length - 1; i < item.points.length; j = i++) {
                    const xi = item.points[i].x, yi = item.points[i].y;
                    const xj = item.points[j].x, yj = item.points[j].y;
                    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                    if (intersect) inside = !inside;
                }
                if (inside) return item;
                // Or check distance to segments
                for (let i = 0, j = item.points.length - 1; i < item.points.length; j = i++) {
                    const dist = this.distToSegment({ x, y }, item.points[i], item.points[j]);
                    if (dist < 8) return item;
                }
            }
        }
        return null;
    }

    hitTestBox(x1, y1, x2, y2) {
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);

        const selected = [];
        for (const item of this.scene) {
            if (item.type === 'room' || item.type === 'object') {
                if (item.x + item.width >= minX && item.x <= maxX &&
                    item.y + item.height >= minY && item.y <= maxY) {
                    selected.push(item);
                }
            } else if (item.type === 'wall' || item.type === 'measure') {
                const wMinX = Math.min(item.startX, item.endX);
                const wMaxX = Math.max(item.startX, item.endX);
                const wMinY = Math.min(item.startY, item.endY);
                const wMaxY = Math.max(item.startY, item.endY);

                if (wMaxX >= minX && wMinX <= maxX &&
                    wMaxY >= minY && wMinY <= maxY) {
                    selected.push(item);
                }
            } else if (item.type === 'area_measure') {
                const aMinX = Math.min(...item.points.map(p => p.x));
                const aMaxX = Math.max(...item.points.map(p => p.x));
                const aMinY = Math.min(...item.points.map(p => p.y));
                const aMaxY = Math.max(...item.points.map(p => p.y));
                if (aMaxX >= minX && aMinX <= maxX && aMaxY >= minY && aMinY <= maxY) {
                    selected.push(item);
                }
            }
        }
        return selected;
    }

    getSelectionBounds() {
        if (!this.selectedItems || this.selectedItems.length <= 1) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const item of this.selectedItems) {
            if (item.type === 'room' || item.type === 'object') {
                minX = Math.min(minX, item.x);
                minY = Math.min(minY, item.y);
                maxX = Math.max(maxX, item.x + item.width);
                maxY = Math.max(maxY, item.y + item.height);
            } else if (item.type === 'wall' || item.type === 'measure') {
                minX = Math.min(minX, item.startX, item.endX);
                minY = Math.min(minY, item.startY, item.endY);
                maxX = Math.max(maxX, item.startX, item.endX);
                maxY = Math.max(maxY, item.startY, item.endY);
            } else if (item.type === 'area_measure') {
                minX = Math.min(minX, ...item.points.map(p => p.x));
                minY = Math.min(minY, ...item.points.map(p => p.y));
                maxX = Math.max(maxX, ...item.points.map(p => p.x));
                maxY = Math.max(maxY, ...item.points.map(p => p.y));
            }
        }
        return { minX, minY, maxX, maxY };
    }

    sqr(x) { return x * x }
    dist2(v, w) { return this.sqr(v.x - w.x) + this.sqr(v.y - w.y) }
    distToSegmentSquared(p, v, w) {
        const l2 = this.dist2(v, w);
        if (l2 === 0) return this.dist2(p, v);
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return this.dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) });
    }
    distToSegment(p, v, w) { return Math.sqrt(this.distToSegmentSquared(p, v, w)); }

    buildJointCache() {
        this.jointCache = new Map();
        const eps = 0.1;
        const getK = (x, y) => `${Math.round(x / eps) * eps},${Math.round(y / eps) * eps}`;
        for (const s of this.scene) {
            if (s.type !== 'wall' && s.type !== 'measure') continue;
            const k1 = getK(s.startX, s.startY);
            const k2 = getK(s.endX, s.endY);
            if (!this.jointCache.has(k1)) this.jointCache.set(k1, []);
            if (!this.jointCache.has(k2)) this.jointCache.set(k2, []);
            this.jointCache.get(k1).push(s.id);
            this.jointCache.get(k2).push(s.id);
        }
    }

    render(drawBackgroundAndGrid = true) {
        if (!this.ctx) return;
        this.buildJointCache();

        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        // 1. Clear background
        if (drawBackgroundAndGrid) {
            this.ctx.fillStyle = this.bgColor || getComputedStyle(document.body).getPropertyValue('--bg-canvas').trim() || '#1e1e22';
        } else {
            this.ctx.fillStyle = this.bgColor || '#ffffff';
        }
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        // Update contrast colors (cached — only recomputes when bgColor changes)
        this.updateContrastColors();

        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);

        // 2. Draw grid
        if (drawBackgroundAndGrid && this.showGrid) {
            this.ctx.strokeStyle = this.gridColor;
            this.ctx.lineWidth = 1 / this.scale;
            this.ctx.beginPath();

            const startX = -this.offsetX / this.scale;
            const endX = startX + this.canvas.width / this.scale;
            const startY = -this.offsetY / this.scale;
            const endY = startY + this.canvas.height / this.scale;

            const firstLineX = Math.floor(startX / this.gridSize) * this.gridSize;
            const firstLineY = Math.floor(startY / this.gridSize) * this.gridSize;

            for (let x = firstLineX; x <= endX; x += this.gridSize) {
                this.ctx.moveTo(x, startY);
                this.ctx.lineTo(x, endY);
            }
            for (let y = firstLineY; y <= endY; y += this.gridSize) {
                this.ctx.moveTo(startX, y);
                this.ctx.lineTo(endX, y);
            }
            this.ctx.stroke();
        }

        // 3. Draw scene items
        for (const shape of this.scene) {
            this.drawShape(shape, true);
        }

        if (this.selectedItems && this.selectedItems.length > 1) {
            const b = this.getSelectionBounds();
            if (b) {
                this.ctx.save();
                this.ctx.strokeStyle = '#38bdf8';
                this.ctx.lineWidth = 1.5 / this.scale;
                this.ctx.setLineDash([6 / this.scale, 4 / this.scale]);

                const pad = 10 / this.scale;
                const bx = b.minX - pad;
                const by = b.minY - pad;
                const bw = (b.maxX - b.minX) + pad * 2;
                const bh = (b.maxY - b.minY) + pad * 2;

                this.ctx.strokeRect(bx, by, bw, bh);
                this.ctx.fillStyle = 'rgba(56, 189, 248, 0.04)';
                this.ctx.fillRect(bx, by, bw, bh);
                this.ctx.restore();
            }
        }

        // 4. Draw Cursor Crosshairs if enabled
        if (drawBackgroundAndGrid && this.showCrosshairs && !this.isPanning) {
            this.ctx.save();
            this.ctx.strokeStyle = this.isLightBg ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.15)';
            this.ctx.lineWidth = 1 / this.scale;
            this.ctx.setLineDash([5 / this.scale, 5 / this.scale]);

            const startX = -this.offsetX / this.scale;
            const endX = startX + this.canvas.width / this.scale;
            const startY = -this.offsetY / this.scale;
            const endY = startY + this.canvas.height / this.scale;

            // Vertical line
            this.ctx.beginPath();
            this.ctx.moveTo(this.mouseX, startY);
            this.ctx.lineTo(this.mouseX, endY);
            this.ctx.stroke();

            // Horizontal line
            this.ctx.beginPath();
            this.ctx.moveTo(startX, this.mouseY);
            this.ctx.lineTo(endX, this.mouseY);
            this.ctx.stroke();

            this.ctx.restore();
        }

        if (this.activeOverlayCallback) {
            this.activeOverlayCallback(this.ctx);
        }

        if (this.showVastu) {
            this.drawVastuGrid();
        }

        this.drawCornerAngles();

        this.ctx.restore();
    }

    isJoint(x, y, id) {
        if (!this.jointCache) return false;
        const eps = 0.1;
        const k = `${Math.round(x / eps) * eps},${Math.round(y / eps) * eps}`;
        const IDs = this.jointCache.get(k);
        if (!IDs) return false;
        return IDs.some(otherId => otherId !== id);
    } drawWallOrMeasure(shape, isInteractive, isSelected) {
        const isMeasure = shape.type === 'measure';
        this.ctx.save();

        if (isInteractive) {
            this.ctx.strokeStyle = isSelected ? '#6366f1' : this.wallColor;
        } else {
            this.ctx.strokeStyle = isMeasure ? this.wallColor : this.exportWallColor;
        }

        this.ctx.lineWidth = isMeasure ? 2 : (shape.thickness || 6);
        if (isMeasure) this.ctx.setLineDash([8 / this.scale, 6 / this.scale]);
        else if (shape.lineType === 'dotted') this.ctx.setLineDash([15 / this.scale, 10 / this.scale]);

        this.ctx.lineCap = 'square';
        this.ctx.lineJoin = 'miter';

        this.ctx.beginPath();
        this.ctx.moveTo(shape.startX, shape.startY);
        this.ctx.lineTo(shape.endX, shape.endY);
        this.ctx.stroke();

        if (isMeasure || shape.lineType === 'dotted') this.ctx.setLineDash([]);

        // Handles/Joints
        if (isInteractive) {
            const r = 4 / this.scale;
            const isStartJoint = this.isJoint(shape.startX, shape.startY, shape.id);
            const isEndJoint = this.isJoint(shape.endX, shape.endY, shape.id);
            const standardColor = this.isLightBg ? '#000000' : '#ffffff';
            const jointColor = '#22c55e';

            this.ctx.fillStyle = isStartJoint ? jointColor : standardColor;
            this.ctx.fillRect(shape.startX - r, shape.startY - r, r * 2, r * 2);
            this.ctx.fillStyle = isEndJoint ? jointColor : standardColor;
            this.ctx.fillRect(shape.endX - r, shape.endY - r, r * 2, r * 2);
        }

        // Text
        const dx = shape.endX - shape.startX;
        const dy = shape.endY - shape.startY;
        const len = Math.sqrt(dx * dx + dy * dy);
        const midX = shape.startX + dx / 2;
        const midY = shape.startY + dy / 2;

        this.ctx.save();
        this.ctx.translate(midX, midY);
        let textAngle = Math.atan2(dy, dx);
        if (textAngle > Math.PI / 2 || textAngle < -Math.PI / 2) textAngle += Math.PI;
        this.ctx.rotate(textAngle);

        this.ctx.fillStyle = isInteractive ? (isSelected ? '#6366f1' : this.baseText) : this.baseText;
        const fontSize = 12 / this.scale;
        this.ctx.font = `${fontSize}px Inter, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'bottom';
        const lenFt = this.pixelsToFeet(len);
        this.ctx.fillText(lenFt, 0, -6 / this.scale);
        this.ctx.restore();

        this.ctx.restore();
    }

    drawRoom(shape, isInteractive, isSelected) {
        this.ctx.save();
        this.ctx.fillStyle = isSelected ? 'rgba(99, 102, 241, 0.2)' : this.compFill;
        this.ctx.strokeStyle = isSelected ? '#6366f1' : this.compColor;
        this.ctx.lineWidth = 2;

        this.ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);

        // Text
        this.ctx.fillStyle = isInteractive ? (isSelected ? '#6366f1' : this.baseText) : this.baseText;
        const fontSize = 12 / this.scale;
        this.ctx.font = `600 ${fontSize}px Inter, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const wFt = this.pixelsToFeet(shape.width);
        const hFt = this.pixelsToFeet(shape.height);
        this.ctx.fillText(`${wFt} \u00d7 ${hFt}`, shape.x + shape.width / 2, shape.y + shape.height / 2);

        if (isSelected) {
            const r = 4 / this.scale;
            this.ctx.fillStyle = '#6366f1';
            this.ctx.fillRect(shape.x - r, shape.y - r, r * 2, r * 2);
            this.ctx.fillRect(shape.x + shape.width - r, shape.y - r, r * 2, r * 2);
            this.ctx.fillRect(shape.x - r, shape.y + shape.height - r, r * 2, r * 2);
            this.ctx.fillRect(shape.x + shape.width - r, shape.y + shape.height - r, r * 2, r * 2);
        }
        this.ctx.restore();
    }

    drawObject(shape, isInteractive, isSelected) {
        this.ctx.save();
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        this.ctx.translate(cx, cy);

        const rot = shape.rotation || 0;
        this.ctx.rotate(rot * Math.PI / 180);
        this.ctx.scale(shape.flipX ? -1 : 1, shape.flipY ? -1 : 1);

        const localW = (rot % 180 !== 0) ? shape.height : shape.width;
        const localH = (rot % 180 !== 0) ? shape.width : shape.height;
        const hw = localW / 2;
        const hh = localH / 2;

        this.ctx.strokeStyle = isInteractive ? (isSelected ? '#6366f1' : this.compColor) : this.exportWallColor;
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.fillStyle = isInteractive ? (isSelected ? 'rgba(99, 102, 241, 0.1)' : this.compFill) : (this.isLightBg ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.4)");

        // Registry-based drawing
        const elementDef = (typeof ElementRegistry !== 'undefined') ? ElementRegistry.get(shape.subType) : null;
        if (elementDef && elementDef.draw) {
            const colors = { textColor: isInteractive ? (isSelected ? '#6366f1' : this.compColor) : this.exportWallColor };
            elementDef.draw(this.ctx, hw, hh, localW, localH, this.scale, shape, colors);
        } else {
            this.ctx.fillRect(-hw, -hh, localW, localH);
            this.ctx.strokeRect(-hw, -hh, localW, localH);
        }

        if (isSelected) {
            // Drop back to global coordinates for handles to prevent rotation skewing
            this.ctx.restore();
            this.ctx.save();
            this.ctx.translate(this.offsetX, this.offsetY);
            this.ctx.scale(this.scale, this.scale);

            const r = 4 / this.scale;
            this.ctx.fillStyle = '#6366f1';
            this.ctx.fillRect(shape.x - r, shape.y - r, r * 2, r * 2);
            this.ctx.fillRect(shape.x + shape.width - r, shape.y - r, r * 2, r * 2);
            this.ctx.fillRect(shape.x - r, shape.y + shape.height - r, r * 2, r * 2);
            this.ctx.fillRect(shape.x + shape.width - r, shape.y + shape.height - r, r * 2, r * 2);
        }
        this.ctx.restore();
    }

    drawShape(shape, isInteractive) {
        if (this.hideStructure && (shape.type === 'wall' || shape.type === 'room')) {
            if (!isInteractive) return;
        }

        const isSelected = this.selectedItems.includes(shape);

        switch (shape.type) {
            case 'wall':
            case 'measure':
                this.drawWallOrMeasure(shape, isInteractive, isSelected);
                break;
            case 'room':
                this.drawRoom(shape, isInteractive, isSelected);
                break;
            case 'object':
                this.drawObject(shape, isInteractive, isSelected);
                break;
            case 'area_measure':
                this.drawAreaMeasure(shape, isInteractive, isSelected);
                break;
        }
    }

    drawAreaMeasure(shape, isInteractive, isSelected) {
        this.ctx.save();
        this.ctx.strokeStyle = isSelected ? '#6366f1' : 'rgba(99, 102, 241, 0.7)';
        this.ctx.lineWidth = 2 / this.scale;
        this.ctx.fillStyle = isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.05)';

        this.ctx.beginPath();
        this.ctx.moveTo(shape.points[0].x, shape.points[0].y);
        for (let i = 1; i < shape.points.length; i++) {
            this.ctx.lineTo(shape.points[i].x, shape.points[i].y);
        }
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.fill();

        // Calculate Area (Shoelace Formula)
        let areaPx = 0;
        let sumX = 0, sumY = 0;
        for (let i = 0; i < shape.points.length; i++) {
            const current = shape.points[i];
            const next = shape.points[(i + 1) % shape.points.length];
            areaPx += current.x * next.y;
            areaPx -= next.x * current.y;
            sumX += current.x;
            sumY += current.y;
        }
        areaPx = Math.abs(areaPx) / 2;
        const areaSqFt = areaPx / (this.gridSize * this.gridSize);
        const centerX = sumX / shape.points.length;
        const centerY = sumY / shape.points.length;

        this.ctx.fillStyle = isSelected ? '#6366f1' : this.baseText;
        const fontSize = 14 / this.scale;
        this.ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(`${areaSqFt.toFixed(2)} sq. ft`, centerX, centerY);

        // Render points if selected
        if (isSelected) {
            this.ctx.fillStyle = '#6366f1';
            const r = 4 / this.scale;
            for (const p of shape.points) {
                this.ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
            }
        }
        this.ctx.restore();
    }

    drawCornerAngles() {
        const walls = this.scene.filter(s => s.type === 'wall');
        if (walls.length < 2) return;

        const points = {};
        for (const wall of walls) {
            const p1 = `${wall.startX},${wall.startY}`;
            const p2 = `${wall.endX},${wall.endY}`;
            if (!points[p1]) points[p1] = [];
            if (!points[p2]) points[p2] = [];
            points[p1].push({ vx: wall.endX - wall.startX, vy: wall.endY - wall.startY, wall });
            points[p2].push({ vx: wall.startX - wall.endX, vy: wall.startY - wall.endY, wall });
        }

        this.ctx.save();
        this.ctx.lineWidth = 1.5 / this.scale;

        for (const key in points) {
            const lines = points[key];
            if (lines.length === 2) {
                const [cx, cy] = key.split(',').map(Number);

                const l1 = lines[0];
                const l2 = lines[1];

                let a1 = Math.atan2(l1.vy, l1.vx);
                let a2 = Math.atan2(l2.vy, l2.vx);

                if (a1 > a2) {
                    const temp = a1; a1 = a2; a2 = temp;
                }

                let diff = a2 - a1;
                let startAngle = a1;
                let endAngle = a2;

                if (diff > Math.PI) {
                    diff = 2 * Math.PI - diff;
                    startAngle = a2;
                    endAngle = a1 + 2 * Math.PI;
                }

                const angleDeg = Math.round(diff * 180 / Math.PI);

                const r = 24 / this.scale;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, r, startAngle, endAngle);
                this.ctx.strokeStyle = 'rgba(99, 102, 241, 0.7)';
                this.ctx.stroke();

                const bisectAngle = startAngle + diff / 2;
                const txtR = r + (10 / this.scale);
                const tx = cx + Math.cos(bisectAngle) * txtR;
                const ty = cy + Math.sin(bisectAngle) * txtR;

                this.ctx.fillStyle = 'rgba(99, 102, 241, 0.9)';
                const fontSize = 10 / this.scale;
                this.ctx.font = `${fontSize}px Inter, sans-serif`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(`${angleDeg}°`, tx, ty);
            }
        }

        this.ctx.restore();
    }

    getSceneBounds() {
        if (this.scene.length === 0) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let hasGeometry = false;

        for (const item of this.scene) {
            if (item.type === 'measure') continue;

            hasGeometry = true;
            if (item.type === 'room' || item.type === 'object') {
                minX = Math.min(minX, item.x);
                minY = Math.min(minY, item.y);
                maxX = Math.max(maxX, item.x + item.width);
                maxY = Math.max(maxY, item.y + item.height);
            } else if (item.type === 'wall') {
                minX = Math.min(minX, item.startX, item.endX);
                minY = Math.min(minY, item.startY, item.endY);
                maxX = Math.max(maxX, item.startX, item.endX);
                maxY = Math.max(maxY, item.startY, item.endY);
            } else if (item.type === 'area_measure') {
                for (const p of item.points) {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                }
            }
        }
        return hasGeometry ? { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY } : null;
    }

    zoomToFit() {
        const bounds = this.getSceneBounds();
        if (!bounds) {
            this.setZoom(1);
            this.offsetX = 0;
            this.offsetY = 0;
            this.render();
            return;
        }

        const padding = 50;
        const availableW = this.canvas.width - padding * 2;
        const availableH = this.canvas.height - padding * 2;

        let scale = Math.min(availableW / bounds.w, availableH / bounds.h);
        // Clamp scale to sensible limits (e.g., 0.2 to 2.0 when fitting)
        scale = Math.max(0.1, Math.min(scale, 2.0));

        this.scale = scale;
        this.offsetX = (this.canvas.width / 2) - ((bounds.minX + bounds.maxX) / 2) * scale;
        this.offsetY = (this.canvas.height / 2) - ((bounds.minY + bounds.maxY) / 2) * scale;

        this.render();
        const zoomInput = document.getElementById('zoom-val');
        if (zoomInput) {
            const display = Math.round(this.scale * 100) + '%';
            if (zoomInput.tagName === 'INPUT') zoomInput.value = display;
            else zoomInput.innerText = display;
        }
    }

    drawVastuGrid() {
        const bounds = this.getSceneBounds();
        if (!bounds) return;

        const cellW = bounds.w / 3;
        const cellH = bounds.h / 3;

        const vastuZones = [
            { name: 'North', bg: 'rgba(56, 189, 248, 0.2)', desc: 'Wealth / Light' }, // 0
            { name: 'Eesanyam (NE)', bg: 'rgba(59, 130, 246, 0.4)', desc: 'Pooja / Water' }, // 1
            { name: 'East', bg: 'rgba(251, 146, 60, 0.2)', desc: 'Living / Entrances' }, // 2
            { name: 'Aagneya (SE)', bg: 'rgba(249, 115, 22, 0.4)', desc: 'Kitchen / Fire' }, // 3
            { name: 'South', bg: 'rgba(239, 68, 68, 0.2)', desc: 'Closed / Heavy' }, // 4
            { name: 'Nairuthi (SW)', bg: 'rgba(120, 113, 108, 0.55)', desc: 'Master Bed' }, // 5
            { name: 'West', bg: 'rgba(148, 163, 184, 0.2)', desc: 'Study / Dining' }, // 6
            { name: 'Vayuvya (NW)', bg: 'rgba(156, 163, 175, 0.4)', desc: 'Guest / Toilets' } // 7
        ];

        const brahmasthan = { name: 'Brahmasthan', bg: 'rgba(250, 204, 21, 0.35)', desc: 'Empty / Center' };

        // Determine dynamic assignment of zones
        const zones = [];
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                if (row === 1 && col === 1) {
                    zones.push({ col, row, ...brahmasthan });
                    continue;
                }

                let boxAngle = 0;
                if (row === 0 && col === 0) boxAngle = 315;
                else if (row === 0 && col === 1) boxAngle = 0;
                else if (row === 0 && col === 2) boxAngle = 45;
                else if (row === 1 && col === 2) boxAngle = 90;
                else if (row === 2 && col === 2) boxAngle = 135;
                else if (row === 2 && col === 1) boxAngle = 180;
                else if (row === 2 && col === 0) boxAngle = 225;
                else if (row === 1 && col === 0) boxAngle = 270;

                const offsetAngle = this.northAngle || 0;
                // Difference between box's conceptual angle to UP with North's offset angle
                let zoneAngle = (boxAngle - offsetAngle + 360) % 360;
                let zoneIndex = Math.round(zoneAngle / 45) % 8;

                zones.push({ col, row, ...vastuZones[zoneIndex] });
            }
        }

        this.ctx.save();

        this.ctx.strokeStyle = '#6366f1';
        this.ctx.lineWidth = 3 / this.scale;
        this.ctx.setLineDash([15 / this.scale, 10 / this.scale]);
        this.ctx.strokeRect(bounds.minX, bounds.minY, bounds.w, bounds.h);
        this.ctx.setLineDash([]);

        for (const zone of zones) {
            const bx = bounds.minX + (zone.col * cellW);
            const by = bounds.minY + (zone.row * cellH);

            this.ctx.fillStyle = zone.bg;
            this.ctx.fillRect(bx, by, cellW, cellH);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.lineWidth = 1 / this.scale;
            this.ctx.strokeRect(bx, by, cellW, cellH);

            this.ctx.fillStyle = '#ffffff';
            const f1 = (14 / this.scale);
            const f2 = (11 / this.scale);
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.shadowColor = 'rgba(0,0,0,0.85)';
            this.ctx.shadowBlur = 6 / this.scale;

            this.ctx.font = `bold ${f1}px Inter, sans-serif`;
            this.ctx.fillText(zone.name, bx + cellW / 2, by + cellH / 2 - (10 / this.scale));

            this.ctx.font = `600 ${f2}px Inter, sans-serif`;
            this.ctx.fillStyle = '#e2e8f0';
            this.ctx.fillText(zone.desc, bx + cellW / 2, by + cellH / 2 + (10 / this.scale));
            this.ctx.shadowBlur = 0;
        }

        this.ctx.restore();
    }

    drawCompass(x, y, angle) {
        this.ctx.save();
        this.ctx.translate(x, y);

        // Background Circle
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 45, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#6366f1';
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();

        // Labels
        this.ctx.fillStyle = '#475569';
        this.ctx.font = 'bold 12px Inter, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Rotating Circle for Labels
        this.ctx.save();
        this.ctx.rotate(angle * Math.PI / 180);

        this.ctx.fillStyle = '#6366f1';
        this.ctx.fillText('N', 0, -32);
        this.ctx.fillStyle = '#94a3b8';
        this.ctx.fillText('E', 32, 0);
        this.ctx.fillText('S', 0, 32);
        this.ctx.fillText('W', -32, 0);
        this.ctx.restore();

        // Constant Needle (Facing Left: -90deg relative to Canvas TOP)
        this.ctx.save();
        this.ctx.rotate(-Math.PI / 2);

        // North Needle (Primary - now 30% smaller: height ~25 instead of 35)
        this.ctx.beginPath();
        this.ctx.moveTo(-2, 0);
        this.ctx.lineTo(0, -25);
        this.ctx.lineTo(2, 0);
        this.ctx.fillStyle = '#6366f1';
        this.ctx.fill();

        // South Needle
        this.ctx.beginPath();
        this.ctx.moveTo(-2, 0);
        this.ctx.lineTo(0, 25);
        this.ctx.lineTo(2, 0);
        this.ctx.fillStyle = '#475569';
        this.ctx.fill();

        this.ctx.restore();

        this.ctx.restore();
    }

    async exportToDataURL(projectName = 'Unsaved Design', projectData = null) {
        try {
            const footerHeight = 80;
            const fy = this.canvas.height;
            const exportCanvas = document.createElement('canvas');
            exportCanvas.width = this.canvas.width;
            exportCanvas.height = fy + footerHeight;
            const eCtx = exportCanvas.getContext('2d');

            // 1. Background
            eCtx.fillStyle = this.bgColor || '#ffffff';
            eCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

            // 2. Draw Floor Plan
            eCtx.drawImage(this.canvas, 0, 0);

            // 3. Branding Assets
            const logoData = window.OFFICIAL_LOGO_DATA;

            // 4. Render Architectural Compass (if widget exists)
            const compassWidget = document.getElementById('compass-widget');
            if (compassWidget) {
                const rect = compassWidget.getBoundingClientRect();
                const canvasRect = this.canvas.getBoundingClientRect();
                const cx = (rect.left - canvasRect.left) + rect.width / 2;
                const cy = (rect.top - canvasRect.top) + rect.height / 2;

                eCtx.save();
                eCtx.translate(cx, cy);
                eCtx.beginPath();
                eCtx.arc(0, 0, 45, 0, Math.PI * 2);
                eCtx.fillStyle = 'white'; eCtx.fill();
                eCtx.strokeStyle = '#6366f1'; eCtx.lineWidth = 1.5; eCtx.stroke();

                eCtx.save();
                eCtx.rotate(this.northAngle * Math.PI / 180);
                eCtx.fillStyle = '#6366f1'; eCtx.font = 'bold 12px Inter'; eCtx.textAlign = 'center';
                eCtx.fillText('N', 0, -32);
                eCtx.fillStyle = '#94a3b8'; eCtx.fillText('E', 32, 0); eCtx.fillText('S', 0, 32); eCtx.fillText('W', -32, 0);
                eCtx.restore();

                eCtx.rotate(-Math.PI / 2);
                eCtx.beginPath(); eCtx.moveTo(-2, 0); eCtx.lineTo(0, -25); eCtx.lineTo(2, 0); eCtx.fillStyle = '#6366f1'; eCtx.fill();
                eCtx.beginPath(); eCtx.moveTo(-2, 0); eCtx.lineTo(0, 25); eCtx.lineTo(2, 0); eCtx.fillStyle = '#475569'; eCtx.fill();
                eCtx.restore();
            }

            // 5. Render Professional Footer (Highest Priority Rendering)
            eCtx.fillStyle = '#0f172a'; // High-contrast midnight blue
            eCtx.fillRect(0, fy, exportCanvas.width, footerHeight);

            // Neon accent strip for modern technical aesthetic
            eCtx.fillStyle = '#0ea5e9';
            eCtx.fillRect(0, fy, exportCanvas.width, 4);

            let logoXOffset = 30;
            if (logoData) {
                try {
                    const logoSmall = new Image();
                    await new Promise(r => {
                        logoSmall.onload = r;
                        logoSmall.onerror = r;
                        logoSmall.src = logoData;
                    });
                    if (logoSmall.complete && logoSmall.naturalWidth > 0) {
                        const sSize = 48;
                        const sy = fy + (footerHeight - sSize) / 2 + 2;
                        eCtx.drawImage(logoSmall, logoXOffset, sy, sSize, sSize);
                        logoXOffset += 70;
                    }
                } catch (e) {
                    console.warn("Small logo render bypassed");
                }
            }

            const safeProjectName = (projectName || 'Untitled Design').toString().toUpperCase();

            // Branding Text
            eCtx.fillStyle = '#f8fafc';
            eCtx.font = 'bold 18px "Inter", sans-serif';
            eCtx.textAlign = 'left';
            eCtx.fillText('PROSARAL SOLUTIONS', logoXOffset, fy + 38);

            // Metadata Line
            eCtx.font = '500 13px "Inter", sans-serif';
            eCtx.fillStyle = '#94a3b8';
            const now = new Date();
            const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
            eCtx.fillText(`PROJECT: ${safeProjectName}   |   EXPORT DATE: ${dateStr}   |   V2.2.4 ENTERPRISE`, logoXOffset, fy + 58);

            // Authentication Watermark
            eCtx.font = '600 10px "Inter", sans-serif';
            eCtx.fillStyle = '#334155';
            eCtx.fillText('SECURED BLUEPRINT EXPORT - VERIFIED ARCHITECTURAL CONTENT', 30, fy + 78);

            // 6. Generate Project QR Code
            const qrSize = 60;
            const qrX = exportCanvas.width - qrSize - 30;
            const qrY = fy + 12;
            const qrLib = (typeof qrcode === 'function') ? qrcode : (typeof qrcode === 'object' ? qrcode.qrcode : null);

            if (projectData && qrLib) {
                try {
                    const qrPayload = {
                        app: "PROSARAL",
                        v: "2.2.4",
                        name: safeProjectName.slice(0, 20),
                        objects: projectData.scene?.length || 0
                    };
                    const qr = qrLib(0, 'M');
                    qr.addData(JSON.stringify(qrPayload));
                    qr.make();
                    const qrImg = new Image();
                    await new Promise(r => { qrImg.onload = r; qrImg.onerror = r; qrImg.src = qr.createDataURL(4); });
                    if (qrImg.complete && qrImg.naturalWidth > 0) {
                        eCtx.fillStyle = 'white';
                        eCtx.fillRect(qrX - 2, qrY - 2, qrSize + 4, qrSize + 4);
                        eCtx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
                    }
                } catch (qrErr) { console.warn("QR generation bypassed:", qrErr); }
            }

            const dataURL = exportCanvas.toDataURL('image/png');
            this.render();
            return dataURL;
        } catch (err) {
            console.error("Export process failed:", err);
            return this.canvas.toDataURL('image/png'); // Fallback to raw canvas
        }
    }
}
