/* The store talks to IndexedDB and to navigator.storage. Node has neither, so give it both. */
import 'fake-indexeddb/auto';

if (!globalThis.navigator) globalThis.navigator = /** @type {any} */ ({});
if (!globalThis.navigator.storage) {
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: { persist: async () => false },
    configurable: true
  });
}
