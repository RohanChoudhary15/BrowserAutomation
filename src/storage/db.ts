const DB_NAME = 'autoflow_db';
const DB_VERSION = 1;
const STORE_WORKFLOWS = 'workflows';
const STORE_SETTINGS = 'settings';

export interface AutoFlowDB {
  getWorkflow(id: string): Promise<any>;
  getAllWorkflows(): Promise<any[]>;
  saveWorkflow(workflow: any): Promise<void>;
  deleteWorkflow(id: string): Promise<void>;
  getSetting(key: string): Promise<any>;
  setSetting(key: string, val: any): Promise<void>;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      // In-memory mock if indexedDB is not available (e.g. some test runners)
      return reject(new Error('IndexedDB not supported in current environment.'));
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (e: any) => {
      const db = e.target.result as IDBDatabase;
      if (!db.objectStoreNames.contains(STORE_WORKFLOWS)) {
        db.createObjectStore(STORE_WORKFLOWS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// In-memory fallback if IndexedDB fails or during tests
const memoryWorkflows = new Map<string, any>();
const memorySettings = new Map<string, any>();

export const db: AutoFlowDB = {
  async getWorkflow(id: string) {
    try {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_WORKFLOWS, 'readonly');
        const store = tx.objectStore(STORE_WORKFLOWS);
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return memoryWorkflows.get(id);
    }
  },

  async getAllWorkflows() {
    try {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_WORKFLOWS, 'readonly');
        const store = tx.objectStore(STORE_WORKFLOWS);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return Array.from(memoryWorkflows.values());
    }
  },

  async saveWorkflow(workflow: any) {
    try {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_WORKFLOWS, 'readwrite');
        const store = tx.objectStore(STORE_WORKFLOWS);
        const req = store.put(workflow);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      memoryWorkflows.set(workflow.id, workflow);
    }
  },

  async deleteWorkflow(id: string) {
    try {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_WORKFLOWS, 'readwrite');
        const store = tx.objectStore(STORE_WORKFLOWS);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      memoryWorkflows.delete(id);
    }
  },

  async getSetting(key: string) {
    try {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_SETTINGS, 'readonly');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return memorySettings.get(key);
    }
  },

  async setSetting(key: string, val: any) {
    try {
      const database = await openDB();
      return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_SETTINGS, 'readwrite');
        const store = tx.objectStore(STORE_SETTINGS);
        const req = store.put(val, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      memorySettings.set(key, val);
    }
  },
};
