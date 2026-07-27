import { Image as RNImage } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import FaceDetection from '@react-native-ml-kit/face-detection';

export type BoundingBox = { left: number; top: number; width: number; height: number };

export type FaceQualityResult = {
  passed: boolean;
  boundingBox?: BoundingBox;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
  headEulerAngleY?: number;
  headEulerAngleZ?: number;
  reason?: string;
  // The image ML Kit actually detected on, rotated upright. Downstream steps
  // (embedding, anti-spoof) MUST use this uri + size so the face crop lines up
  // with the bounding box, which is in this upright image's coordinate space.
  uprightImagePath?: string;
  uprightSize?: { width: number; height: number };
};

export type LivenessFaceData = {
  leftEyeOpenProbability: number;
  rightEyeOpenProbability: number;
  headEulerAngleY: number; // rotationY — yaw (left/right)
  headEulerAngleX: number; // rotationX — pitch (up/down)
};

// ─── Orientation handling ─────────────────────────────────────────────────────
// iOS front-camera photos come off the sensor in landscape (e.g. 4032×2268) with
// no corrective EXIF, so ML Kit sees a sideways face and returns nothing. We try
// the four 90° rotations, keep whichever one ML Kit can detect a face in, and
// cache it so later frames only try the known-good rotation first.

const ROTATION_CANDIDATES = [0, 90, 180, 270];
// The rotation (deg) that last produced an upright face. null until discovered.
let _knownRotation: number | null = null;

function _withScheme(imagePath: string): string {
  return imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;
}

function _getSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) =>
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject)
  );
}

async function _rotatedVariant(
  uri: string,
  deg: number
): Promise<{ uri: string; width: number; height: number }> {
  if (deg === 0) {
    const { width, height } = await _getSize(uri);
    return { uri, width, height };
  }
  const r = await ImageManipulator.manipulateAsync(
    uri,
    [{ rotate: deg }],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
  );
  return { uri: r.uri, width: r.width, height: r.height };
}

type DetectedFace = Awaited<ReturnType<typeof FaceDetection.detect>>[number];

type DetectResult = { faces: DetectedFace[]; upright: { uri: string; width: number; height: number } };

async function _detectAt(
  base: string,
  deg: number,
  options: Parameters<typeof FaceDetection.detect>[1]
): Promise<DetectResult | null> {
  try {
    const variant = await _rotatedVariant(base, deg);
    const faces = await FaceDetection.detect(variant.uri, options);
    return faces.length >= 1 ? { faces, upright: variant } : null;
  } catch {
    return null;
  }
}

/**
 * Detect faces, returning them in the most-upright orientation available.
 *
 * ML Kit will happily detect a face that is lying ~90° on its side and report a
 * roll of ±90°, so we can't just take the first rotation that finds a face — we
 * must pick the rotation whose face is closest to upright (smallest |roll|), or
 * the head-angle checks are all offset by 90°. Once found, the rotation is
 * cached (device orientation is stable) so later frames only detect once.
 */
async function _detectUpright(
  imagePath: string,
  options: Parameters<typeof FaceDetection.detect>[1]
): Promise<DetectResult | null> {
  const base = _withScheme(imagePath);

  // Fast path: the cached rotation is already the upright one for this device.
  if (_knownRotation !== null) {
    const cached = await _detectAt(base, _knownRotation, options);
    if (cached) return cached;
  }

  // Search: try every rotation, keep the one whose primary face is most upright.
  let best: (DetectResult & { deg: number; roll: number }) | null = null;
  for (const deg of ROTATION_CANDIDATES) {
    const res = await _detectAt(base, deg, options);
    if (!res) continue;
    const roll = Math.abs(res.faces[0].rotationZ ?? 999);
    if (!best || roll < best.roll) best = { ...res, deg, roll };
  }
  if (best) {
    if (_knownRotation !== best.deg) {
      console.log(`[FaceQuality] upright rotation = ${best.deg}° (roll ${best.roll.toFixed(1)}°)`);
      _knownRotation = best.deg;
    }
    return { faces: best.faces, upright: best.upright };
  }
  return null;
}

/** Raw ML Kit face data without quality filters — used for active liveness checks. */
export async function detectFaceForLiveness(imagePath: string): Promise<LivenessFaceData | null> {
  const result = await _detectUpright(imagePath, {
    performanceMode: 'accurate',
    classificationMode: 'all',
    landmarkMode: 'none',
    contourMode: 'none',
    minFaceSize: 0.1,
    trackingEnabled: false,
  });
  if (!result || result.faces.length !== 1) return null;
  const f = result.faces[0];
  return {
    leftEyeOpenProbability: f.leftEyeOpenProbability ?? 0.5,
    rightEyeOpenProbability: f.rightEyeOpenProbability ?? 0.5,
    headEulerAngleY: f.rotationY,
    headEulerAngleX: f.rotationX,
  };
}

export async function assessFaceQuality(imagePath: string): Promise<FaceQualityResult> {
  if (!imagePath || imagePath.trim().length === 0) {
    return { passed: false, reason: 'No image path provided.' };
  }

  let result: Awaited<ReturnType<typeof _detectUpright>>;
  try {
    result = await _detectUpright(imagePath, {
      performanceMode: 'fast',
      classificationMode: 'all',
      landmarkMode: 'none',
      contourMode: 'none',
      minFaceSize: 0.1,
      trackingEnabled: false,
    });
  } catch (err: any) {
    console.warn('[FaceQuality] ML Kit detection failed:', err);
    return { passed: false, reason: 'Face detection failed.' };
  }

  if (!result || result.faces.length === 0) {
    console.log('[FaceQuality] FAIL — no face detected (all rotations)');
    return { passed: false, reason: 'No face detected. Centre your face in the oval.' };
  }
  if (result.faces.length > 1) {
    console.log(`[FaceQuality] FAIL — ${result.faces.length} faces detected`);
    return { passed: false, reason: 'Multiple faces detected. Ensure only one face is visible.' };
  }

  const face = result.faces[0];
  const { left, top, width, height } = face.frame;
  const leftEye = face.leftEyeOpenProbability;
  const rightEye = face.rightEyeOpenProbability;

  console.log(
    `[FaceQuality] detected bbox=(${left.toFixed(0)},${top.toFixed(0)},${width.toFixed(0)}x${height.toFixed(0)}) ` +
    `leftEye=${leftEye?.toFixed(2) ?? 'n/a'} rightEye=${rightEye?.toFixed(2) ?? 'n/a'}`
  );

  if ((leftEye ?? 0) < 0.5 || (rightEye ?? 0) < 0.5) {
    console.log(`[FaceQuality] FAIL — eyes closed (L=${leftEye?.toFixed(2)} R=${rightEye?.toFixed(2)})`);
    return { passed: false, reason: 'Eyes closed — open your eyes and try again.' };
  }

  return {
    passed: true,
    boundingBox: { left, top, width, height },
    leftEyeOpenProbability: leftEye,
    rightEyeOpenProbability: rightEye,
    smilingProbability: (face as any).smilingProbability as number | undefined,
    headEulerAngleY: face.rotationY,
    headEulerAngleZ: face.rotationZ,
    uprightImagePath: result.upright.uri,
    uprightSize: { width: result.upright.width, height: result.upright.height },
  };
}
