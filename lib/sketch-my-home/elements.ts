/**
 * lib/sketch-my-home/elements.ts — Declarative Element Registry
 */

export interface ElementDefinition {
    id: string;
    name: string;
    icon: string;
    width: number;
    height: number;
    extraProps?: any;
    draw: (ctx: CanvasRenderingContext2D, hw: number, hh: number, w: number, h: number, scale: number, shape: any, colors: any) => void;
}

class ElementRegistryService {
    private elements: { [id: string]: ElementDefinition } = {};

    register(def: ElementDefinition) {
        this.elements[def.id] = def;
    }

    get(id: string): ElementDefinition | undefined {
        return this.elements[id];
    }

    getAll(): ElementDefinition[] {
        return Object.values(this.elements);
    }
}

export const ElementRegistry = new ElementRegistryService();

// ==================== BUILT-IN ELEMENTS ====================

ElementRegistry.register({
    id: 'door', name: 'Door', icon: 'door-open', width: 75, height: 25,
    draw(ctx, hw, hh, w, h, _scale, _shape, _colors) {
        ctx.save();
        ctx.beginPath(); ctx.moveTo(-hw, hh); ctx.lineTo(-hw, hh - w);
        ctx.arc(-hw, hh, w, -Math.PI / 2, 0, false); ctx.stroke();
        ctx.restore();
    }
});

ElementRegistry.register({
    id: 'window', name: 'Window', icon: 'app-window', width: 100, height: 25,
    draw(ctx, hw, hh, w, h, _scale, _shape, _colors) {
        ctx.save();
        ctx.fillRect(-hw, -hh, w, h); ctx.strokeRect(-hw, -hh, w, h);
        ctx.restore();
    }
});
