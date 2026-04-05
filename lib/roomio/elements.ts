/**
 * lib/roomio/elements.ts — Declarative Element Registry
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

    ids(): string[] {
        return Object.keys(this.elements);
    }
}

export const ElementRegistry = new ElementRegistryService();

// ==================== BUILT-IN ELEMENTS ====================

ElementRegistry.register({
    id: 'door',
    name: 'Door',
    icon: 'door-open',
    width: 75,
    height: 25,
    draw(ctx, hw, hh, w, h, scale) {
        ctx.beginPath();
        ctx.moveTo(-hw, hh);
        ctx.lineTo(-hw, hh - w);
        ctx.moveTo(-hw, hh);
        ctx.arc(-hw, hh, w, -Math.PI / 2, 0, false);
        ctx.stroke();
        ctx.strokeRect(-hw, hh - Math.max(8 / scale, h), w, Math.max(8 / scale, h));
    }
});

ElementRegistry.register({
    id: 'window',
    name: 'Window',
    icon: 'app-window',
    width: 100,
    height: 25,
    draw(ctx, hw, hh, w, h) {
        ctx.fillRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h);
        ctx.beginPath();
        ctx.moveTo(-hw, 0);
        ctx.lineTo(hw, 0);
        ctx.stroke();
    }
});

ElementRegistry.register({
    id: 'stairs',
    name: 'Stairs',
    icon: 'align-justify',
    width: 75,
    height: 200,
    draw(ctx, hw, hh, w, h) {
        ctx.fillRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h);
        const stepCount = Math.max(3, Math.floor(h / 20));
        const stepH = h / stepCount;
        ctx.beginPath();
        for (let i = 1; i < stepCount; i++) {
            ctx.moveTo(-hw, -hh + i * stepH);
            ctx.lineTo(hw, -hh + i * stepH);
        }
        ctx.stroke();
    }
});

ElementRegistry.register({
    id: 'bed',
    name: 'Bed',
    icon: 'bed',
    width: 125,
    height: 162.5,
    draw(ctx, hw, hh, w, h, scale) {
        ctx.fillRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h);
        const pSize = Math.min(20, h / 4);
        ctx.strokeRect(-hw + 5 / scale, -hh + 5 / scale, w / 2 - 10 / scale, pSize);
        ctx.strokeRect(5 / scale, -hh + 5 / scale, w / 2 - 10 / scale, pSize);
    }
});

ElementRegistry.register({
    id: 'table',
    name: 'Table',
    icon: 'circle',
    width: 100,
    height: 100,
    draw(ctx, hw, hh, w, h) {
        ctx.beginPath();
        ctx.ellipse(0, 0, hw, hh, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }
});

ElementRegistry.register({
    id: 'bookshelf',
    name: 'Bookshelf',
    icon: 'library',
    width: 100,
    height: 30,
    draw(ctx, hw, hh, w, h, scale) {
        ctx.fillRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h);
        const numShelves = Math.max(2, Math.floor(h / (10 / scale)));
        const shelfStep = h / numShelves;
        ctx.beginPath();
        for (let i = 1; i < numShelves; i++) {
            ctx.moveTo(-hw, -hh + i * shelfStep);
            ctx.lineTo(hw, -hh + i * shelfStep);
        }
        ctx.stroke();
    }
});

ElementRegistry.register({
    id: 'commode',
    name: 'Commode',
    icon: 'bath',
    width: 45,
    height: 65,
    draw(ctx, hw, hh, w, h) {
        ctx.fillRect(-hw, -hh, w, h * 0.3);
        ctx.strokeRect(-hw, -hh, w, h * 0.3);
        ctx.beginPath();
        ctx.ellipse(0, -hh + h * 0.3 + h * 0.35, w * 0.35, h * 0.35, 0, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }
});

ElementRegistry.register({
    id: 'washing_machine',
    name: 'Washer',
    icon: 'droplet',
    width: 60,
    height: 60,
    draw(ctx, hw, hh, w, h) {
        ctx.fillRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h);
        ctx.beginPath();
        ctx.arc(0, hh * 0.1, Math.min(hw, hh) * 0.6, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(-hw * 0.6, -hh * 0.6, Math.min(hw, hh) * 0.15, 0, 2 * Math.PI);
        ctx.stroke();
    }
});

ElementRegistry.register({
    id: 'chair',
    name: 'Chair',
    icon: 'armchair',
    width: 50,
    height: 50,
    draw(ctx, hw, hh, w, h) {
        ctx.fillRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h * 0.2);
    }
});

ElementRegistry.register({
    id: 'sofa',
    name: 'Sofa',
    icon: 'sofa',
    width: 180,
    height: 80,
    draw(ctx, hw, hh, w, h) {
        ctx.fillRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h);
        ctx.strokeRect(-hw, -hh, w, h * 0.3);
        ctx.strokeRect(-hw, -hh, w * 0.15, h);
        ctx.strokeRect(hw - w * 0.15, -hh, w * 0.15, h);
    }
});

ElementRegistry.register({
    id: 'text',
    name: 'Text',
    icon: 'type',
    width: 120,
    height: 30,
    extraProps: { text: 'Label', fontSize: 16 },
    draw(ctx, hw, hh, w, h, scale, shape, colors) {
        ctx.beginPath();
        ctx.setLineDash([4 / scale, 4 / scale]);
        ctx.strokeRect(-hw, -hh, w, h);
        ctx.setLineDash([]);
        const fontSize = (shape.fontSize || 16);
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = colors.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shape.text || 'Text', 0, 0);
    }
});
