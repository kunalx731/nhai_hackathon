import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { Platform } from 'react-native';
import { loadTensorflowModel } from 'react-native-fast-tflite';
import type { TensorflowModel, TensorflowModelDelegate } from 'react-native-fast-tflite';
import type { BoundingBox } from './faceQualityService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const UPNG = require('upng-js') as {
  decode: (buf: ArrayBuffer) => { width: number; height: number };
  toRGBA8: (img: object) => ArrayBuffer[];
};

const INPUT_SIZE   = 224;
const SPOOF_THRESHOLD = 0.5; // spoofProb >= 0.5 → spoof (realScore < 0.5 → fail)

export interface MiniFASNetResult {
  passed: boolean;
  realScore: number;
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _model: TensorflowModel | null = null;
let _initPromise: Promise<void> | null = null;
let _useMock = false;

export function initializeMiniFASNet(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = _doInit();
  return _initPromise;
}

async function _doInit(): Promise<void> {
  console.log('[Liveness] init start');
  try {
    // iOS: try core-ml first, fall back to default if CoreML not available
    const delegates: TensorflowModelDelegate[] = Platform.OS === 'ios' ? ['core-ml', 'default'] : ['default'];
    let loadError: unknown;
    for (const delegate of delegates) {
      try {
        console.log('[Liveness] loading model, delegate:', delegate);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        _model = await loadTensorflowModel(
          require('../assets/models/mobilenetv2_liveness.tflite'),
          delegate,
        );
        console.log('[Liveness] model loaded with delegate:', delegate);
        break;
      } catch (e) {
        console.warn(`[Liveness] failed with delegate ${delegate}:`, e);
        loadError = e;
        _model = null;
      }
    }
    if (!_model) throw loadError;
    console.log('[Liveness] inputs:', JSON.stringify(_model.inputs));
    console.log('[Liveness] outputs:', JSON.stringify(_model.outputs));
    console.log('[Liveness] Ready — MobileNetV2 224×224');
    _useMock = false;
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    console.error('[Liveness] INIT FAILED — fail-open mock:', msg);
    _useMock = true;
  }
}

// ─── Crop + resize to 224×224 with 20% padding ───────────────────────────────

async function _cropFace(
  uri: string,
  bx: number, by: number, bw: number, bh: number,
  imgW: number, imgH: number,
) {
  const padX = Math.round(bw * 0.2);
  const padY = Math.round(bh * 0.2);
  const x1 = Math.max(0, bx - padX);
  const y1 = Math.max(0, by - padY);
  const x2 = Math.min(imgW, bx + bw + padX);
  const y2 = Math.min(imgH, by + bh + padY);
  const cropW = Math.max(1, x2 - x1);
  const cropH = Math.max(1, y2 - y1);

  return ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX: x1, originY: y1, width: cropW, height: cropH } },
      { resize: { width: INPUT_SIZE, height: INPUT_SIZE } },
    ],
    { format: ImageManipulator.SaveFormat.PNG },
  );
}

// ─── PNG → RGB float32 [0,1] ─────────────────────────────────────────────────

async function _toInput(pngUri: string): Promise<Float32Array> {
  const b64 = await FileSystem.readAsStringAsync(pngUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const img = UPNG.decode(bytes.buffer);
  const rgba = new Uint8Array(UPNG.toRGBA8(img)[0]);

  // RGBA → RGB float32 [0,1] — Keras ImageDataGenerator uses PIL (RGB), rescale=1/255
  const pixels = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    input[i * 3 + 0] = rgba[i * 4 + 0] / 255.0; // R
    input[i * 3 + 1] = rgba[i * 4 + 1] / 255.0; // G
    input[i * 3 + 2] = rgba[i * 4 + 2] / 255.0; // B
  }
  return input;
}

// ─── Inference ────────────────────────────────────────────────────────────────

export async function assessMiniFASNetLiveness(
  imagePath: string,
  cropBox: BoundingBox,
  imageSize: { width: number; height: number },
): Promise<MiniFASNetResult> {
  await initializeMiniFASNet();

  if (_useMock || !_model) {
    console.warn('[Liveness] mock mode — defaulting to pass');
    return { passed: true, realScore: -1 };
  }

  try {
    const uri = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;
    const { left: bx, top: by, width: bw, height: bh } = cropBox;

    const cropped = await _cropFace(uri, bx, by, bw, bh, imageSize.width, imageSize.height)
      .catch(() => _cropFace(uri, bx, by, bw, bh, imageSize.height, imageSize.width));

    const input = await _toInput(cropped.uri);

    const out = await _model.run([input]);
    const result = out[0] as Float32Array;
    const realScore = result[0];          // sigmoid output: 1.0 = live, 0.0 = spoof
    const spoofProb = 1 - realScore;
    const passed = spoofProb < SPOOF_THRESHOLD;

    console.log(
      `[Liveness] spoofProb=${spoofProb.toFixed(3)} threshold=${SPOOF_THRESHOLD} → ${passed ? 'PASS' : 'FAIL'}`,
    );

    return { passed, realScore: 1 - spoofProb };
  } catch (err) {
    console.warn('[Liveness] inference error — defaulting to pass:', err);
    return { passed: true, realScore: -1 };
  }
}
