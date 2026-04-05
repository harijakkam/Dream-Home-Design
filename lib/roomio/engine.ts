import { ElementRegistry } from './elements';

/**
 * lib/roomio/engine.ts — Core Canvas Rendering and Interaction Engine
 */

export interface Point {
    x: number;
    y: number;
}

export interface Shape {
    id: string;
    type: 'room' | 'object' | 'wall' | 'measure' | 'area_measure';
    subType?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    points: Point[];
    thickness?: number;
    lineType?: 'solid' | 'dotted';
    rotation?: number;
    flipX?: boolean;
    flipY?: boolean;
    [key: string]: any;
}

export class CanvasEngine {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    scene: Shape[] = [];
    selectedItems: Shape[] = [];
    
    // Settings
    gridSize = 25;
    snapToGrid = true;
    scale = 1;
    showVastu = false;
    showGrid = true;
    showCrosshairs = false;
    stickyWalls = true;
    hideStructure = false;
    northAngle = 0;
    isLoading = false;

    // Callbacks
    onSelectionChange: ((items: Shape[]) => void) | null = null;
    activeOverlayCallback: ((ctx: CanvasRenderingContext2D) => void) | null = null;
    onSceneChange: (() => void) | null = null;

    offsetX = 0;
    offsetY = 0;
    isPanning = false;
    mouseX = 0;
    mouseY = 0;

    private _lastBgColor: string | null = null;
    private isLightBg = false;
    private compColor = '#cbd5e1';
    private wallColor = '#94a3b8';
    private compFill = 'rgba(255, 255, 255, 0.05)';
    private baseText = '#94a3b8';
    private gridColor = 'rgba(255, 255, 255, 0.05)';
    private exportWallColor = '#334155';
    private jointCache: Map<string, string[]> = new Map();

    // Undo history
    private undoStack: Shape[][] = [];
    private maxUndoSteps = 50;
    private _undoLock = false;
    private panStartX = 0;
    private panStartY = 0;
    public bgColor: string | null = null;

    constructor(canvasEl: HTMLCanvasElement) {
        this.canvas = canvasEl;
        const ctx = canvasEl.getContext('2d');
        if (!ctx) throw new Error("Could not get 2D context");
        this.ctx = ctx;

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

        window.addEventListener('mouseup', () => {
            if (this.isPanning) {
                this.isPanning = false;
                this.canvas.style.cursor = '';
            }
        });
    }

    startPan(clientX: number, clientY: number) {
        this.isPanning = true;
        this.panStartX = clientX - this.offsetX;
        this.panStartY = clientY - this.offsetY;
        this.canvas.style.cursor = 'grabbing';
    }

    zoomAtPosition(x: number, y: number, newScale: number) {
        newScale = Math.max(0.1, Math.min(newScale, 5));
        this.offsetX = x - (x - this.offsetX) * (newScale / this.scale);
        this.offsetY = y - (y - this.offsetY) * (newScale / this.scale);
        this.scale = newScale;
        this.render();
    }

