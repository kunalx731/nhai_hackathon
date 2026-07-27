// ── Pipeline stage switches ───────────────────────────────────────────────────
// Set any to false to skip that stage and pass through to the next step.
export const PIPELINE_QUALITY_CHECK = true;  // ML Kit face detect + eyes-open gate
export const PIPELINE_FACE_CROP = true;  // crop to face bbox before embedding
export const PIPELINE_CLAHE = false;  // CLAHE contrast enhancement
export const PIPELINE_ANTISPOOF = false;  // DeepPixBis liveness check
export const PIPELINE_LIVENESS = true;  // active head-turn liveness challenges

// ── DeepPixBis anti-spoofing ──────────────────────────────────────────────────
// Input:  [1, 128, 128, 3] NHWC float32
// Preprocessing: pixel/255, then (pixel - mean) / std per channel
// Output: [1, 2] float32 — [spoof_prob, real_prob]; real_prob > 0.5 = real face
export const DEEPPIXBIS_INPUT_SIZE = 128;
export const DEEPPIXBIS_THRESHOLD = 0.5;

export const MOBILEFACENET_MODEL_NAME = "EdgeFace";
export const MOBILEFACENET_MODEL_VERSION = "edgeface-s-gamma05-tflite-v1";
export const MOBILEFACENET_MODEL_PATH = "edgeface_s_gamma_05.tflite";
export const MOBILEFACENET_INPUT_SIZE = 112;

// EdgeFace-S outputs 512-dim embeddings.
export const MOBILEFACENET_EMBEDDING_SIZE = 512;

// Calibrated from live tests: same-person ~0.75–0.85, different-person ~0.0–0.1.
export const MOBILEFACENET_COSINE_THRESHOLD = 0.65;

// LBP texture anti-spoofing — Shannon entropy of 256-bin LBP histogram on 64×64 face crop.
// Real faces (mid-range camera): ~4.8–6.5. Printed / screen photos: ~3.0–4.5.
// Raise toward 4.8 for stricter security; lower toward 3.8 if real users get false-rejected.
export const LBP_ENTROPY_THRESHOLD = 4.2;
export const LBP_ANALYSIS_SIZE = 64;

export const REGISTRATION_MIN_SAMPLES = 3;
export const REGISTRATION_MAX_SAMPLES = 5;

// Pose gate for the "look straight" registration steps (degrees). The face must
// be within these of dead-centre — yaw = turned left/right, roll = tilted
// sideways. Turn/smile steps are intentionally not pose-gated. Loosen if real
// users get rejected while genuinely straight; tighten for stricter capture.
export const STRAIGHT_YAW_MAX_DEG = 18;
export const STRAIGHT_ROLL_MAX_DEG = 15;

// Master switch for the straight-pose gate. Off while we calibrate against real
// on-device angle readings — registration accepts any detected face.
export const ENFORCE_STRAIGHT_POSE = false;

// Bumped every build so we can confirm on-device which IPA is actually running.
export const BUILD_TAG = 'b7-posecal';

export const REGISTRATION_STEPS = [
  "Look straight at the camera",
  "Turn slightly left",
  "Turn slightly right",
  "Smile naturally",
  "Look straight again",
];

// ── MiniFASNet V2 anti-spoofing ───────────────────────────────────────────────
// Input:  [1, 80, 80, 3] NHWC float32 in [0, 1] range
// Output: [1, 3] softmax — index 1 = real face probability
export const MINIFASNET_MODEL_PATH = 'minifasnet.tflite'; // for reference — Metro require() needs a string literal
export const MINIFASNET_INPUT_SIZE = 80;
export const MINIFASNET_REAL_IDX = 1;
// Lower = more permissive (fewer false-rejects). Raise toward 0.8 for stricter security.
export const MINIFASNET_THRESHOLD = 0.75;
// Max allowed score for either spoof class (0=print, 2=screen replay).
// Real faces score ~0.000 on both; screen attacks leak ~0.06+ into class 2.
export const MINIFASNET_SPOOF_MAX = 0.05;
