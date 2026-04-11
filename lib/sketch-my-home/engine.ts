import { ElementRegistry } from './elements';

/**
 * lib/sketch-my-home/engine.ts — Core Canvas Rendering and Interaction Engine
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
    rotation?: number;
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
    offsetX = 0;
    offsetY = 0;
    mouseX = 0;
    mouseY = 0;
    isPanning = false;

    // Callbacks
    onSelectionChange: ((items: Shape[]) => void) | null = null;
    onSceneChange: (() => void) | null = null;

    private _lastBgColor: string | null = null;
    private isLightBg = false;
    private compColor = '#cbd5e1';
    private wallColor = '#94a3b8';
    private compFill = 'rgba(255, 255, 255, 0.05)';
    private baseText = '#94a3b8';
    private gridColor = 'rgba(255, 255, 255, 0.05)';
    private panStartX = 0;
    private panStartY = 0;

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

    updateContrastColors(): void {
        const bg = '#1e1e22';
        if (bg === this._lastBgColor) return;
        this._lastBgColor = bg;
        this.isLightBg = false;
        this.compColor = '#f8fafc';
        this.wallColor = '#94a3b8';
        this.compFill = 'rgba(255, 255, 255, 0.05)';
        this.gridColor = 'rgba(255, 255, 255, 0.1)';
        this.baseText = '#f8fafc';
    }

    resize(): void {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.render();
    }

    setupPanAndZoom(): void {
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
                this.isPanning = true;
                this.panStartX = e.clientX - this.offsetX;
                this.panStartY = e.clientY - this.offsetY;
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
            this.isPanning = false;
        });
    }

    zoomAtPosition(x: number, y: number, newScale: number): void {
        newScale = Math.max(0.1, Math.min(newScale, 5));
        this.offsetX = x - (x - this.offsetX) * (newScale / this.scale);
        this.offsetY = y - (y - this.offsetY) * (newScale / this.scale);
        this.scale = newScale;
        this.render();
    }

    render(drawBackgroundAndGrid = true): void {
        if (!this.ctx) return;
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.fillStyle = '#1e1e22';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();

        this.ctx.save();
        this.ctx.translate(this.offsetX, this.offsetY);
        this.ctx.scale(this.scale, this.scale);

        if (drawBackgroundAndGrid) {
            this.drawGrid();
        }

        for (const shape of this.scene) {
            this.drawShape(shape, true);
        }

        this.ctx.restore();
    }

    private drawGrid(): void {
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

    private drawShape(shape: Shape, _isInteractive: boolean): void {
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
        const t = shape.thickness || 6;
        const half = t / 2;
        this.ctx.lineWidth = t;

        let ox = 0, oy = 0;
        if (shape.type === 'wall') {
            let dx = shape.endX - shape.startX;
            let dy = shape.endY - shape.startY;
            let len = Math.hypot(dx, dy);
            if (len > 0) {
                ox = (-dy / len) * half;
                oy = (dx / len) * half;
            }
        }

        this.ctx.beginPath();
        this.ctx.moveTo(shape.startX + ox, shape.startY + oy);
        this.ctx.lineTo(shape.endX + ox, shape.endY + oy);
        this.ctx.stroke();
        this.ctx.restore();
    }

    private drawRoom(shape: Shape, isSelected: boolean) {
        this.ctx.save();
        this.ctx.fillStyle = isSelected ? 'rgba(99, 102, 241, 0.2)' : this.compFill;
        this.ctx.strokeStyle = isSelected ? '#6366f1' : this.compColor;
        const t = 2;
        const half = t / 2;
        this.ctx.lineWidth = t;
        this.ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
        this.ctx.strokeRect(shape.x + half, shape.y + half, shape.width - t, shape.height - t);
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

    clearScene() { this.scene = []; this.render(); }
    undo() { return true; }
    deleteSelected() { 
        this.scene = this.scene.filter(s => !this.selectedItems.includes(s)); 
        this.selectedItems = []; 
        this.render(); 
    }
}
