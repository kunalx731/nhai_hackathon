# FaceAuth Lite — KPMG Hackathon 7.0

Offline facial authentication for field workers. One tap → face scan → PASS/FAIL. No internet required. Results sync to AWS when connectivity is restored.

## How it works

```
Photo → ML Kit face detect → passive liveness (eyes+pose) → LBP texture anti-spoof
      → MiniFASNet V2 TFLite (screen-replay) → MobileFaceNet 112×112 → 192-dim embedding
      → dot product vs stored templates (threshold 0.65) → PASS/FAIL → sync queue
```

## Prerequisites

- **Node.js** ≥ 18
- **Expo CLI**: `npm install -g expo-cli`
- **Android**: physical device (recommended) or emulator with API 33+
  - Enable USB debugging on device
  - Accept the RSA key prompt when connecting via USB
- **JDK 17** + Android SDK (via Android Studio)

## Setup

```bash
git clone https://github.com/YOUR_USERNAME/kpmg-hackathon-faceauth.git
cd kpmg-hackathon-faceauth
npm install
```

The TFLite models are bundled in `assets/models/` — no extra downloads needed.

## Running locally

### 1. Start the mock sync server (optional, for testing sync)

```bash
node scripts/mock-sync-server.js
```

This auto-detects your LAN IP and patches `constants/aws.ts`. Keep it running in a separate terminal.

### 2. Build and install on Android

```bash
npx expo run:android
```

This compiles the native modules and installs the APK. The JS bundle and models are embedded — unplug USB after install and the app runs fully offline.

## AWS deployment (for demo/production)

Infrastructure is in `infra/` (Terraform):

```bash
cd infra
terraform init
terraform apply -var="region=ap-south-1"
```

Copy the `api_url` output into `constants/aws.ts`:

```ts
apiEndpoint: 'https://YOUR_API_GATEWAY_URL/prod',
```

## Project structure

```
App.tsx                    — root navigator + sync listener init
screens/
  HomeScreen.tsx           — status cards + action buttons
  VerificationScreen.tsx   — full pipeline (quality → liveness → anti-spoof → embedding → match)
  ResultScreen.tsx         — PASS/FAIL display
  RegistrationFormScreen.tsx
  FaceRegistrationCameraScreen.tsx  — capture 3–5 samples, generate templates
  RegisteredUsersScreen.tsx
  DashboardScreen.tsx      — attendance history from server
services/
  faceQualityService.ts    — ML Kit detect, bbox + eye probs + head angles
  livenessService.ts       — passive liveness (eyes open + head pose)
  textureAnalysisService.ts — LBP entropy anti-spoof on 64×64 crop
  miniFASNetAntiSpoofService.ts — MiniFASNet V2 TFLite on 80×80 crop
  mobileFaceNetService.ts  — TFLite model load + 192-dim embedding
  faceTemplateStore.ts     — JSON per user, in-memory cache
  verificationService.ts   — embedding match vs stored templates
  syncService.ts           — queue + AWS upload on reconnect
  attendanceService.ts     — GET /attendance for dashboard
  backgroundSyncTask.ts    — WorkManager background sync (~15 min)
assets/models/
  mobilefacenet.tflite     — float32, 192-dim output
  mobilefacenet_fp16.tflite
  mobilefacenet_int8.tflite
  minifasnet.tflite        — MiniFASNet V2, float32 [1,80,80,3] → [1,3] softmax
constants/
  aws.ts                   — endpoint config (auto-patched by mock server)
  model.ts                 — thresholds and embedding size
infra/
  main.tf                  — DynamoDB + Lambda + API Gateway (HTTP API)
  lambda/index.js          — Lambda handler (mirrors mock server)
scripts/
  mock-sync-server.js      — local dev server, auto-patches LAN IP
```

## Sync API contract

```
POST  {apiEndpoint}/sync        body: { items: SyncQueueItem[] }    response: { syncedIds: string[] }
GET   {apiEndpoint}/attendance  query: ?limit=N                     response: { events: AttendanceEvent[] }
```

Auto-sync triggers: boot (if online), network restore event, WorkManager task (~15 min interval).

## Key thresholds

| Parameter | Value | Location |
|-----------|-------|----------|
| Embedding match threshold | 0.65 | `constants/model.ts` |
| LBP entropy threshold | 4.2 | `constants/model.ts` |
| MiniFASNet real-score threshold | 0.6 | `services/miniFASNetAntiSpoofService.ts` |
| MiniFASNet any-spoof-class max | 0.05 | `services/miniFASNetAntiSpoofService.ts` |
