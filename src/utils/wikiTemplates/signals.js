/**
 * Preact Signals Core - Simplified Implementation
 * https://preactjs.com/signals
 */

export function signal(value) {
    return new Signal(value);
}

export function computed(fn) {
    return new Computed(fn);
}

export function effect(fn) {
    return new Effect(fn);
}

let currentEffect = null;
const effects = new Set();

class Signal {
    constructor(value) {
        this._value = value;
        this._subscribers = new Set();
    }

    get value() {
        if (currentEffect) {
            this._subscribers.add(currentEffect);
        }
        return this._value;
    }

    set value(newValue) {
        if (this._value !== newValue) {
            this._value = newValue;
            this._notify();
        }
    }

    _notify() {
        this._subscribers.forEach(effect => {
            if (typeof effect === 'function') {
                effect();
            }
        });
    }
}

class Computed extends Signal {
    constructor(fn) {
        super(undefined);
        this._fn = fn;
        this._dirty = true;
        this._invalidate = () => {
            if (!this._dirty) {
                this._dirty = true;
                this._notify();
            }
        };
        this._value = this._compute();
    }

    get value() {
        if (currentEffect) {
            this._subscribers.add(currentEffect);
        }
        if (this._dirty) {
            this._value = this._compute();
            this._dirty = false;
        }
        return this._value;
    }

    _compute() {
        const prevEffect = currentEffect;
        currentEffect = this._invalidate;
        effects.add(this._invalidate);
        const result = this._fn();
        currentEffect = prevEffect;
        return result;
    }

    set value(v) {
    }
}

class Effect {
    constructor(fn) {
        currentEffect = fn;
        effects.add(fn);
        fn();
        currentEffect = null;
    }
}
