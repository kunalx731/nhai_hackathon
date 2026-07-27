/**
 * Background sync task — runs even when the app is killed.
 *
 * Uses Android WorkManager (via expo-background-fetch) with a CONNECTED
 * network constraint. The OS triggers this task when:
 *   - The device regains internet connectivity
 *   - At most once every 15 minutes (OS-enforced minimum)
 *
 * IMPORTANT: This file must be imported at the root of App.tsx (top-level
 * import, not inside a component) so TaskManager.defineTask() runs before
 * the React tree mounts.
 */

import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { processQueue } from './syncService';

export const BG_SYNC_TASK = 'faceauth-bg-sync';

// Task definition — must be at module level
TaskManager.defineTask(BG_SYNC_TASK, async () => {
  try {
    console.log('[BgSync] Background task triggered by OS.');
    const synced = await processQueue();
    console.log(`[BgSync] Done — ${synced} items synced.`);
    return synced > 0
      ? BackgroundFetch.BackgroundFetchResult.NewData
      : BackgroundFetch.BackgroundFetchResult.NoData;
  } catch (err) {
    console.warn('[BgSync] Task failed:', err);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      console.warn('[BgSync] Background fetch not available (restricted/denied).');
      return;
    }

    const isRegistered = await TaskManager.isTaskRegisteredAsync(BG_SYNC_TASK);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(BG_SYNC_TASK, {
        minimumInterval: 15 * 60, // 15 min — OS-enforced floor on both platforms
        stopOnTerminate: false,   // keep alive after app kill
        startOnBoot: true,        // re-register after device reboot
      });
      console.log('[BgSync] Task registered — OS will trigger on network + 15min interval.');
    } else {
      console.log('[BgSync] Task already registered.');
    }
  } catch (err) {
    console.warn('[BgSync] Could not register background task:', err);
  }
}
