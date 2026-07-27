import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
} from 'react-native';
import { VerificationPhase } from '../types/verification';

const { width } = Dimensions.get('window');

const OVAL_WIDTH  = width * 0.68;
const OVAL_HEIGHT = OVAL_WIDTH * 1.35;

const STATUS_TEXT: Record<string, string> = {
  aligning: 'Align your face inside the frame',
  quality:  'Checking face quality...',
  matching: 'Matching encrypted template...',
  done:     'Processing complete',
};

const OVAL_COLOR: Record<string, string> = {
  aligning: '#3B82F6',
  quality:  '#3B82F6',
  matching: '#A855F7',
  done:     '#22C55E',
};

interface CameraOverlayProps {
  phase: VerificationPhase;
}

export default function CameraOverlay({ phase }: CameraOverlayProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Pulse the oval during active processing phases
  useEffect(() => {
    if (phase === 'quality' || phase === 'matching') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.02, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [phase, pulseAnim]);

  const borderColor = OVAL_COLOR[phase] ?? '#3B82F6';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Top status pill */}
      <View style={styles.topBadge}>
        <View style={[styles.statusDot, { backgroundColor: borderColor }]} />
        <Text style={styles.statusText}>{STATUS_TEXT[phase] ?? phase}</Text>
      </View>

      {/* Oval face guide */}
      <View style={styles.ovalContainer}>
        <Animated.View
          style={[
            styles.oval,
            { borderColor, transform: [{ scale: pulseAnim }] },
          ]}
        />
        {/* Corner accent marks at top of oval */}
        <View style={[styles.cornerTL, { borderColor }]} />
        <View style={[styles.cornerTR, { borderColor }]} />
        <View style={[styles.cornerBL, { borderColor }]} />
        <View style={[styles.cornerBR, { borderColor }]} />
      </View>
    </View>
  );
}

const CORNER_SIZE = 20;
const CORNER_OFFSET_X = (width - OVAL_WIDTH) / 2 - 1;
const CORNER_OFFSET_Y = (Dimensions.get('window').height - OVAL_HEIGHT) / 2 - 1 - 50; // shift up for bottom panel

const styles = StyleSheet.create({
  topBadge: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  ovalContainer: {
    flex: 1,
    alignItems: 'center',
    // Push oval up a bit so the bottom panel doesn't cover the chin
    paddingBottom: 180,
    justifyContent: 'center',
  },
  oval: {
    width: OVAL_WIDTH,
    height: OVAL_HEIGHT,
    borderRadius: OVAL_WIDTH,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  // Corner accent brackets drawn outside the oval
  cornerTL: {
    position: 'absolute',
    top: CORNER_OFFSET_Y,
    left: CORNER_OFFSET_X,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: 'transparent',
    borderTopLeftRadius: 4,
  },
  cornerTR: {
    position: 'absolute',
    top: CORNER_OFFSET_Y,
    right: CORNER_OFFSET_X,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: 'transparent',
    borderTopRightRadius: 4,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 180 + CORNER_OFFSET_Y,
    left: CORNER_OFFSET_X,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: 'transparent',
    borderBottomLeftRadius: 4,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 180 + CORNER_OFFSET_Y,
    right: CORNER_OFFSET_X,
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: 'transparent',
    borderBottomRightRadius: 4,
  },
});
