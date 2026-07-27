/**
 * EdgeFace embedding service.
 *
 * Runtime: react-native-fast-tflite v2 (JSI bindings, no nitro-modules,
 * compatible with Kotlin 1.9.25 / Expo 52).
 * Model: edgeface_s_gamma_05.tflite — EdgeFace-S gamma=0.5 (accuracy preserved).
 * Delegate: Core ML (iOS) / android-gpu (Android) for hardware acceleration.
 *
 * Preprocessing pipeline:
 *   1. expo-image-manipulator — crop face + resize to 112×112 in one call (native speed)
 *   2. expo-file-system       — read tiny 112×112 JPEG as base64
 *   3. jpeg-js                — decode JPEG → RGBA uint8
 *   4. (bilinear resize skipped — already 112×112)
 *   5. float32 normalize      — RGBA → RGB float32, [-1, 1]
 *   6. TFLite run             — embedding float32 array
 *   7. l2Normalize            — unit-length vector
 *
 * Fallback: if model load fails, deterministic MOCK embeddings are used so
 * the UI flow stays testable. MOCK embeddings are NOT real recognition.
 */

import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import { Platform, Image as RNImage } from 'react-native';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { TensorflowModel, TensorflowModelDelegate } from 'react-native-fast-tflite';
import { MOBILEFACENET_EMBEDDING_SIZE, PIPELINE_CLAHE, PIPELINE_FACE_CROP } from '../constants/model';
import type { BoundingBox } from './faceQualityService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jpegjs = require('jpeg-js') as {
  decode: (
    data: ArrayBuffer,
    opts?: { useTArray?: boolean; maxMemoryUsageInMB?: number }
  ) => { width: number; height: number; data: Uint8Array };
};

export type FaceEmbedding = number[];

// ─── State ───────────────────────────────────────────────────────────────────

let _model: TensorflowModel | null = null;
let _inputH = 112;
let _inputW = 112;
let _embeddingSize = MOBILEFACENET_EMBEDDING_SIZE;
let _initPromise: Promise<void> | null = null;
let _useMock = false;

// ─── Initialization ──────────────────────────────────────────────────────────

export function initializeEdgeFace(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = _doInit();
  return _initPromise;
}

async function _doInit(): Promise<void> {
  try {
    // Pass require() directly — react-native-fast-tflite resolves bundled assets
    // via Image.resolveAssetSource(), no expo-asset/downloadAsync needed.
    // android-gpu rejects models with ops it doesn't support (common after litert/torch conversion)
    // iOS: try core-ml first, fall back to default if CoreML not available or model incompatible
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const modelModule = require('../assets/models/edgeface_s_gamma_05.tflite');

    // Resolve the bundled model to a concrete local file URI. On iOS *release*
    // builds the .tflite lives inside the app bundle (not served by Metro), and
    // fast-tflite loads far more reliably from an explicit file:// path than from
    // a raw require() handle — a failure here is what silently drops us to MOCK.
    let assetUrl: string | null = null;
    try {
      const asset = Asset.fromModule(modelModule);
      if (!asset.localUri) await asset.downloadAsync();
      assetUrl = asset.localUri ?? asset.uri ?? null;
      console.log(`[EdgeFace] model asset resolved: ${assetUrl}`);
    } catch (e) {
      console.warn('[EdgeFace] expo-asset resolve failed, will fall back to require():', e);
    }

    const delegates: TensorflowModelDelegate[] = Platform.OS === 'ios' ? ['core-ml', 'default'] : ['default'];
    let loadError: unknown;
    let usedDelegate: TensorflowModelDelegate | null = null;
    for (const delegate of delegates) {
      // Prefer the resolved file URL; fall back to the raw require() handle.
      const sources: any[] = assetUrl ? [{ url: assetUrl }, modelModule] : [modelModule];
      for (const source of sources) {
        try {
          _model = await loadTensorflowModel(source, delegate);
          usedDelegate = delegate;
          break;
        } catch (e) {
          loadError = e;
          _model = null;
        }
      }
      if (_model) break;
      console.warn(`[EdgeFace] delegate ${delegate} unavailable, trying next…`);
    }
    if (!_model) throw loadError;

    const inp = _model.inputs[0];
    const out = _model.outputs[0];

    if (inp.shape.length === 4) {
      // Detect NCHW vs NHWC format based on channel position
      // NCHW: [batch, channels, height, width] — channels (3) is small
      // NHWC: [batch, height, width, channels] — channels is last
      if (inp.shape[1] <= 4) {
        // NCHW format: [1, 3, 112, 112]
        _inputH = inp.shape[2];
        _inputW = inp.shape[3];
      } else {
        // NHWC format: [1, 112, 112, 3]
        _inputH = inp.shape[1];
        _inputW = inp.shape[2];
      }
    }
    if (out.shape.length === 2) _embeddingSize = out.shape[1];
    else if (out.shape.length === 1) _embeddingSize = out.shape[0];

    console.log(`[EdgeFace] Ready — ${_inputH}x${_inputW} input, ${_embeddingSize}-dim embeddings (delegate: ${usedDelegate})`);
    _useMock = false;
  } catch (err: unknown) {
    const message = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error('[EdgeFace] Init failed — falling back to mock mode');
    console.error('[EdgeFace] error:', message);
    _useMock = true;
  }
}

