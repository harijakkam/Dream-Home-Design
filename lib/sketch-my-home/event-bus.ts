/**
 * lib/sketch-my-home/event-bus.ts — Lightweight Pub/Sub Event Bus
 */

class EventBus {
    private _listeners: { [key: string]: Function[] } = {};

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

export const appEvents = new EventBus();
