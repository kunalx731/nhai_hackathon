import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import ResultModal from '../components/ResultModal';
import WelcomeGoodbyePopup from '../components/WelcomeGoodbyePopup';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Result'>;
  route: RouteProp<RootStackParamList, 'Result'>;
};

export default function ResultScreen({ navigation, route }: Props) {
  const { success, matchScore, processingMs, matchedUser, eventType } = route.params;
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    if (success && matchedUser) {
      setShowPopup(true);
    }
  }, [success, matchedUser]);

  const eventLabel = eventType === 'check-out' ? 'Check-Out' : 'Check-In';

  const handleRetry = () => {
    navigation.replace('Verification', { eventType });
  };

  const handleDone = () => {
    if (success && matchedUser) {
      navigation.replace('Dashboard', {
        role: matchedUser.role,
        matchedUser: {
          name: matchedUser.name,
          employeeId: matchedUser.employeeId,
          position: matchedUser.position,
        },
      });
    } else {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Home' }],
      });
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>{eventLabel} {success ? 'Successful' : 'Failed'}</Text>

        <ResultModal
          metrics={{ success, matchScore, processingMs, matchedUser, eventType }}
        />

        <View style={styles.actions}>
          {!success && (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetry}
              activeOpacity={0.85}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.doneButton, success && styles.doneButtonPrimary]}
            onPress={handleDone}
            activeOpacity={0.85}
          >
            <Text style={[styles.doneButtonText, success && styles.doneButtonTextPrimary]}>
              {success ? 'Continue' : 'Back to Home'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {success && matchedUser && (
        <WelcomeGoodbyePopup
          visible={showPopup}
          type={eventType === 'check-out' ? 'goodbye' : 'welcome'}
          userName={matchedUser.name.split(' ')[0]}
          onDismiss={() => setShowPopup(false)}
          autoDismissMs={3500}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F6FA',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 40,
    justifyContent: 'center',
    gap: 28,
  },
  screenTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 1.2,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  actions: {
    gap: 12,
  },
  retryButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  retryButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButton: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  doneButtonPrimary: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  doneButtonText: {
    color: '#6B7280',
    fontSize: 16,
    fontWeight: '600',
  },
  doneButtonTextPrimary: {
    color: '#FFFFFF',
  },
});
