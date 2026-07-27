import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Animated,
  Dimensions,
  Vibration,
} from 'react-native';
import { Audio } from 'expo-av';

const { width } = Dimensions.get('window');

interface WelcomeGoodbyePopupProps {
  visible: boolean;
  type: 'welcome' | 'goodbye';
  userName: string;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export default function WelcomeGoodbyePopup({
  visible,
  type,
  userName,
  onDismiss,
  autoDismissMs = 3000,
}: WelcomeGoodbyePopupProps) {
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);

  const isWelcome = type === 'welcome';
  const title = isWelcome ? 'Welcome!' : 'Goodbye!';
  const message = isWelcome
    ? `Good to see you, ${userName}.\nHave a productive day!`
    : `Thank you, ${userName}.\nSee you next time!`;
  const emoji = isWelcome ? '👋' : '🙏';
  const accentColor = isWelcome ? '#16A34A' : '#2563EB';
  const bgColor = isWelcome ? '#F0FDF4' : '#EFF6FF';
  const borderColor = isWelcome ? '#86EFAC' : '#93C5FD';

  useEffect(() => {
    if (visible) {
      playNotification();

      progressAnim.setValue(0);

      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      Animated.timing(progressAnim, {
        toValue: 1,
        duration: autoDismissMs,
        useNativeDriver: false,
      }).start();

      const timer = setTimeout(() => {
        dismissWithAnimation();
      }, autoDismissMs);

      return () => clearTimeout(timer);
    } else {
      scaleAnim.setValue(0.5);
      opacityAnim.setValue(0);
      progressAnim.setValue(0);
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  async function playNotification() {
    try {
      Vibration.vibrate(isWelcome ? [0, 100, 50, 100] : [0, 150, 100, 150]);

      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const soundUri = isWelcome
        ? 'https://cdn.freesound.org/previews/320/320655_5260872-lq.mp3'
        : 'https://cdn.freesound.org/previews/536/536420_10954396-lq.mp3';

      const { sound } = await Audio.Sound.createAsync(
        { uri: soundUri },
        { shouldPlay: true, volume: 0.8 }
      );
      soundRef.current = sound;
    } catch (error) {
      console.log('[WelcomeGoodbyePopup] Sound playback fallback - vibration only');
    }
  }

  function dismissWithAnimation() {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  }

  if (!visible) return null;

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['100%', '0%'],
  });

  return (
    <Modal transparent visible={visible} animationType="none">
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: bgColor,
              borderColor: borderColor,
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          <View style={[styles.emojiCircle, { borderColor: accentColor }]}>
            <Text style={styles.emoji}>{emoji}</Text>
          </View>

          <Text style={[styles.title, { color: accentColor }]}>{title}</Text>

          <Text style={styles.message}>{message}</Text>

          <View style={[styles.progressBar, { backgroundColor: `${accentColor}22` }]}>
            <Animated.View
              style={[
                styles.progressFill,
                { backgroundColor: accentColor, width: progressWidth },
              ]}
            />
          </View>

          <Text style={styles.tapHint}>Auto-closing...</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: width - 48,
    maxWidth: 340,
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  emojiCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  message: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  progressBar: {
    width: '100%',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  tapHint: {
    marginTop: 16,
    fontSize: 12,
    color: '#6B7280',
  },
});
