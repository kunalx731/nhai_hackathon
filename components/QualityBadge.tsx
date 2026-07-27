import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FaceQualityResult } from '../services/faceQualityService';

interface Props {
  quality: FaceQualityResult | null;
}

export default function QualityBadge({ quality }: Props) {
  if (!quality) return null;

  const color = quality.passed ? '#22C55E' : '#EF4444';
  const label = quality.passed ? 'Quality OK' : `Quality: ${quality.reason ?? 'Failed'}`;

  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