    setZoom(level: number) {
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

    addShape(shape: Shape) {
        this.scene.push(shape);
        this.render();
        this.triggerSceneChange();
    }

    removeShape(shape: Shape) {
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
        const previous = this.undoStack.pop();
        if (previous) this.scene = previous;
        this.clearSelection();
        this.render();
        this._undoLock = false;
        if (this.onSceneChange) this.onSceneChange();
        return true;
    }

    selectItem(item: Shape | null, keepExisting = false) {
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

    snap(value: number) {
        if (!this.snapToGrid) return value;
        const inchPx = this.gridSize / 12;
        const snapped = Math.round(value / inchPx) * inchPx;
        return Math.round(snapped * 100) / 100;
    }

    pixelsToFeet(px: number) {
        const totalInches = Math.round(px / (this.gridSize / 12));
        const ft = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
        if (ft === 0) return `${inches}"`;
        if (inches === 0) return `${ft}'`;
        return `${ft}' ${inches}"`;
    }

    hitTest(x: number, y: number): Shape | null {
        for (let i = this.scene.length - 1; i >= 0; i--) {
            const item = this.scene[i];
            if (item.type === 'room' || item.type === 'object') {
                if (x >= item.x && x <= item.x + item.width &&
                    y >= item.y && y <= item.y + item.height) {
                    return item;
                }
            } else if (item.type === 'wall' || item.type === 'measure') {
                const dist = this.distToSegment({ x, y }, { x: item.startX, y: item.startY }, { x: item.endX, y: item.endY });
                if (dist < 8) return item;
            }
        }
        return null;
    }

    distToSegment(p: Point, v: Point, w: Point): number {
        const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
        if (l2 === 0) return Math.sqrt(Math.pow(p.x - v.x, 2) + Math.pow(p.y - v.y, 2));
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt(Math.pow(p.x - (v.x + t * (w.x - v.x)), 2) + Math.pow(p.y - (v.y + t * (w.y - v.y)), 2));
    }

    render(drawBackgroundAndGrid = true) {
        if (!this.ctx) return;
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = this.bgColor || '#1e1e22';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        this.updateContrastColors();

        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);

        if (drawBackgroundAndGrid && this.showGrid) {
            this.drawGrid();
        }

        for (const shape of this.scene) {
            this.drawShape(shape, true);
        }

        if (this.activeOverlayCallback) {
            this.activeOverlayCallback(this.ctx);
        }

        this.ctx.restore();
    }

    private drawGrid() {
        this.ctx.strokeStyle = this.gridColor;
        this.ctx.lineWidth = 1 / this.scale;
        this.ctx.beginPath();
        const startX = -this.offsetX / this.scale;
        const endX = startX + this.canvas.width / this.scale;
        const startY = -this.offsetY / this.scale;
        const endY = startY + this.canvas.height / this.scale;

        for (let x = Math.floor(startX / this.gridSize) * this.gridSize; x <= endX; x += this.gridSize) {
            this.ctx.moveTo(x, startY);
            this.ctx.lineTo(x, endY);
        }
        for (let y = Math.floor(startY / this.gridSize) * this.gridSize; y <= endY; y += this.gridSize) {
            this.ctx.moveTo(startX, y);
            this.ctx.lineTo(endX, y);
        }
        this.ctx.stroke();
    }

    private drawShape(shape: Shape, isInteractive: boolean) {
        const isSelected = this.selectedItems.includes(shape);
        switch (shape.type) {
            case 'wall':
            case 'measure':
                this.drawWall(shape, isSelected);
                break;
            case 'room':
                this.drawRoom(shape, isSelected);
                break;
            case 'object':
                this.drawObject(shape, isSelected);
                break;
        }
    }

    private drawWall(shape: Shape, isSelected: boolean) {
        this.ctx.save();
        this.ctx.strokeStyle = isSelected ? '#6366f1' : this.wallColor;
        this.ctx.lineWidth = shape.thickness || 6;
        this.ctx.beginPath();
        this.ctx.moveTo(shape.startX, shape.startY);
        this.ctx.lineTo(shape.endX, shape.endY);
        this.ctx.stroke();
        this.ctx.restore();
    }

    private drawRoom(shape: Shape, isSelected: boolean) {
        this.ctx.save();
        this.ctx.fillStyle = isSelected ? 'rgba(99, 102, 241, 0.2)' : this.compFill;
        this.ctx.strokeStyle = isSelected ? '#6366f1' : this.compColor;
        this.ctx.lineWidth = 2;
        this.ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        this.ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
        this.ctx.restore();
    }

    private drawObject(shape: Shape, isSelected: boolean) {
        this.ctx.save();
        const cx = shape.x + shape.width / 2;
        const cy = shape.y + shape.height / 2;
        this.ctx.translate(cx, cy);
        this.ctx.rotate((shape.rotation || 0) * Math.PI / 180);
        
        const el = ElementRegistry.get(shape.subType || '');
        if (el) {
            el.draw(this.ctx, shape.width / 2, shape.height / 2, shape.width, shape.height, this.scale, shape, { textColor: this.baseText });
        } else {
            this.ctx.fillRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height);
            this.ctx.strokeRect(-shape.width / 2, -shape.height / 2, shape.width, shape.height);
        }
        this.ctx.restore();
    }
}
