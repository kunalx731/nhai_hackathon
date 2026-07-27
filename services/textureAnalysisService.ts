/**
 * LBP (Local Binary Patterns) texture anti-spoofing.
 *
 * Works on a 64×64 face crop — fast enough to sit inline in the verification
 * pipeline (~50–70ms total including crop+decode).
 *
 * Principle: real faces have varied, high-entropy skin texture. Printed photos
 * and screens produce flatter LBP histograms with lower Shannon entropy.
 *
 * Tune LBP_ENTROPY_THRESHOLD in constants/model.ts:
 *   ↑ stricter (fewer false-accepts, more false-rejects)
 *   ↓ permissive (fewer false-rejects, more false-accepts)
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { LBP_ENTROPY_THRESHOLD, LBP_ANALYSIS_SIZE } from '../constants/model';
import type { BoundingBox } from './faceQualityService';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jpegjs = require('jpeg-js') as {
  decode: (data: ArrayBuffer, opts?: { useTArray?: boolean; maxMemoryUsageInMB?: number }) =>
    { width: number; height: number; data: Uint8Array };
};

export interface TextureLivenessResult {
  passed: boolean;
  entropy: number; // raw LBP entropy for diagnostics / sync payload
}

export async function assessTextureLiveness(
  imagePath: string,
  cropBox: BoundingBox,
  imageSize: { width: number; height: number },
): Promise<TextureLivenessResult> {
  try {
    const uri = imagePath.startsWith('file://') ? imagePath : `file://${imagePath}`;

    const padX = Math.round(cropBox.width  * 0.15);
    const padY = Math.round(cropBox.height * 0.15);
    const originX = Math.max(0, Math.round(cropBox.left - padX));
    const originY = Math.max(0, Math.round(cropBox.top  - padY));
    const cropW   = Math.min(imageSize.width  - originX, Math.round(cropBox.width  + padX * 2));
    const cropH   = Math.min(imageSize.height - originY, Math.round(cropBox.height + padY * 2));

    const processed = await ImageManipulator.manipulateAsync(
      uri,
      [
        { crop: { originX, originY, width: cropW, height: cropH } },
        { resize: { width: LBP_ANALYSIS_SIZE, height: LBP_ANALYSIS_SIZE } },
      ],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG },
    );

    const b64 = await FileSystem.readAsStringAsync(processed.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const binaryStr = atob(b64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

    const { data: rgba } = jpegjs.decode(bytes.buffer, {
      useTArray: true,
      maxMemoryUsageInMB: 16,
    });

    const entropy = _lbpEntropy(rgba, LBP_ANALYSIS_SIZE, LBP_ANALYSIS_SIZE);
    console.log(`[Texture] LBP entropy=${entropy.toFixed(3)} threshold=${LBP_ENTROPY_THRESHOLD} → ${entropy >= LBP_ENTROPY_THRESHOLD ? 'PASS' : 'FAIL'}`);

    return { passed: entropy >= LBP_ENTROPY_THRESHOLD, entropy };
  } catch (err) {
    // Fail-open: don't block a real user because of an image processing error
    console.warn('[Texture] LBP analysis error — defaulting to pass:', err);
    return { passed: true, entropy: -1 };
  }
}

function _lbpEntropy(rgba: Uint8Array, width: number, height: number): number {
  // RGBA → grayscale (BT.601 luma)
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    gray[i] = ((0.299 * rgba[i * 4]) + (0.587 * rgba[i * 4 + 1]) + (0.114 * rgba[i * 4 + 2])) | 0;
  }

  // 3×3 LBP — skip 1px border
  const hist = new Float32Array(256);
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const c = gray[y * width + x];
      const code =
        (gray[(y-1) * width + (x-1)] >= c ? 1   : 0) |
        (gray[(y-1) * width +  x   ] >= c ? 2   : 0) |
        (gray[(y-1) * width + (x+1)] >= c ? 4   : 0) |
        (gray[ y   * width + (x+1)] >= c ? 8   : 0) |
        (gray[(y+1) * width + (x+1)] >= c ? 16  : 0) |
        (gray[(y+1) * width +  x   ] >= c ? 32  : 0) |
        (gray[(y+1) * width + (x-1)] >= c ? 64  : 0) |
        (gray[ y   * width + (x-1)] >= c ? 128 : 0);
      hist[code]++;
      count++;
    }
  }

  // Shannon entropy of the normalized histogram
  let entropy = 0;
  for (let i = 0; i < 256; i++) {
    if (hist[i] > 0) {
      const p = hist[i] / count;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}
