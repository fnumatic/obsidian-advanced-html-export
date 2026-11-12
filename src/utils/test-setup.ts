import { installObsidianDom } from './test-utils';

// Node-based test files have no window; the plugin uses window.* timers for
// popout-window compatibility.
if (typeof globalThis.window === 'undefined') {
  (globalThis as unknown as { window: typeof globalThis }).window = globalThis;
}

installObsidianDom();
