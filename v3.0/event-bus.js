/**
 * event-bus.js — Lightweight Pub/Sub Event Bus
 * 
 * Decouples components so they communicate via events
 * instead of direct references.
 */

class EventBus {
    constructor() {
        this._listeners = {};
    }

    /**
     * Subscribe to an event.
     * @param {string} event 
     * @param {Function} callback 
     * @returns {Function} unsubscribe function
     */
    on(event, callback) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
        return () => this.off(event, callback);
    }

    /**
     * Unsubscribe from an event.
     */
    off(event, callback) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }

    /**
     * Emit an event with optional data.
     * @param {string} event 
     * @param  {...any} args 
     */
    emit(event, ...args) {
        if (!this._listeners[event]) return;
        for (const cb of this._listeners[event]) {
            cb(...args);
        }
    }
}

// Singleton instance shared across the app
const appEvents = new EventBus();
