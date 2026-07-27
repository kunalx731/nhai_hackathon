/**
 * Passive liveness detection service.
 *
 * Runs on the ML Kit face object already produced during quality assessment.
 * No extra photo capture is needed — zero additional latency from camera I/O.
 *
 * Anti-spoofing signals checked:
 *  1. Eyes open  — printed photos can pass eye-open threshold, but combined
 *                  with other signals raises the bar significantly.
 *  2. Non-zero smile — ML Kit returns exactly 0.0 for many printed photos.
 *                      Live faces almost always have a fractional value.
 *  3. Natural head pose — perfect frontal alignment (yaw ≈ 0, roll ≈ 0)
 *                         is more common in printed reference photos than
 *                         in live captures. Slight pose is expected.
 *
 * All three signals together make single-frame spoofing much harder on
 * mid-range devices without requiring any depth sensor.
 */

interface LivenessResult {
  passed: boolean;
  reason?: string;
  eyeScore: number;
  smilingProbability: number;
  headYaw: number;
  headRoll: number;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Both eyes must exceed this probability (0–1). */
const EYE_OPEN_MIN = 0.5;


/** Maximum absolute yaw (left-right rotation). Beyond this = unnatural for auth. */
const HEAD_YAW_MAX = 30;

/** Maximum absolute roll (tilt). Beyond this = unnatural for auth. */
const HEAD_ROLL_MAX = 20;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Assess liveness from ML Kit face classification data.
 *
 * @param face - the face object returned by @react-native-ml-kit/face-detection
 *               (requires classificationMode:'all' during detection)
 */
export function assessLiveness(face: {
  leftEyeOpenProbability?:  number;
  rightEyeOpenProbability?: number;
  smilingProbability?:      number;
  headEulerAngleY?:         number;
  headEulerAngleZ?:         number;
}): LivenessResult {
  // Fail closed: if ML Kit didn't return classification fields, we cannot assess
  // liveness and must reject rather than silently pass.
  if (
    face.leftEyeOpenProbability  == null ||
    face.rightEyeOpenProbability == null ||
    face.smilingProbability      == null
  ) {
    return {
      passed: false,
      reason: 'Unable to assess liveness — ensure classificationMode is enabled and face is well-lit.',
      eyeScore: 0,
      smilingProbability: 0,
      headYaw:  face.headEulerAngleY ?? 0,
      headRoll: face.headEulerAngleZ ?? 0,
    };
  }

  const leftEye  = face.leftEyeOpenProbability;
  const rightEye = face.rightEyeOpenProbability;
  const smiling  = face.smilingProbability;
  const headYaw  = face.headEulerAngleY ?? 0;
  const headRoll = face.headEulerAngleZ ?? 0;
  const eyeScore = Math.min(leftEye, rightEye);

  // ── Check 1: Eyes open ────────────────────────────────────────────────────
  if (eyeScore < EYE_OPEN_MIN) {
    return {
      passed: false,
      reason: 'Eyes closed — open your eyes and try again.',
      eyeScore,
      smilingProbability: smiling,
      headYaw,
      headRoll,
    };
  }

  // ── Check 2: Natural head pose ────────────────────────────────────────────
  if (Math.abs(headYaw) >= HEAD_YAW_MAX) {
    return {
      passed: false,
      reason: 'Head turned too far — look straight at the camera.',
      eyeScore,
      smilingProbability: smiling,
      headYaw,
      headRoll,
    };
  }

  if (Math.abs(headRoll) >= HEAD_ROLL_MAX) {
    return {
      passed: false,
      reason: 'Head tilted too far — keep your head upright.',
      eyeScore,
      smilingProbability: smiling,
      headYaw,
      headRoll,
    };
  }

  return {
    passed: true,
    eyeScore,
    smilingProbability: smiling,
    headYaw,
    headRoll,
  };
}
