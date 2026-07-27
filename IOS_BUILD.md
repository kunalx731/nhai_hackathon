# Building the iOS app without a Mac

FaceAuth Lite (UPAS) is a bare-workflow Expo app with native modules
(vision-camera, fast-tflite, ML Kit). **iOS binaries can only be compiled on
macOS + Xcode** — there is no way to produce an `.ipa` on Windows. Since we have
no Mac, the build runs on a **cloud macOS machine**. Two paths, both driven from
Windows:

| Path | Signing | Installs on a normal iPhone? | Needs |
|------|---------|------------------------------|-------|
| **A. EAS Build** (recommended) | Handled by EAS | Yes, via QR/link | Free Expo account + Apple account¹ |
| **B. GitHub Actions** (already in repo) | None (unsigned `.ipa`) | Only after re-signing on Windows (Sideloadly) | Free Apple ID |

¹ Installing on a *physical* device needs a signing identity. A **paid Apple
Developer account ($99/yr)** lets EAS register the device and install directly.
With only a **free Apple ID** you must use Path B (unsigned IPA) + Sideloadly,
which re-signs for 7 days at a time.

Everything below runs on Windows. Both paths run `expo prebuild`, so the
iOS-correctness fixes (Core ML delegate, fmt patch, ML Kit face-detection patch,
background-task IDs) are applied automatically by
`plugins/withIosTfliteCoreML.js` + `patch-package` — nothing to do by hand.

---

## Path A — EAS Build (recommended)

```powershell
npm install -g eas-cli
npm install                     # installs deps + applies the ML Kit patch (postinstall)
eas login                       # free Expo account
```

### A1. With a paid Apple Developer account (cleanest)

```powershell
eas build --platform ios --profile development
```

- EAS asks to log in to Apple and **auto-creates** the signing cert + a
  development provisioning profile.
- Register the test iPhone when prompted (`eas device:create`) — open the link
  on the phone to enroll it.
- When the build finishes, EAS prints a QR code / URL. Open it on the iPhone to
  install. This is a **dev client**, so also run `npx expo start --dev-client`
  and scan to load the JS — or use the `preview` profile for a standalone build:

```powershell
eas build --platform ios --profile preview
```

`preview` (internal distribution, release build, no dev server) is the best fit
for a demo: one install, runs fully offline like the Android APK.

### A2. Without a paid account

EAS cannot create an install profile for arbitrary devices without a paid team.
Use **Path B** instead. (A `simulator` build is possible but the simulator has
no real camera, so it can't exercise the face pipeline.)

---

## Path B — GitHub Actions → unsigned IPA → Sideloadly (free Apple ID)

1. Push this project to a GitHub repo. **Confirm `assets/models/edgeface_s_gamma_05.tflite`
   (15 MB) is committed** — the recognition model must be in the repo or the
   cloud build ships in mock mode. (`.gitignore` keeps the *other* unused models
   out; this one is intentionally tracked.)
2. The workflow `.github/workflows/ios-build.yml` runs on `macos-14`, prebuilds,
   pods, and archives an **unsigned** `UPAS-unsigned.ipa` (Actions → run →
   Artifacts).
3. On Windows, install **[Sideloadly](https://sideloadly.io/)**, plug in the
   iPhone, sign in with a free Apple ID, drag in the IPA, click Start. It
   re-signs and installs. On the phone: Settings → General → VPN & Device
   Management → trust your Apple ID.
4. The app expires after **7 days** (free-account limit) — re-run Sideloadly to
   refresh.

You can trigger the workflow manually from the Actions tab (`workflow_dispatch`).

---

## What to verify on the iPhone (Android parity checklist)

The whole point is that iOS behaves like the working Android build. Check:

- [ ] App launches to Home; no **red "MOCK MODE"** badge on the Verify screen.
      The badge means the TFLite model failed to load → recognition is fake.
- [ ] Register a user (capture the sample photos) — completes without "no face
      detected". This exercises the ML Kit iOS patch.
- [ ] Verify that same user → **PASS**; verify a different/absent face → **FAIL**.
      If a registered user is wrongly rejected on iOS but not Android, it points
      to front-camera crop/mirroring (see below).
- [ ] Active liveness prompts (turn left/right/up/down) respond to head motion.
- [ ] Xcode/console log shows `[EdgeFace] Ready — 112x112 ... (delegate: core-ml`
      or `default)` and per-verify `[EdgeFace] Inference` timings under ~1s.

### If recognition is worse on iOS than Android
The likely cause is **front-camera orientation/mirroring**: ML Kit's face bbox
and `expo-image-manipulator`'s crop must share the same coordinate space. Grab
the `[FaceQuality] detected bbox=…` and `[EdgeFace] Inference` logs from a real
device — that's the data needed to correct the crop. This is the one thing that
cannot be validated without an actual iPhone.

---

## Known non-issues (already handled)

- **ML Kit "no face detected" on iOS** — fixed by
  `patches/@react-native-ml-kit+face-detection+2.0.1.patch` (file:// URL + image
  orientation). Applied automatically by `patch-package` on every `npm install`,
  including on EAS and CI.
- **Core ML delegate** — enabled by the config plugin; if Core ML can't load the
  model, the code falls back to CPU automatically. Recognition still works.
- **`mobilenetv2_liveness.tflite` missing** — only referenced by
  `services/miniFASNetAntiSpoofService.ts`, which is **not imported anywhere**
  (dead code). Do **not** wire it into the pipeline without adding that model
  file first, or the JS bundle will fail to build.
