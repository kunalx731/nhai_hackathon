import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  AppState,
  AppStateStatus,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission, useCameraFormat } from 'react-native-vision-camera';
import { useIsFocused, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { VerificationPhase } from '../types/verification';
import CameraOverlay from '../components/CameraOverlay';
import { generateEmbeddingFromImage, initializeEdgeFace, isMockMode, dotProduct } from '../services/edgeFaceService';
import { getAllRegisteredUsers } from '../services/faceTemplateStore';
import { assessFaceQuality, FaceQualityResult, detectFaceForLiveness } from '../services/faceQualityService';
import { checkAntiSpoof, initializeAntiSpoof } from '../services/antiSpoofService';
import { RegisteredUser } from '../types/face';
import { MOBILEFACENET_COSINE_THRESHOLD, PIPELINE_QUALITY_CHECK, PIPELINE_ANTISPOOF, PIPELINE_LIVENESS } from '../constants/model';
import { enqueueSyncItem } from '../services/syncService';

// ─── Active liveness helpers ──────────────────────────────────────────────────

type LivenessAction = 'turn_left' | 'turn_right' | 'turn_up' | 'turn_down';

const LIVENESS_PROMPTS: Record<LivenessAction, string> = {
  turn_left: 'Turn your head left',
  turn_right: 'Turn your head right',
  turn_up: 'Tilt your head up',
  turn_down: 'Tilt your head down',
};

function buildLivenessActions(): LivenessAction[] {
  const actions: LivenessAction[] = ['turn_left', 'turn_right', 'turn_up', 'turn_down'];
  for (let i = actions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [actions[i], actions[j]] = [actions[j], actions[i]];
  }
  return actions;
}

const YAW_THRESHOLD = 8;   // degrees — left/right (rotationY)
const PITCH_THRESHOLD = 6.5; // degrees — up/down (rotationX)

async function detectHeadAction(
  camera: Camera,
  action: LivenessAction,
  onPrompt: (s: string) => void,
  abort: React.MutableRefObject<boolean>,
  timeoutMs = 12000,
): Promise<boolean> {
  onPrompt(LIVENESS_PROMPTS[action]);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && !abort.current) {
    try {
      const photo = await camera.takePhoto({ flash: 'off' });
      if (abort.current) return false;
      const face = await detectFaceForLiveness(photo.path);
      if (!face) continue;
      const yaw = face.headEulerAngleY;
      const pitch = face.headEulerAngleX;
      // per-frame yaw/pitch intentionally not logged — see pipeline summary
      if (action === 'turn_left'  && yaw < -YAW_THRESHOLD)   return true;
      if (action === 'turn_right' && yaw >  YAW_THRESHOLD)   return true;
      if (action === 'turn_up'    && pitch >  PITCH_THRESHOLD) return true;
      if (action === 'turn_down'  && pitch < -PITCH_THRESHOLD) return true;
    } catch { /* ignore */ }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Verification'>;
  route: RouteProp<RootStackParamList, 'Verification'>;
};

const PHASE_LABEL: Record<string, string> = {
  aligning: 'Face Alignment',
  quality: 'Quality Check',
  antispoof: 'Spoof Check',
  matching: 'Template Matching',
  liveness: 'Liveness Check',
  done: 'Complete',
};

export default function VerificationScreen({ navigation, route }: Props) {
  const eventType = route.params?.eventType ?? 'check-in';
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const format = useCameraFormat(device, [{ photoResolution: { width: 1280, height: 960 } }]);
  const isFocused = useIsFocused();
  const cameraRef = useRef<Camera>(null);

  const [phase, setPhase] = useState<VerificationPhase>('aligning');
  const [isRunning, setIsRunning] = useState(false);
  const [faceStatus, setFaceStatus] = useState('Position your face in the oval');
  const [modelReady, setModelReady] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<RegisteredUser[]>([]);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [livenessInstruction, setLivenessInstruction] = useState('');

  const isRunningRef = useRef(false);
  useEffect(() => { isRunningRef.current = isRunning; }, [isRunning]);

  const abortRef = useRef(false);
  useEffect(() => {
    const onBlur = () => {
      abortRef.current = true;
      isRunningRef.current = false;
      setIsRunning(false);
    };
    const onFocus = () => { abortRef.current = false; };
    const unsubBlur = navigation.addListener('blur', onBlur);
    const unsubFocus = navigation.addListener('focus', onFocus);
    return () => { unsubBlur(); unsubFocus(); };
  }, [navigation]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    Promise.all([
      initializeEdgeFace(),
      initializeAntiSpoof(),
      getAllRegisteredUsers(),
    ]).then(([, , users]) => {
      setModelReady(true);
      setMockMode(isMockMode());
      setRegisteredUsers(users);
    });
  }, []);

  type PipelineFn = (
    prePhoto?: { path: string; width: number; height: number },
    preQuality?: FaceQualityResult
  ) => Promise<void>;
  const runPipelineRef = useRef<PipelineFn | null>(null);

  useEffect(() => {
    if (!modelReady || !isFocused || appState !== 'active' || registeredUsers.length === 0) return;

    let active = true;

    async function poll() {
      while (active && !abortRef.current) {
        if (!isRunningRef.current && cameraRef.current) {
          try {
            const photo = await cameraRef.current.takePhoto({ flash: 'off' });
            if (!active || abortRef.current) break;

            if (!PIPELINE_QUALITY_CHECK) {
              if (!isRunningRef.current) {
                console.log('[FaceAuth] Quality check skipped — starting pipeline');
                setFaceStatus('Face detected — verifying…');
                runPipelineRef.current?.(photo, { passed: true });
              }
            } else {
              const quality = await assessFaceQuality(photo.path);
              if (!active) break;
              if (quality.passed && !isRunningRef.current) {
                console.log('[FaceAuth] Face quality OK — starting pipeline');
                setFaceStatus('Face detected — verifying…');
                runPipelineRef.current?.(photo, quality);
              } else if (!quality.passed) {
                setFaceStatus(quality.reason ?? 'Position your face in the oval');
              }
            }
          } catch {
            // silent — camera not ready or screen unfocused
          }
        }
        await new Promise<void>(r => setTimeout(r, 1200));
      }
    }

    poll();
    return () => { active = false; };
  }, [modelReady, isFocused, appState, registeredUsers.length]);

  const runVerificationPipeline = useCallback(async (
    prePhoto?: { path: string; width: number; height: number },
    preQuality?: FaceQualityResult,
  ) => {
    if (isRunningRef.current || !cameraRef.current) return;
    setIsRunning(true);
    isRunningRef.current = true;
    const startTime = Date.now();

    try {
      // ── Quality check ──────────────────────────────────────────────────────
      setPhase('quality');
      let photo: { path: string; width: number; height: number };
      let quality: FaceQualityResult;
      const tDetect = Date.now();

      if (prePhoto && preQuality) {
        photo = prePhoto;
        quality = preQuality;
      } else {
        const captured = await cameraRef.current.takePhoto({ flash: 'off' });
        photo = captured;
        if (PIPELINE_QUALITY_CHECK) {
          quality = await assessFaceQuality(captured.path);
          if (!quality.passed) {
            setPhase('aligning');
            setIsRunning(false);
            return;
          }
        } else {
          quality = { passed: true };
        }
      }
      const detectMs = Date.now() - tDetect;

      // ML Kit may have detected on a rotated-upright copy; use that same image +
      // size for anti-spoof and embedding so the face crop lines up with the bbox.
      const srcPath = quality.uprightImagePath ?? photo.path;
      const srcSize = quality.uprightSize ?? { width: photo.width, height: photo.height };

      // ── Anti-spoof ─────────────────────────────────────────────────────────
      if (PIPELINE_ANTISPOOF) {
        setPhase('antispoof');
        const spoofResult = await checkAntiSpoof(
          srcPath,
          quality.boundingBox,
          srcSize,
        );
        if (!spoofResult.passed) {
          console.log(`[FaceAuth] SPOOF DETECTED — score=${spoofResult.score.toFixed(3)}`);
          setFaceStatus('Spoof detected — use your real face');
          setPhase('aligning');
          setIsRunning(false);
          isRunningRef.current = false;
          return;
        }
      }

      // ── Embedding + template match ─────────────────────────────────────────
      setPhase('matching');
      const tVerify = Date.now();
      const embedding = await generateEmbeddingFromImage(
        srcPath,
        quality.boundingBox,
        srcSize,
      );

      let bestScore = -1;
      let matchedUser: RegisteredUser | null = null;
      outer: for (const user of registeredUsers) {
        for (const template of user.templates) {
          try {
            const score = dotProduct(embedding, template.embedding);
            if (score > bestScore) {
              bestScore = score;
              matchedUser = user;
              if (score >= MOBILEFACENET_COSINE_THRESHOLD) break outer;
            }
          } catch (e) {
            console.warn('[FaceAuth] dotProduct failed (dim mismatch?):', e);
          }
        }
      }
      const verifyMs = Date.now() - tVerify;

      const finalScore = Math.max(0, bestScore);
      const faceMatched = registeredUsers.length > 0 && finalScore >= MOBILEFACENET_COSINE_THRESHOLD;

      if (!faceMatched) {
        const totalMs = Date.now() - startTime;
        console.log([
          '[FaceAuth] Pipeline summary:',
          `  Face detection : ${detectMs}ms`,
          `  Verification   : ${verifyMs}ms  (embedding + match)`,
          `  Total          : ${totalMs}ms`,
          `  Match          : NO MATCH — best score ${finalScore.toFixed(3)} < threshold ${MOBILEFACENET_COSINE_THRESHOLD}`,
          `  Result         : FAIL`,
        ].join('\n'));
        enqueueSyncItem({
          type: 'VERIFICATION_EVENT',
          payload: {
            employeeId: matchedUser?.employeeId,
            matchedName: matchedUser?.name,
            success: false,
            livenessPass: false,
            matchScore: finalScore,
            processingMs: totalMs,
            timestamp: new Date().toISOString(),
            eventType,
          },
        }).catch(err => console.warn('[FaceAuth] enqueue failed:', err));
        setPhase('done');
        setIsRunning(false);
        navigation.replace('Result', {
          success: false,
          matchScore: finalScore,
          processingMs: totalMs,
          eventType,
        });
        return;
      }

      // ── Active liveness ────────────────────────────────────────────────────
      let livenessPass = true;
      let livenessMs = 0;
      if (PIPELINE_LIVENESS) {
        setPhase('liveness');
        setLivenessInstruction('');
        const tLiveness = Date.now();
        const livenessActions = buildLivenessActions();
        for (const action of livenessActions) {
          const ok = await detectHeadAction(cameraRef.current!, action, setLivenessInstruction, abortRef);
          if (!ok || abortRef.current) { livenessPass = false; break; }
        }
        livenessMs = Date.now() - tLiveness;
      }

      const processingMs = Date.now() - startTime;

      console.log([
        '[FaceAuth] Pipeline summary:',
        `  Face detection : ${detectMs}ms`,
        `  Verification   : ${verifyMs}ms  (embedding + match, score=${finalScore.toFixed(3)})`,
        PIPELINE_LIVENESS ? `  Liveness       : ${livenessMs}ms  (${livenessPass ? 'PASS' : 'FAIL — timeout'})` : '  Liveness       : disabled',
        `  Total          : ${processingMs}ms`,
        `  Match          : ${matchedUser?.name ?? 'none'} (score=${finalScore.toFixed(3)} threshold=${MOBILEFACENET_COSINE_THRESHOLD})`,
        `  Result         : ${livenessPass ? 'PASS' : 'FAIL'}`,
      ].join('\n'));

      enqueueSyncItem({
        type: 'VERIFICATION_EVENT',
        payload: {
          employeeId: matchedUser?.employeeId,
          matchedName: matchedUser?.name,
          success: livenessPass,
          livenessPass,
          matchScore: finalScore,
          processingMs,
          timestamp: new Date().toISOString(),
          eventType,
        },
      }).catch(err => console.warn('[FaceAuth] enqueue failed:', err));

      setPhase('done');
      setIsRunning(false);
      navigation.replace('Result', {
        success: livenessPass,
        matchScore: finalScore,
        processingMs,
        matchedUser: livenessPass && matchedUser
          ? {
            name: matchedUser.name,
            employeeId: matchedUser.employeeId,
            role: matchedUser.role ?? 'PD',
            position: matchedUser.position ?? 'Employee',
          }
          : undefined,
        eventType,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      console.error('[FaceAuth] Pipeline error:', msg);
      setPhase('aligning');
      setIsRunning(false);
    }
  }, [isRunning, registeredUsers, navigation]);

  useEffect(() => { runPipelineRef.current = runVerificationPipeline; }, [runVerificationPipeline]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Camera Access Needed</Text>
          <Text style={styles.permissionBody}>
            Face authentication requires your front camera.{'\n'}
            All processing happens on-device — nothing is uploaded.
          </Text>
          <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
            <Text style={styles.grantButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.textButton} onPress={() => navigation.goBack()}>
            <Text style={styles.textButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionIcon}>⚠️</Text>
          <Text style={styles.permissionTitle}>No Front Camera</Text>
          <Text style={styles.permissionBody}>
            A front-facing camera is required for face authentication.
          </Text>
          <TouchableOpacity style={styles.textButton} onPress={() => navigation.goBack()}>
            <Text style={styles.textButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (modelReady && registeredUsers.length === 0) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <View style={styles.permissionCard}>
          <Text style={styles.permissionIcon}>👤</Text>
          <Text style={styles.permissionTitle}>No Registered Users</Text>
          <Text style={styles.permissionBody}>
            Register at least one employee before running verification.
          </Text>
          <TouchableOpacity style={styles.textButton} onPress={() => navigation.goBack()}>
            <Text style={styles.textButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive={isFocused && phase !== 'done' && appState === 'active'}
        photo
      />

      {mockMode && (
        <SafeAreaView style={styles.mockBadgeContainer} pointerEvents="none">
          <View style={styles.mockBadge}>
            <Text style={styles.mockBadgeText}>MOCK MODE</Text>
          </View>
        </SafeAreaView>
      )}

      <CameraOverlay phase={phase} />

      <SafeAreaView style={styles.bottomSafeArea}>
        <View style={styles.panel}>
          <View style={styles.statusBox}>
            {isRunning ? (
              <View style={styles.statusRow}>
                <ActivityIndicator color="#2563EB" size="small" />
                <Text style={styles.statusText}>
                  {phase === 'liveness' && livenessInstruction
                    ? livenessInstruction
                    : `${PHASE_LABEL[phase] ?? phase}…`}
                </Text>
              </View>
            ) : !modelReady ? (
              <View style={styles.statusRow}>
                <ActivityIndicator color="#4B5563" size="small" />
                <Text style={[styles.statusText, styles.statusMuted]}>Loading model…</Text>
              </View>
            ) : (
              <View style={styles.statusRow}>
                <View style={styles.pulseDot} />
                <Text style={styles.statusText}>{faceStatus}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centeredScreen: {
    flex: 1,
    backgroundColor: '#0F1117',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  permissionCard: {
    backgroundColor: '#1A1E2E',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#252A3A',
  },
  permissionIcon: {
    fontSize: 40,
    marginBottom: 4,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  permissionBody: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
  },
  grantButton: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  grantButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  textButton: {
    paddingVertical: 8,
  },
  textButtonText: {
    color: '#6B7280',
    fontSize: 14,
  },
  mockBadgeContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  mockBadge: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
    marginTop: 8,
  },
  mockBadgeText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  bottomSafeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  panel: {
    backgroundColor: 'rgba(10, 12, 20, 0.92)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 24,
    gap: 14,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  statusBox: {
    backgroundColor: '#1A1E2E',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252A3A',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    color: '#D1D5DB',
    fontSize: 15,
    fontWeight: '500',
  },
  statusMuted: {
    color: '#4B5563',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelButtonText: {
    color: '#4B5563',
    fontSize: 15,
    fontWeight: '500',
  },
});
