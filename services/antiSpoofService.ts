import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import type { TensorflowModel } from 'react-native-fast-tflite';
import { DEEPPIXBIS_INPUT_SIZE, DEEPPIXBIS_THRESHOLD } from '../constants/model';
import type { BoundingBox } from './faceQualityService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jpegjs = require('jpeg-js') as {
  decode: (
    data: ArrayBuffer,
    opts?: { useTArray?: boolean; maxMemoryUsageInMB?: number }
  ) => { width: number; height: number; data: Uint8Array };
};

export interface AntiSpoofResult {
  passed: boolean;
  score: number; // 0.0–1.0, higher = more real
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _model: TensorflowModel | null = null;
let _initPromise: Promise<void> | null = null;

export function initializeAntiSpoof(): Promise<void> {
  if (_initPromise) return _initPromise;
  _initPromise = _doInit();
  return _initPromise;
}

async function _doInit(): Promise<void> {
  // Model removed to stay under 20 MB — antispoof stage is disabled via PIPELINE_ANTISPOOF.
  _model = null;
}

// ─── Inference ────────────────────────────────────────────────────────────────

export async function checkAntiSpoof(
  imagePath: string,
  cropBox?: BoundingBox,
  imageSize?: { width: number; height: number },
): Promise<AntiSpoofResult> {
  await initializeAntiSpoof();

  if (!_model) {
    return { passed: true, score: 1.0 };
  }

  try {
    const uri = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;
    const S = DEEPPIXBIS_INPUT_SIZE;

    const manipOps: ImageManipulator.Action[] = [];
    if (cropBox && imageSize) {
      const padX = Math.round(cropBox.width * 0.15);
      const padY = Math.round(cropBox.height * 0.15);
      const originX = Math.max(0, Math.round(cropBox.left - padX));
      const originY = Math.max(0, Math.round(cropBox.top - padY));
      const cropW = Math.min(imageSize.width - originX, Math.round(cropBox.width + padX * 2));
      const cropH = Math.min(imageSize.height - originY, Math.round(cropBox.height + padY * 2));
      manipOps.push({ crop: { originX, originY, width: cropW, height: cropH } });
    }
    manipOps.push({ resize: { width: S, height: S } });

    const processed = await ImageManipulator.manipulateAsync(
      uri,
      manipOps,
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
    );

    const b64 = await FileSystem.readAsStringAsync(processed.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const { data: rgba } = jpegjs.decode(bytes.buffer, {
      useTArray: true,
      maxMemoryUsageInMB: 64,
    });

    const MEAN = [0.5931, 0.4690, 0.4229];
    const STD  = [0.2471, 0.2214, 0.2157];
    const inputBuffer = new Float32Array(S * S * 3);
    for (let h = 0; h < S; h++) {
      for (let w = 0; w < S; w++) {
        const src = (h * S + w) * 4;
        const dst = (h * S + w) * 3;
        inputBuffer[dst + 0] = (rgba[src + 0] / 255.0 - MEAN[0]) / STD[0];
        inputBuffer[dst + 1] = (rgba[src + 1] / 255.0 - MEAN[1]) / STD[1];
        inputBuffer[dst + 2] = (rgba[src + 2] / 255.0 - MEAN[2]) / STD[2];
      }
    }

    const [outputTensor] = await _model.run([inputBuffer]);
    const out = outputTensor as Float32Array;
    const realProb = out[0];
    const spoofProb = out[1];
    const passed = realProb > DEEPPIXBIS_THRESHOLD;

    console.log(`[AntiSpoof] real=${realProb.toFixed(4)} spoof=${spoofProb.toFixed(4)} → ${passed ? 'REAL' : 'SPOOF'}`);
    return { passed, score: realProb };
  } catch (err) {
    console.warn('[AntiSpoof] inference failed — fail-open:', err);
    return { passed: true, score: 1.0 };
  }
}
