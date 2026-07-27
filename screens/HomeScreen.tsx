import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

const nhaiLogo = require('../assets/NHAI_logo.png');

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        {/* NHAI Logo */}
        <View style={styles.logoContainer}>
          <Image source={nhaiLogo} style={styles.logo} resizeMode="contain" />
        </View>

        {/* Logo / badge */}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>OFFLINE · SECURE</Text>
        </View>

        {/* Title block */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>UPAS</Text>
          <Text style={styles.titleHindi}>उपस</Text>
          <Text style={styles.tagline}>User Presence & Attendance System</Text>
          <Text style={styles.taglineHindi}>उपयोगकर्ता उपस्थिति एवं हाजिरी प्रणाली</Text>
          <Text style={styles.subtitle}>
            Secure offline facial authentication{'\n'}for field operations
          </Text>
        </View>

        {/* Primary actions */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('UserLogin')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>User Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('AdminLogin')}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryButtonText}>Admin Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.ghostButton}
            onPress={() => navigation.navigate('RegistrationForm')}
            activeOpacity={0.85}
          >
            <Text style={styles.ghostButtonText}>Register Face</Text>
          </TouchableOpacity>

        </View>

        <Text style={styles.footer}>
          All biometric processing happens on-device.{'\n'}No data leaves this device.
        </Text>
      </ScrollView>
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
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 100,
    height: 100,
  },
  badge: {
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  badgeText: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: 40,
    gap: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: '#1E3A5F',
    textAlign: 'center',
    letterSpacing: 2,
  },
  titleHindi: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E3A5F',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 16,
    color: '#2563EB',
    textAlign: 'center',
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: -4,
  },
  taglineHindi: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
    marginTop: 2,
  },
  subtitle: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 23,
  },
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  secondaryButton: {
    backgroundColor: '#16A34A',
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  secondaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  ghostButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#374151',
  },
  ghostButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
  },
  footer: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
});
