# Project Context

## Overview
**FaceAuth Lite** - React Native (Expo 52) offline face authentication app for KPMG Hackathon 7.0.
**Deadline**: 05.06.2026

**Goal**: Field workers tap button → face scanned → PASS/FAIL. No internet required. Results sync to AWS when online. Must integrate into "Datalake 3.0" RN app. Model < 20MB, speed < 1s, accuracy > 95%.

## Current Status
- **Android**: Fully working - face detection, registration, verification all functional
- **iOS**: Building but face detection fails with "Quality check failed no face detected"
- **AWS**: Infrastructure deployed via Terraform

## Pipeline (single button tap)
Photo → ML Kit face detect → quality check (eyes open) → EdgeFace 112×112 → 512-dim embedding → dot product vs stored templates (threshold 0.65) → PASS/FAIL → enqueue to sync

## Key Services
- `faceQualityService.ts` - ML Kit face detection, returns bbox + eye probabilities
- `mobileFaceNetService.ts` - EdgeFace TFLite 512-dim embeddings, CoreML fallback on iOS
- `faceTemplateStore.ts` - JSON user templates with in-memory cache
- `syncService.ts` - Queue items for AWS upload on reconnect

## iOS Issue Being Debugged
The `@react-native-ml-kit/face-detection` iOS native code has bugs:
1. **Missing orientation**: Doesn't set `visionImage.orientation` (required by ML Kit docs)
2. **URL parsing**: `[NSURL URLWithString:url]` fails with `file://` paths from camera

A patch exists in `patches/` but needs testing with Xcode console to verify it's applied correctly.

---

# iOS Debugging Guide (for Mac + Xcode + iPhone setup)

## Prerequisites
- Mac with Xcode 14+ installed
- iPhone connected via USB (or simulator)
- Free Apple Developer account (for device testing)
- Node.js 20+, CocoaPods installed

## Step 1: Clone and Setup

```bash
# Clone the repository
git clone https://github.com/Zmey1/kpmg-hackathon-faceauth.git
cd kpmg-hackathon-faceauth

# Switch to the working branch
git checkout final_v1
git pull origin final_v1

# Install dependencies (this also applies patches via postinstall)
npm ci

# Verify patch was applied
cat node_modules/@react-native-ml-kit/face-detection/ios/FaceDetection.m | grep "visionImage.orientation"
# Should show: visionImage.orientation = image.imageOrientation;
```

## Step 2: Generate iOS Project

```bash
# Generate native iOS project
npx expo prebuild --platform ios --clean

# Add CoreML delegate flag to Podfile
echo '$EnableCoreMLDelegate = true' | cat - ios/Podfile > ios/Podfile.tmp && mv ios/Podfile.tmp ios/Podfile

# Install CocoaPods
cd ios
pod install
cd ..
```

## Step 3: Open in Xcode

```bash
# Open the workspace (NOT the .xcodeproj)
open ios/FaceAuthLite.xcworkspace
```

In Xcode:
1. Select your iPhone as the target device (top left)
2. Go to **Signing & Capabilities** → Select your Personal Team
3. Change Bundle Identifier if needed (e.g., `com.yourname.faceauthlite`)
4. Build: **Cmd + B**
5. Run: **Cmd + R**

## Step 4: Debug Face Detection

1. Open **Xcode Console** (View → Debug Area → Activate Console)
2. In the app, go to Registration → Camera
3. Watch console for these log messages:
   - `[FaceQuality]` logs from JS
   - Any ML Kit errors
4. Try capturing a photo and look for:
   - `Failed to load image`
   - `visionImage` errors
   - Face detection results

## Step 5: Key Files to Check

If patches aren't working, manually verify:
```
node_modules/@react-native-ml-kit/face-detection/ios/FaceDetection.m
```

The `detect:` method should have:
- Proper file:// URL handling
- `visionImage.orientation = image.imageOrientation;` line

## Step 6: Testing

1. **Register a face**: Go to Register → Fill form → Capture 5 photos
2. **Verify**: Go to Verify → Look at camera
3. If "No face detected" appears, check:
   - Lighting (needs to be good)
   - Face centered in oval
   - Console logs for actual errors

## Common Issues

| Issue | Solution |
|-------|----------|
| "No provisioning profile" | Sign with Personal Team in Xcode |
| "Pod install fails" | Delete `ios/Pods`, run `pod install --repo-update` |
| "Module not found" | Run `npx expo prebuild --clean` again |
| Face detection always fails | Check if patch is applied, check console logs |

## Contact
Report findings to the main developer with:
1. Xcode console output
2. Which step fails
3. Device model and iOS version
