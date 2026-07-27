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
};

export type LivenessFaceData = {
  leftEyeOpenProbability: number;
  rightEyeOpenProbability: number;
  headEulerAngleY: number; // rotationY — yaw (left/right)
  headEulerAngleX: number; // rotationX — pitch (up/down)
};

/** Raw ML Kit face data without quality filters — used for active liveness checks. */
export async function detectFaceForLiveness(imagePath: string): Promise<LivenessFaceData | null> {
  const uri = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;
  try {
    const faces = await FaceDetection.detect(uri, {
      performanceMode: 'accurate',
      classificationMode: 'all',
      landmarkMode: 'none',
      contourMode: 'none',
      minFaceSize: 0.1,
      trackingEnabled: false,
    });
    if (faces.length !== 1) return null;
    const f = faces[0];
    return {
      leftEyeOpenProbability: f.leftEyeOpenProbability ?? 0.5,
      rightEyeOpenProbability: f.rightEyeOpenProbability ?? 0.5,
      headEulerAngleY: f.rotationY,
      headEulerAngleX: f.rotationX,
    };
  } catch {
    return null;
  }
}

export async function assessFaceQuality(imagePath: string): Promise<FaceQualityResult> {
  if (!imagePath || imagePath.trim().length === 0) {
    return { passed: false, reason: 'No image path provided.' };
  }

  const uri = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;

  let faces: Awaited<ReturnType<typeof FaceDetection.detect>>;
  try {
    faces = await FaceDetection.detect(uri, {
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

  if (faces.length === 0) {
    console.log('[FaceQuality] FAIL — no face detected');
    return { passed: false, reason: 'No face detected. Centre your face in the oval.' };
  }
  if (faces.length > 1) {
    console.log(`[FaceQuality] FAIL — ${faces.length} faces detected`);
    return { passed: false, reason: 'Multiple faces detected. Ensure only one face is visible.' };
  }

  const face = faces[0];
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
  };
}
