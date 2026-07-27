import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';

import { RootStackParamList } from '../types/navigation';
import { CapturedRegistrationSample, RegisteredUser, RegisteredFaceTemplate } from '../types/face';
import { assessFaceQuality } from '../services/faceQualityService';
import { generateEmbeddingFromImage, initializeEdgeFace, isMockMode } from '../services/edgeFaceService';
import { checkAntiSpoof, initializeAntiSpoof } from '../services/antiSpoofService';
import { saveRegisteredUser, getRegisteredUser } from '../services/faceTemplateStore';
import { MOBILEFACENET_MODEL_NAME, MOBILEFACENET_MODEL_VERSION, REGISTRATION_MAX_SAMPLES, REGISTRATION_STEPS, PIPELINE_ANTISPOOF } from '../constants/model';
import CaptureProgress from '../components/CaptureProgress';
import QualityBadge from '../components/QualityBadge';

const { width } = Dimensions.get('window');
const OVAL_WIDTH = width * 0.68;
const OVAL_HEIGHT = OVAL_WIDTH * 1.35;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'FaceRegistrationCamera'>;
  route: RouteProp<RootStackParamList, 'FaceRegistrationCamera'>;
};

export default function FaceRegistrationCameraScreen({ navigation, route }: Props) {
  const { employeeId, name, password, role, position, organisationCategory, organisationName, isKP } = route.params;
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const isFocused = useIsFocused();
  const cameraRef = useRef<Camera>(null);

  const [samples, setSamples] = useState<CapturedRegistrationSample[]>([]);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastQuality, setLastQuality] = useState<import('../services/faceQualityService').FaceQualityResult | null>(null);
  const [modelReady, setModelReady] = useState(false);
  const [mockMode, setMockMode] = useState(false);

  const currentStep = Math.min(samples.length, REGISTRATION_STEPS.length - 1);
  const currentInstruction = REGISTRATION_STEPS[currentStep];
  const isComplete = samples.length >= REGISTRATION_MAX_SAMPLES;

  React.useEffect(() => {
    Promise.all([initializeEdgeFace(), initializeAntiSpoof()]).then(() => {
      setModelReady(true);
      setMockMode(isMockMode());
    });
  }, []);

  const saveRegistration = useCallback(async (samplesToSave: CapturedRegistrationSample[]) => {
    if (samplesToSave.length < REGISTRATION_MAX_SAMPLES) return;
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const existing = await getRegisteredUser(employeeId);
      const templates: RegisteredFaceTemplate[] = samplesToSave.map((s, i) => ({
        templateId: `${employeeId}_${Date.now()}_${i}`,
        employeeId,
        name,
        embedding: s.embedding,
        modelName: MOBILEFACENET_MODEL_NAME as 'MobileFaceNet',
        modelVersion: MOBILEFACENET_MODEL_VERSION,
        sampleIndex: s.sampleIndex,
        quality: s.quality,
        createdAt: now,
      }));
      const user: RegisteredUser = {
        employeeId,
        name,
        password,
        role,
        position,
        organisationCategory,
        organisationName,
        isKP,
        templates,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await saveRegisteredUser(user);
      navigation.popToTop();
    } catch (err) {
      Alert.alert('Save Error', String(err));
    } finally {
      setSaving(false);
    }
  }, [employeeId, name, role, position, mockMode, navigation]);

  const captureAndProcess = useCallback(async () => {
    if (!cameraRef.current || processing) return;
    setProcessing(true);
    setLastQuality(null);

    try {
      const photo = await cameraRef.current.takePhoto({ flash: 'off' });
      const imagePath = photo.path;

      const quality = await assessFaceQuality(imagePath);
      setLastQuality(quality);

      if (!quality.passed) {
        Alert.alert(
          'Quality Check Failed',
          quality.reason ?? 'Please adjust position and try again.',
          [{ text: 'Retake' }]
        );
        return;
      }

      if (PIPELINE_ANTISPOOF) {
        const spoofResult = await checkAntiSpoof(imagePath, quality.boundingBox, { width: photo.width, height: photo.height });
        if (!spoofResult.passed) {
          console.log(`[Register] spoof detected — score=${spoofResult.score.toFixed(4)}`);
          Alert.alert('Spoof Detected', 'Use your real face — printed photos and screens are not allowed.', [{ text: 'Retake' }]);
          return;
        }
      }

      const embedding = await generateEmbeddingFromImage(imagePath, quality.boundingBox, { width: photo.width, height: photo.height });
      console.log(`[Register] sample ${samples.length + 1} embedding dim=${embedding.length} sample=[${embedding.slice(0, 4).map(v => v.toFixed(3)).join(', ')}]`);

      setSamples(prev => {
        const next = [
          ...prev,
          {
            localImagePath: imagePath,
            embedding,
            quality,
            sampleIndex: prev.length,
            instruction: currentInstruction,
          },
        ];
        if (next.length >= REGISTRATION_MAX_SAMPLES) {
          saveRegistration(next);
        }
        return next;
      });
    } catch (err) {
      Alert.alert('Capture Error', String(err));
    } finally {
      setProcessing(false);
    }
  }, [processing, currentInstruction, saveRegistration]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <Text style={styles.permissionTitle}>Camera Access Needed</Text>
        <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
          <Text style={styles.grantButtonText}>Grant Camera Access</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.centeredScreen}>
        <Text style={styles.permissionTitle}>No Front Camera Found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isFocused && !saving}
        photo
      />

      {/* Face oval guide */}
      <View style={styles.ovalContainer} pointerEvents="none">
        <View style={styles.oval} />
      </View>

      {/* Top HUD */}
      <SafeAreaView style={styles.topHud} pointerEvents="none">
        <View style={styles.topRow}>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>
              Step {samples.length + 1} of {REGISTRATION_MAX_SAMPLES}
            </Text>
          </View>
          {mockMode && (
            <View style={styles.mockBadge}>
              <Text style={styles.mockBadgeText}>MOCK MODE</Text>
            </View>
          )}
        </View>
        <View style={styles.instructionBadge}>
          <Text style={styles.instructionText}>{currentInstruction}</Text>
        </View>
        {lastQuality && <QualityBadge quality={lastQuality} />}
      </SafeAreaView>

      {/* Bottom panel */}
      <SafeAreaView style={styles.bottomSafeArea}>
        <View style={styles.panel}>
          <CaptureProgress captured={samples.length} />

          {saving ? (
            <View style={[styles.captureButton, styles.buttonBusy]}>
              <View style={styles.row}>
                <ActivityIndicator color="#FFF" size="small" />
                <Text style={styles.captureButtonText}>Saving…</Text>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.captureButton, (processing || !modelReady || isComplete) && styles.buttonBusy]}
              onPress={captureAndProcess}
              disabled={processing || !modelReady || isComplete}
              activeOpacity={0.85}
            >
              {processing ? (
                <View style={styles.row}>
                  <ActivityIndicator color="#FFF" size="small" />
                  <Text style={styles.captureButtonText}>Processing…</Text>
                </View>
              ) : (
                <Text style={styles.captureButtonText}>
                  {!modelReady ? 'Loading model…' : isComplete ? 'All samples captured' : 'Capture Sample'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
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
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    textAlign: 'center',
  },
  grantButton: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  grantButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 15,
  },
  cancelText: {
    color: '#6B7280',
    fontSize: 14,
  },
  ovalContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 200,
  },
  oval: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH,
    borderWidth: 2,
    borderColor: '#3B82F6',
    backgroundColor: 'transparent',
  },
  topHud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 8,
    gap: 10,
  },
  topRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  stepBadge: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  stepBadgeText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '500',
  },
  mockBadge: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  mockBadgeText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  instructionBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  instructionText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  bottomSafeArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  panel: {
    backgroundColor: 'rgba(10,12,20,0.92)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: 12,
    paddingHorizontal: 24,
    gap: 14,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  captureButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  captureButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonBusy: {
    opacity: 0.6,
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