// ─── Embedding generation ────────────────────────────────────────────────────

export async function generateEmbeddingFromImage(
  imagePath: string,
  cropBox?: BoundingBox,
  imageSize?: { width: number; height: number }
): Promise<FaceEmbedding> {
  await initializeEdgeFace();
  if (_useMock || !_model) return _mockEmbedding(imagePath);

  try {
    const uri = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;

    let t = Date.now();
    const manipOps: ImageManipulator.Action[] = [];
    if (PIPELINE_FACE_CROP && cropBox) {
      const { width: imgW, height: imgH } = imageSize ?? await _getImageSize(uri);
      const padX = Math.round(cropBox.width * 0.15);
      const padY = Math.round(cropBox.height * 0.15);
      const originX = Math.max(0, Math.round(cropBox.left - padX));
      const originY = Math.max(0, Math.round(cropBox.top - padY));
      const cropW = Math.min(imgW - originX, Math.round(cropBox.width + padX * 2));
      const cropH = Math.min(imgH - originY, Math.round(cropBox.height + padY * 2));
      manipOps.push({ crop: { originX, originY, width: cropW, height: cropH } });
    }
    manipOps.push({ resize: { width: _inputW, height: _inputH } });
    const processed = await ImageManipulator.manipulateAsync(
      uri,
      manipOps,
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    const tCrop = Date.now() - t;

    t = Date.now();
    const b64 = await FileSystem.readAsStringAsync(processed.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const tRead = Date.now() - t;

    t = Date.now();
    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const { data: rgba, width, height } = jpegjs.decode(bytes.buffer, {
      useTArray: true,
      maxMemoryUsageInMB: 64,
    });
    const tDecode = Date.now() - t;

    const resized = (width === _inputW && height === _inputH)
      ? rgba
      : _bilinearResize(rgba, width, height, _inputW, _inputH);

    t = Date.now();
    const enhanced = PIPELINE_CLAHE ? _applyCLAHE(resized, _inputW, _inputH) : resized;

    t = Date.now();
    const numPixels = _inputW * _inputH;
    const inputBuffer = new Float32Array(3 * numPixels);
    // Convert RGBA (HWC) to RGB (NCHW) format for EdgeFace model
    // NCHW layout: [all R values][all G values][all B values]
    for (let h = 0; h < _inputH; h++) {
      for (let w = 0; w < _inputW; w++) {
        const srcIdx = (h * _inputW + w) * 4;  // RGBA source pixel
        const dstPixel = h * _inputW + w;
        // Channel 0 (R): indices [0, numPixels)
        // Channel 1 (G): indices [numPixels, 2*numPixels)
        // Channel 2 (B): indices [2*numPixels, 3*numPixels)
        inputBuffer[0 * numPixels + dstPixel] = (enhanced[srcIdx + 0] - 128) / 128.0;
        inputBuffer[1 * numPixels + dstPixel] = (enhanced[srcIdx + 1] - 128) / 128.0;
        inputBuffer[2 * numPixels + dstPixel] = (enhanced[srcIdx + 2] - 128) / 128.0;
      }
    }
    const tNorm = Date.now() - t;

    t = Date.now();
    const [outputTensor] = await _model.run([inputBuffer]);
    const tInfer = Date.now() - t;
    console.log(`[EdgeFace] Inference — crop: ${tCrop}ms, decode: ${tDecode}ms, normalize: ${tNorm}ms, tflite: ${tInfer}ms`);

    const rawEmbedding = Array.from(outputTensor as Float32Array);
    if (rawEmbedding.length !== _embeddingSize) {
      console.warn(`[EdgeFace] Output length ${rawEmbedding.length} ≠ expected ${_embeddingSize}.`);
    }

    const embedding = l2Normalize(rawEmbedding);
    return embedding;
  } catch (err) {
    console.warn('[EdgeFace] Inference failed, falling back to mock:', err);
    return _mockEmbedding(imagePath);
  }
}

// ─── Image size helper ────────────────────────────────────────────────────────

function _getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) =>
    RNImage.getSize(uri, (width, height) => resolve({ width, height }), reject)
  );
}

