/**
 * lib/roomio/event-bus.ts — Lightweight Pub/Sub Event Bus
 */

class EventBus {
    private _listeners: { [key: string]: Function[] } = {};

    constructor() {
        this._listeners = {};
    }

    on(event: string, callback: Function) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return () => this.off(event, callback);
    }

    off(event: string, callback: Function) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }

    emit(event: string, ...args: any[]) {
        if (!this._listeners[event]) return;
        for (const cb of this._listeners[event]) {
            cb(...args);
        }
    }
}

// Singleton instance shared across the app
export const appEvents = new EventBus();
