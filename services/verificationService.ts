/**
 * Face verification service.
 * Compares a live image against all stored templates for a given employee ID.
 * No liveness detection in this module — that is a separate concern.
 */

import { generateEmbeddingFromImage, dotProduct } from './edgeFaceService';
import { getRegisteredUser } from './faceTemplateStore';
import { MOBILEFACENET_COSINE_THRESHOLD } from '../constants/model';

export type VerificationResult = {
  passed: boolean;
  bestScore: number;
  threshold: number;
  matchedTemplateId?: string;
  reason?: string;
};

export async function verifyFaceAgainstUser(
  employeeId: string,
  liveImagePath: string
): Promise<VerificationResult> {
  const user = await getRegisteredUser(employeeId);

  if (!user || user.templates.length === 0) {
    return {
      passed: false,
      bestScore: 0,
      threshold: MOBILEFACENET_COSINE_THRESHOLD,
      reason: `No registered templates found for employee ID: ${employeeId}`,
    };
  }

  let liveEmbedding: number[];
  try {
    liveEmbedding = await generateEmbeddingFromImage(liveImagePath);
  } catch (err) {
    return {
      passed: false,
      bestScore: 0,
      threshold: MOBILEFACENET_COSINE_THRESHOLD,
      reason: `Failed to generate embedding from live image: ${String(err)}`,
    };
  }

  let bestScore = -1;
  let matchedTemplateId: string | undefined;

  for (const template of user.templates) {
    try {
      const score = dotProduct(liveEmbedding, template.embedding);
      if (score > bestScore) {
        bestScore = score;
        matchedTemplateId = template.templateId;
        if (score >= MOBILEFACENET_COSINE_THRESHOLD) break;
      }
    } catch {
      // Dimension mismatch — template from a different model version; skip it.
    }
  }

  const passed = bestScore >= MOBILEFACENET_COSINE_THRESHOLD;

  return {
    passed,
    bestScore,
    threshold: MOBILEFACENET_COSINE_THRESHOLD,
    matchedTemplateId: passed ? matchedTemplateId : undefined,
    reason: passed ? undefined : `Best score ${bestScore.toFixed(3)} below threshold ${MOBILEFACENET_COSINE_THRESHOLD}`,
  };
}
