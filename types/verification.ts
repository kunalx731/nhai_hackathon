export type VerificationPhase = string;

export interface VerificationMetrics {
  success: boolean;
  matchScore: number;
  processingMs: number;
  matchedUser?: { name: string; employeeId: string; role?: 'Official' | 'PD'; position?: string };
  eventType?: 'check-in' | 'check-out';
}
