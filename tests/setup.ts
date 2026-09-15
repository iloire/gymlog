// Dexie needs an IndexedDB implementation; everything the sync engine does is
// exercised against a real one rather than a mock.
import 'fake-indexeddb/auto'
