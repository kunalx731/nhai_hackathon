import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { VerificationMetrics } from '../types/verification';

interface ResultModalProps {
  metrics: VerificationMetrics;
}

interface MetricRowProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function MetricRow({ label, value, highlight }: MetricRowProps) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, highlight && styles.metricValueHighlight]}>
        {value}
      </Text>
    </View>
  );
}

export default function ResultModal({ metrics }: ResultModalProps) {
  const { success, matchScore, processingMs, matchedUser, eventType } = metrics;
  const eventLabel = eventType === 'check-out' ? 'Check-Out' : 'Check-In';

  return (
    <View style={[styles.card, success ? styles.cardSuccess : styles.cardFailure]}>
      {/* Icon + headline */}
      <View style={styles.header}>
        <View style={[styles.iconCircle, success ? styles.iconCircleSuccess : styles.iconCircleFailure]}>
          <Text style={styles.iconText}>{success ? '✓' : '✕'}</Text>
        </View>
        <Text style={styles.headline}>
          {success ? `${eventLabel} Successful` : `${eventLabel} Failed`}
        </Text>
        {success && matchedUser ? (
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{matchedUser.name}</Text>
            {!!matchedUser.employeeId && (
              <Text style={styles.userEmployeeId}>{matchedUser.employeeId}</Text>
            )}
            {!!matchedUser.position && (
              <Text style={styles.userPosition}>{matchedUser.position}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.subheadline}>
            {success
              ? 'Identity verified. Access granted.'
              : 'Could not verify identity. Please retry.'}
          </Text>
        )}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Metrics grid */}
      <View style={styles.metrics}>
        <MetricRow
          label="Match Score"
          value={matchScore.toFixed(2)}
          highlight={matchScore >= 0.7}
        />
        <MetricRow
          label="Processing Time"
          value={`${processingMs} ms`}
        />
        <MetricRow
          label="Sync Status"
          value="Queued locally"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderWidth: 1,
    marginHorizontal: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
  },
  cardFailure: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 10,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  iconCircleSuccess: {
    backgroundColor: '#DCFCE7',
    borderWidth: 2,
    borderColor: '#22C55E',
  },
  iconCircleFailure: {
    backgroundColor: '#FEE2E2',
    borderWidth: 2,
    borderColor: '#EF4444',
  },
  iconText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
  },
  headline: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  subheadline: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  userInfo: {
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#16A34A',
    textAlign: 'center',
  },
  userEmployeeId: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    letterSpacing: 0.5,
    fontWeight: '500',
  },
  userPosition: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 24,
  },
  metrics: {
    gap: 14,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  metricValueHighlight: {
    color: '#16A34A',
  },
});
