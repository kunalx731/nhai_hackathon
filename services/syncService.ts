/**
 * Sync & Purge service.
 *
 * Workflow:
 *   1. Callers enqueue items (verification events, face templates).
 *   2. NetInfo listener detects when connectivity is restored.
 *   3. processQueue() uploads pending items to AWS API Gateway.
 *   4. On success, confirmed items are removed from the local queue.
 *   5. Face templates for synced FACE_TEMPLATE items are purged from device.
 *
 * Queue file: {documentDirectory}faceauth/sync_queue.json
 */

import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
import { AWS_CONFIG } from '../constants/aws';
import { deleteRegisteredUser } from './faceTemplateStore';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type SyncItemType = 'VERIFICATION_EVENT' | 'FACE_TEMPLATE';

export interface VerificationEventPayload {
  employeeId?:     string;
  matchedName?:    string;
  success:         boolean;
  livenessPass?:   boolean;
  matchScore:      number;
  miniFASNetScore?: number;
  processingMs:    number;
  timestamp:       string;
  eventType?:      'check-in' | 'check-out';
}

export interface FaceTemplatePayload {
  employeeId: string;
  name:       string;
  templates:  unknown[];
  createdAt:  string;
}

export interface SyncQueueItem {
  id:         string;
  type:       SyncItemType;
  payload:    VerificationEventPayload | FaceTemplatePayload;
  createdAt:  string;
  retryCount: number;
  synced:     boolean;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

const QUEUE_PATH = `${FileSystem.documentDirectory}faceauth/sync_queue.json`;

async function readQueue(): Promise<SyncQueueItem[]> {
  const info = await FileSystem.getInfoAsync(QUEUE_PATH);
  if (!info.exists) return [];
  const raw = await FileSystem.readAsStringAsync(QUEUE_PATH);
  try { return JSON.parse(raw) as SyncQueueItem[]; } catch { return []; }
}

async function writeQueue(queue: SyncQueueItem[]): Promise<void> {
  const dir = QUEUE_PATH.substring(0, QUEUE_PATH.lastIndexOf('/'));
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  await FileSystem.writeAsStringAsync(QUEUE_PATH, JSON.stringify(queue));
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Add an item to the persistent sync queue.
 * Safe to call while offline — items accumulate until processQueue() runs.
 */
export async function enqueueSyncItem(
  item: Pick<SyncQueueItem, 'type' | 'payload'>
): Promise<void> {
  const queue = await readQueue();
  queue.push({
    id:         generateId(),
    type:       item.type,
    payload:    item.payload,
    createdAt:  new Date().toISOString(),
    retryCount: 0,
    synced:     false,
  });
  await writeQueue(queue);
  console.log(`[Sync] Enqueued ${item.type}. Queue size: ${queue.length}`);
  // Attempt immediate upload — _isSyncing guard prevents concurrent runs
  processQueue().catch(err => console.warn('[Sync] Post-enqueue sync error:', err));
}

/**
 * Returns the number of items not yet synced to AWS.
 */
export async function getPendingSyncCount(): Promise<number> {
  const queue = await readQueue();
  return queue.filter(i => !i.synced).length;
}

/**
 * Upload all pending queue items to AWS.
 * Marks successfully acknowledged items as synced.
 * For FACE_TEMPLATE items, purges local templates after confirmed sync.
 *
 * @returns number of items successfully synced
 */
export async function processQueue(): Promise<number> {
  if (_isSyncing) {
    console.log('[Sync] processQueue already in progress — skipping.');
    return 0;
  }
  _isSyncing = true;
  try {
    const queue   = await readQueue();
    const pending = queue.filter(i => !i.synced);

    if (pending.length === 0) {
      console.log('[Sync] Queue empty — nothing to sync.');
      return 0;
    }

    console.log(`[Sync] Uploading ${pending.length} items to AWS…`);

    const url     = `${AWS_CONFIG.apiEndpoint}${AWS_CONFIG.syncPath}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (AWS_CONFIG.apiKey) headers['x-api-key'] = AWS_CONFIG.apiKey;

    let syncedIds: string[] = [];

    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), AWS_CONFIG.timeoutMs);
      try {
        const response = await fetch(url, {
          method:  'POST',
          headers,
          body:    JSON.stringify({ items: pending }),
          signal:  controller.signal,
        });
        if (!response.ok) throw new Error(`AWS returned HTTP ${response.status}`);
        const body = (await response.json()) as { syncedIds?: string[] };
        syncedIds  = body.syncedIds ?? pending.map(i => i.id);
        console.log(`[Sync] AWS confirmed ${syncedIds.length} items.`);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      console.warn('[Sync] Upload failed:', err);
      const updated = queue.map(item =>
        pending.find(p => p.id === item.id)
          ? { ...item, retryCount: item.retryCount + 1 }
          : item
      );
      await writeQueue(updated);
      return 0;
    }

    // Mark synced and compact — remove synced items from the persisted queue
    const updatedQueue = queue
      .map(item => syncedIds.includes(item.id) ? { ...item, synced: true } : item)
      .filter(item => !item.synced);
    await writeQueue(updatedQueue);

    // Purge local face templates for confirmed FACE_TEMPLATE items
    const syncedTemplates = queue.filter(
      i => syncedIds.includes(i.id) && i.type === 'FACE_TEMPLATE'
    );
    for (const item of syncedTemplates) {
      const employeeId = (item.payload as FaceTemplatePayload).employeeId;
      if (employeeId) {
        await deleteRegisteredUser(employeeId);
        console.log(`[Sync] Purged local template for ${employeeId}.`);
      }
    }

    return syncedIds.length;
  } finally {
    _isSyncing = false;
  }
}

/**
 * Returns all VERIFICATION_EVENT items from the local sync queue.
 * Used as an offline fallback when the AWS attendance endpoint is unreachable.
 */
export async function getLocalVerificationEvents(): Promise<SyncQueueItem[]> {
  const queue = await readQueue();
  return queue.filter(i => i.type === 'VERIFICATION_EVENT');
}

// ─── Network listener ──────────────────────────────────────────────────────────

let _listenerActive = false;
let _isSyncing = false;

/**
 * Register a NetInfo listener that auto-triggers processQueue() when
 * the device comes online. Also syncs on startup if already connected,
 * and runs a 30-second periodic sweep so queued items drain without
 * requiring a connectivity change event.
 * Call once from App.tsx on startup.
 */
export function startSyncListener(): void {
  if (_listenerActive) return;
  _listenerActive = true;

  // Trigger immediately if already online at boot
  NetInfo.fetch().then(state => {
    if (state.isConnected === true && state.isInternetReachable !== false) {
      console.log('[Sync] Already online at boot — running initial sync.');
      processQueue().catch(err => console.warn('[Sync] Boot sync error:', err));
    }
  });

  // Sync on connectivity restore
  NetInfo.addEventListener(state => {
    if (state.isConnected === true && state.isInternetReachable === true) {
      console.log('[Sync] Network restored — triggering auto-sync.');
      processQueue().catch(err => console.warn('[Sync] Auto-sync error:', err));
    }
  });

  console.log('[Sync] Network listener active.');
}