// ─── Math helpers ─────────────────────────────────────────────────────────────

export function l2Normalize(vector: number[]): number[] {
  const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
  if (norm === 0) return vector.slice();
  return vector.map(v => v / norm);
}

export function cosineSimilarity(a: FaceEmbedding, b: FaceEmbedding): number {
  if (a.length !== b.length) {
    throw new Error(
      `Embedding dimension mismatch: ${a.length} vs ${b.length}. Same model version required.`
    );
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Use instead of cosineSimilarity when both vectors are already L2-normalized (norm=1).
// Equivalent result, skips two sqrt calls per comparison.
export function dotProduct(a: FaceEmbedding, b: FaceEmbedding): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// ─── CLAHE (Contrast Limited Adaptive Histogram Equalization) ────────────────
// Applied to luminance channel only; RGB is scaled proportionally to preserve hue.
// Reduces false rejects from harsh sunlight / deep shadows on faces.

function _applyCLAHE(rgba: Uint8Array, width: number, height: number): Uint8Array {
  const TILE = 8;          // 8×8 pixel tiles → 14×14 grid for 112×112 input
  const CLIP = 2.5;        // clip limit (higher = more aggressive enhancement)
  const tilesX = Math.ceil(width / TILE);
  const tilesY = Math.ceil(height / TILE);

  // Extract per-pixel luminance (BT.601)
  const luma = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    luma[i] = Math.round(0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]);
  }

  // Compute clipped + equalized CDF for every tile
  const cdfs: Float32Array[] = new Array(tilesY * tilesX);
  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * TILE, x1 = Math.min(x0 + TILE, width);
      const y0 = ty * TILE, y1 = Math.min(y0 + TILE, height);
      const tileArea = (x1 - x0) * (y1 - y0);

      const hist = new Uint32Array(256);
      for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++)
          hist[luma[y * width + x]]++;

      // Clip and redistribute excess
      const clipCount = Math.max(1, Math.round(CLIP * tileArea / 256));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipCount) { excess += hist[i] - clipCount; hist[i] = clipCount; }
      }
      const add = Math.floor(excess / 256);
      const rem = excess - add * 256;
      for (let i = 0; i < 256; i++) hist[i] += add;
      for (let i = 0; i < rem; i++) hist[i]++;

      // Build normalized CDF → [0, 1]
      const cdf = new Float32Array(256);
      let cumsum = 0, cdfMin = -1;
      for (let i = 0; i < 256; i++) {
        cumsum += hist[i];
        cdf[i] = cumsum;
        if (cdfMin < 0 && cumsum > 0) cdfMin = cumsum;
      }
      const denom = tileArea - (cdfMin > 0 ? cdfMin : 0);
      for (let i = 0; i < 256; i++)
        cdf[i] = denom > 0 ? Math.max(0, cdf[i] - (cdfMin > 0 ? cdfMin : 0)) / denom : 0;

      cdfs[ty * tilesX + tx] = cdf;
    }
  }

  // Bilinear interpolation between tile CDFs and scale RGB by luma ratio
  const out = new Uint8Array(rgba.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const p = idx * 4;

      const tx = (x + 0.5) / TILE - 0.5;
      const ty = (y + 0.5) / TILE - 0.5;
      const tx0 = Math.max(0, Math.floor(tx));
      const ty0 = Math.max(0, Math.floor(ty));
      const tx1 = Math.min(tilesX - 1, tx0 + 1);
      const ty1 = Math.min(tilesY - 1, ty0 + 1);
      const fx = Math.max(0, tx - tx0);
      const fy = Math.max(0, ty - ty0);

      const v = luma[idx];
      const mapped =
        cdfs[ty0 * tilesX + tx0][v] * (1 - fx) * (1 - fy) +
        cdfs[ty0 * tilesX + tx1][v] *      fx  * (1 - fy) +
        cdfs[ty1 * tilesX + tx0][v] * (1 - fx) *      fy  +
        cdfs[ty1 * tilesX + tx1][v] *      fx  *      fy;

      const newLuma = mapped * 255;
      const ratio = v > 0 ? newLuma / v : 1;
      out[p]     = Math.min(255, Math.round(rgba[p]     * ratio));
      out[p + 1] = Math.min(255, Math.round(rgba[p + 1] * ratio));
      out[p + 2] = Math.min(255, Math.round(rgba[p + 2] * ratio));
      out[p + 3] = rgba[p + 3];
    }
  }
  return out;
}

