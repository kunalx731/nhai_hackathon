import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { REGISTRATION_MAX_SAMPLES } from '../constants/model';

interface Props {
  captured: number;
  total?: number;
}

export default function CaptureProgress({
  captured,
  total = REGISTRATION_MAX_SAMPLES,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {captured} / {total} samples
      </Text>
      <View style={styles.track}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i < captured && styles.dotFilled]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  track: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#252A3A',
    borderWidth: 1,
    borderColor: '#374151',
  },
  dotFilled: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
});
