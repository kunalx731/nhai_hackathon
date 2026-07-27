/**
 * Local face template storage backed by expo-file-system.
 *
 * Templates are stored as JSON files in the app's document directory.
 * The interface is intentionally isolated so swapping to SQLCipher or
 * an encrypted backend only requires changes here.
 *
 * TODO — production security requirements:
 *   - Replace plain JSON files with SQLCipher or encrypted SQLite.
 *   - Use Android Keystore / iOS Keychain to protect the encryption key.
 *   - Do not store raw photos permanently. Thumbnails must be opt-in.
 *   - All template data must remain on-device; no cloud sync in this version.
 */

import * as FileSystem from 'expo-file-system';
import { RegisteredUser } from '../types/face';

const STORE_DIR = `${FileSystem.documentDirectory}faceauth/`;
const INDEX_PATH = `${STORE_DIR}index.json`;

const _cache = new Map<string, RegisteredUser>();

// ─── Directory bootstrap ──────────────────────────────────────────────────────

async function ensureDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(STORE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(STORE_DIR, { intermediates: true });
  }
}

// ─── Index helpers ────────────────────────────────────────────────────────────

async function readIndex(): Promise<string[]> {
  await ensureDir();
  const info = await FileSystem.getInfoAsync(INDEX_PATH);
  if (!info.exists) return [];
  const raw = await FileSystem.readAsStringAsync(INDEX_PATH);
  return JSON.parse(raw) as string[];
}

async function writeIndex(index: string[]): Promise<void> {
  await ensureDir();
  await FileSystem.writeAsStringAsync(INDEX_PATH, JSON.stringify(index));
}

function userPath(employeeId: string): string {
  // Sanitize employeeId to avoid path traversal
  const safe = employeeId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${STORE_DIR}user_${safe}.json`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function saveRegisteredUser(user: RegisteredUser): Promise<void> {
  await ensureDir();
  await FileSystem.writeAsStringAsync(userPath(user.employeeId), JSON.stringify(user));
  _cache.set(user.employeeId, user);
  const index = await readIndex();
  if (!index.includes(user.employeeId)) {
    index.push(user.employeeId);
    await writeIndex(index);
  }
}

export async function getRegisteredUser(
  employeeId: string
): Promise<RegisteredUser | null> {
  if (_cache.has(employeeId)) return _cache.get(employeeId)!;
  const path = userPath(employeeId);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  const raw = await FileSystem.readAsStringAsync(path);
  const user = JSON.parse(raw) as RegisteredUser;
  _cache.set(employeeId, user);
  return user;
}

export async function getAllRegisteredUsers(): Promise<RegisteredUser[]> {
  const index = await readIndex();
  const results = await Promise.all(index.map(id => getRegisteredUser(id)));
  return results.filter((u): u is RegisteredUser => u !== null);
}

export async function deleteRegisteredUser(employeeId: string): Promise<void> {
  const path = userPath(employeeId);
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    await FileSystem.deleteAsync(path);
  }
  _cache.delete(employeeId);
  const index = await readIndex();
  await writeIndex(index.filter(id => id !== employeeId));
}

export async function userExists(employeeId: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(userPath(employeeId));
  return info.exists;
}