// ─── Bilinear resize (pure JS) ────────────────────────────────────────────────

function _bilinearResize(
  src: Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): Uint8Array {
  const out = new Uint8Array(dstW * dstH * 4);
  const xScale = srcW / dstW;
  const yScale = srcH / dstH;
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const sx = (dx + 0.5) * xScale - 0.5;
      const sy = (dy + 0.5) * yScale - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(srcW - 1, x0 + 1);
      const y1 = Math.min(srcH - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      const di = (dy * dstW + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const tl = src[(y0 * srcW + x0) * 4 + c];
        const tr = src[(y0 * srcW + x1) * 4 + c];
        const bl = src[(y1 * srcW + x0) * 4 + c];
        const br = src[(y1 * srcW + x1) * 4 + c];
        out[di + c] = Math.round(
          tl * (1 - fx) * (1 - fy) + tr * fx * (1 - fy) +
          bl * (1 - fx) * fy       + br * fx * fy
        );
      }
    }
  }
  return out;
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

/** Deterministic pseudo-embedding for UI testing. *** NOT real recognition *** */
function _mockEmbedding(imagePath: string): FaceEmbedding {
  const seed = _hashString(imagePath);
  let state = seed;
  const raw: number[] = [];
  for (let i = 0; i < _embeddingSize; i++) {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    raw.push((state / 0x80000000) - 1);
  }
  return l2Normalize(raw);
}

function _hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    hash = hash & 0xffffffff;
  }
  return Math.abs(hash);
}

export function isMockMode(): boolean { return _useMock; }
export function getModelInfo() {
  return { inputH: _inputH, inputW: _inputW, embeddingSize: _embeddingSize };
}
