import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { getAllRegisteredUsers } from '../services/faceTemplateStore';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'UserLogin'>;
};

export default function UserLoginScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    const u = username.trim().toLowerCase();
    if (!u || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      const users = await getAllRegisteredUsers();
      const matchedUser = users.find(user => {
        const firstName = user.name.split(' ')[0].toLowerCase();
        return firstName === u && user.password === password;
      });

      if (matchedUser) {
        setUsername('');
        setPassword('');
        navigation.replace('Dashboard', {
          role: 'PD',
          matchedUser: {
            name: matchedUser.name,
            employeeId: matchedUser.employeeId,
            position: matchedUser.position,
          },
        });
      } else {
        setError('Invalid username or password. Please try again.');
      }
    } catch (err) {
      setError('Failed to load user data. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.badge}>
            <Text style={styles.badgeText}>USER · LOGIN</Text>
          </View>

          <View style={styles.header}>
            <Text style={styles.title}>User Login</Text>
            <Text style={styles.subtitle}>
              Sign in with your registered credentials to view your attendance dashboard.
            </Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>USERNAME</Text>
              <TextInput
                style={styles.input}
                value={username}
                onChangeText={setUsername}
                placeholder="Your first name"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.hint}>Enter your first name (e.g., "Rajesh")</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}
          </View>

          <TouchableOpacity
            style={[styles.loginButton, loading && styles.buttonBusy]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.loginButtonText}>
              {loading ? 'Signing in…' : 'Sign In'}
            </Text>
          </TouchableOpacity>

          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>NOT REGISTERED?</Text>
            <Text style={styles.hintLine}>Go back and tap "Register Face" to create an account.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F6FA' },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 16 },
  backText: { color: '#2563EB', fontSize: 15 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#2563EB',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  badgeText: { color: '#2563EB', fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  header: { marginBottom: 32, gap: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#1E3A5F' },
  subtitle: { fontSize: 14, color: '#6B7280', lineHeight: 21 },
  form: { gap: 20, marginBottom: 28 },
  field: { gap: 8 },
  label: { fontSize: 11, fontWeight: '600', color: '#374151', letterSpacing: 1.2 },
  hint: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1F2937',
  },
  error: { color: '#EF4444', fontSize: 13, fontWeight: '500' },
  loginButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonBusy: { opacity: 0.7 },
  loginButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  hintCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  hintTitle: { color: '#374151', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  hintLine: { color: '#6B7280', fontSize: 13, lineHeight: 20 },
});
