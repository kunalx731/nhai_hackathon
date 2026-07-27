/**
 * AWS / sync endpoint configuration.
 *
 * API contract:
 *   POST  {apiEndpoint}{syncPath}
 *   Body: { items: SyncQueueItem[] }
 *   Response: { syncedIds: string[] }
 *
 * ── Local mock server (for testing) ─────────────────────────────────────────
 *   1. Run:  node scripts/mock-sync-server.js
 *   2. Use the right IP below:
 *
 *   Android emulator → http://10.0.2.2:3001
 *   Physical device  → http://192.168.1.47:3001   (laptop LAN IP, same Wi-Fi or phone hotspot)
 *
 * ── Real AWS (for demo) ──────────────────────────────────────────────────────
 *   apiEndpoint: 'https://abc123.execute-api.ap-south-1.amazonaws.com/prod'
 *   See docs for Lambda + API Gateway setup.
 */
export const AWS_CONFIG = {
  // PRODUCTION — AWS API Gateway
  apiEndpoint: 'https://92daub1977.execute-api.ap-south-1.amazonaws.com/prod',

  // MOCK — physical device on same network as laptop
  // apiEndpoint: 'http://10.136.2.195:3001',

  // MOCK — Android emulator
  // apiEndpoint: 'http://10.0.2.2:3001',

  syncPath:       '/sync',
  attendancePath: '/attendance',

  /** Request timeout in milliseconds */
  timeoutMs: 12000,

  /** API key — leave empty for mock server and HTTP API Gateway without key auth */
  apiKey: '',
} as const;
