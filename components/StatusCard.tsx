import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

type StatusVariant = 'success' | 'warning' | 'error' | 'neutral';

interface StatusCardProps {
  label: string;
  value: string;
  status: StatusVariant;
}

const DOT_COLORS: Record<StatusVariant, string> = {
  success: '#22C55E',
  warning: '#F59E0B',
  error:   '#EF4444',
  neutral: '#6B7280',
};

export default function StatusCard({ label, value, status }: StatusCardProps) {
  return (
    <View style={styles.card}>
      <View style={[styles.dot, { backgroundColor: DOT_COLORS[status] }]} />
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1E2E',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#252A3A',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    flex: 1,
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '400',
  },
  value: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '500',
  },
});
