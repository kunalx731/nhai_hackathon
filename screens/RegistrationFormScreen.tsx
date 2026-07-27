import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
  Dimensions,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

type OrgCategory = 'AE/IE' | 'DPR Consultants' | 'NHAI' | 'Concessionaire/Contractor';

const ORG_CATEGORIES: OrgCategory[] = [
  'AE/IE',
  'DPR Consultants',
  'NHAI',
  'Concessionaire/Contractor',
];

const KP_POSITIONS = [
  'Team Leader',
  'Resident Engineer',
  'Bridge Engineer',
  'Senior Pavement Specialist',
  'Senior Quality and Material Expert',
  'Sr. Geotech Expert',
  'Tunnel Design Engineer',
  'Tunnel Safety Expert',
];

const KP_COLORS = [
  '#2563EB',
  '#7C3AED',
  '#059669',
  '#D97706',
  '#DC2626',
  '#0891B2',
  '#9333EA',
  '#B45309',
];

const POSITIONS_BY_ORG: Record<OrgCategory, string[]> = {
  'AE/IE': KP_POSITIONS,
  'NHAI': [
    'CGM',
    'GM',
    'DGM',
    'Manager',
    'Deputy Manager',
    'Member (Admin)',
    'Member (Finance)',
    'Member (PPP)',
    'Member (Technical)',
    'Member (Project)',
    'Chief Vigilance Officer',
  ],
  'DPR Consultants': [
    'Project Director',
    'Senior Project Manager',
    'Project Manager',
    'Design Lead',
    'Senior Design Engineer',
    'Design Engineer',
    'Survey Manager',
    'GIS Specialist',
  ],
  'Concessionaire/Contractor': [
    'Project Director',
    'Construction Manager',
    'Site Engineer',
    'Quality Control Manager',
    'Safety Officer',
    'Environment Manager',
    'Finance Manager',
    'Project Coordinator',
  ],
};

const NON_KP_POSITIONS_AEIE = [
  'Junior Engineer',
  'Site Inspector',
  'Survey Assistant',
  'Office Coordinator',
  'Technical Assistant',
  'Administrative Staff',
];

const CARD_WIDTH = (Dimensions.get('window').width - 48 - 12) / 2;

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'RegistrationForm'>;
};

function DropdownModal({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: string[];
  selected: string | null;
  onSelect: (v: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={dStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={dStyles.sheet}>
          <Text style={dStyles.title}>{title}</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 340 }}>
            {options.map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[dStyles.item, selected === opt && dStyles.itemActive]}
                onPress={() => { onSelect(opt); onClose(); }}
              >
                <Text style={[dStyles.itemText, selected === opt && dStyles.itemTextActive]}>{opt}</Text>
                {selected === opt && <Text style={dStyles.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const dStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  item: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  itemActive: { backgroundColor: '#EFF6FF' },
  itemText: { fontSize: 15, color: '#6B7280' },
  itemTextActive: { color: '#1F2937', fontWeight: '600' },
  check: { color: '#2563EB', fontWeight: '700', fontSize: 16 },
});

export default function RegistrationFormScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [orgCategory, setOrgCategory] = useState<OrgCategory | null>(null);
  const [orgName, setOrgName] = useState('');
  const [position, setPosition] = useState('');
  const [isKP, setIsKP] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [posDropdownOpen, setPosDropdownOpen] = useState(false);

  function generateEmployeeId(fullName: string, org: string): string {
    const namePart = fullName.replace(/\s+/g, '').toUpperCase().slice(0, 4);
    const orgPart = org.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
    const rand = Date.now().toString(36).toUpperCase().slice(-5);
    return `${namePart}-${orgPart}-${rand}`;
  }

  function getPositionOptions(): string[] {
    if (!orgCategory) return [];
    if (orgCategory === 'AE/IE') return isKP === false ? NON_KP_POSITIONS_AEIE : [];
    return POSITIONS_BY_ORG[orgCategory];
  }

  async function handleContinue() {
    if (!name.trim()) { Alert.alert('Required', 'Please enter your full name.'); return; }
    if (!password.trim()) { Alert.alert('Required', 'Please enter a password.'); return; }
    if (password.length < 4) { Alert.alert('Invalid', 'Password must be at least 4 characters.'); return; }
    if (!orgCategory) { Alert.alert('Required', 'Please select an organisation category.'); return; }
    if (!orgName.trim()) { Alert.alert('Required', 'Please enter your organisation name.'); return; }
    if (orgCategory === 'AE/IE' && isKP === null) {
      Alert.alert('Required', 'Please indicate if you are KP or Non-KP.');
      return;
    }
    if (!position) { Alert.alert('Required', 'Please select your position.'); return; }

    const employeeId = generateEmployeeId(name, orgCategory);
    const role: 'Official' | 'PD' = orgCategory === 'NHAI' ? 'Official' : 'PD';

    setLoading(true);
    try {
      navigation.navigate('FaceRegistrationCamera', {
        employeeId,
        name: name.trim(),
        password: password.trim(),
        role,
        position,
        organisationCategory: orgCategory,
        organisationName: orgName.trim(),
        isKP: isKP ?? undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  const showKPRadio = orgCategory === 'AE/IE';
  const showKPPhotoGrid = orgCategory === 'AE/IE' && isKP === true;
  const showPosDropdown = orgCategory !== null && !showKPPhotoGrid &&
    (orgCategory !== 'AE/IE' || isKP === false);

  function renderKPGrid() {
    const rows: string[][] = [];
    for (let i = 0; i < KP_POSITIONS.length; i += 2) {
      rows.push(KP_POSITIONS.slice(i, i + 2));
    }
    return (
      <View style={styles.field}>
        <Text style={styles.label}>SELECT YOUR POSITION</Text>
        <View style={{ gap: 12 }}>
        {rows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.kpRow}>
            {row.map((pos) => {
              const colorIdx = KP_POSITIONS.indexOf(pos);
              const color = KP_COLORS[colorIdx];
              const selected = position === pos;
              return (
                <TouchableOpacity
                  key={pos}
                  style={[
                    styles.personnelCard,
                    { borderColor: selected ? color : '#252A3A' },
                    selected && { backgroundColor: color + '11' },
                  ]}
                  onPress={() => setPosition(pos)}
                  activeOpacity={0.8}
                >
                  {/* Photo frame — replace inner View with Image when real photos are available */}
                  <View style={[styles.photoFrame, { borderColor: selected ? color : '#2A2E40' }]}>
                    <View style={[styles.photoInner, { backgroundColor: color + '22' }]}>
                      <View style={[styles.photoSilhouette, { backgroundColor: color + '44' }]}>
                        <Text style={styles.photoIcon}>👤</Text>
                      </View>
                    </View>
                    {selected && (
                      <View style={[styles.checkBadge, { backgroundColor: color }]}>
                        <Text style={styles.checkBadgeText}>✓</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={[styles.kpLabel, selected && { color }]}
                    numberOfLines={2}
                  >
                    {pos}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {row.length === 1 && <View style={styles.personnelCard} />}
          </View>
        ))}
        </View>
      </View>
    );
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

          <View style={styles.header}>
            <Text style={styles.title}>Registration</Text>
          </View>

          <View style={styles.form}>
            {/* 1. Full Name */}
            <View style={styles.field}>
              <Text style={styles.label}>FULL NAME</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Enter your full name"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
                autoCorrect={false}
              />
              <Text style={styles.hint}>Username will be your first name (e.g., "Rajesh")</Text>
            </View>

            {/* 1b. Password */}
            <View style={styles.field}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="Create a password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* 2. Organisation Category */}
            <View style={styles.field}>
              <Text style={styles.label}>ORGANISATION CATEGORY</Text>
              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={() => setOrgDropdownOpen(true)}
                activeOpacity={0.8}
              >
                <Text style={orgCategory ? styles.dropdownValue : styles.dropdownPlaceholder}>
                  {orgCategory ?? 'Select category'}
                </Text>
                <Text style={styles.dropdownArrow}>▾</Text>
              </TouchableOpacity>
            </View>

            {/* 3. Organisation Name */}
            <View style={styles.field}>
              <Text style={styles.label}>ORGANISATION NAME</Text>
              <TextInput
                style={styles.input}
                value={orgName}
                onChangeText={setOrgName}
                placeholder="Enter organisation name"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* KP / Non-KP radio — only for AE/IE */}
            {showKPRadio && (
              <View style={styles.field}>
                <Text style={styles.label}>PERSONNEL TYPE</Text>
                <View style={styles.radioRow}>
                  <TouchableOpacity
                    style={[styles.radioBtn, isKP === true && styles.radioBtnKP]}
                    onPress={() => { setIsKP(true); setPosition(''); }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.radioCircle, isKP === true && styles.radioCircleKP]}>
                      {isKP === true && <View style={styles.radioFillKP} />}
                    </View>
                    <View>
                      <Text style={[styles.radioLabel, isKP === true && styles.radioLabelActive]}>KP</Text>
                      <Text style={styles.radioSub}>Key Personnel</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.radioBtn, isKP === false && styles.radioBtnNonKP]}
                    onPress={() => { setIsKP(false); setPosition(''); }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.radioCircle, isKP === false && styles.radioCircleNonKP]}>
                      {isKP === false && <View style={styles.radioFillNonKP} />}
                    </View>
                    <View>
                      <Text style={[styles.radioLabel, isKP === false && styles.radioLabelActive]}>Non-KP</Text>
                      <Text style={styles.radioSub}>Other Personnel</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* 4a. KP photo grid — AE/IE + KP */}
            {showKPPhotoGrid && renderKPGrid()}

            {/* 4b. Position dropdown — Non-KP AE/IE or other orgs */}
            {showPosDropdown && (
              <View style={styles.field}>
                <Text style={styles.label}>POSITION</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setPosDropdownOpen(true)}
                  activeOpacity={0.8}
                >
                  <Text style={position ? styles.dropdownValue : styles.dropdownPlaceholder}>
                    {position || 'Select position'}
                  </Text>
                  <Text style={styles.dropdownArrow}>▾</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.continueButton, loading && styles.buttonBusy]}
            onPress={handleContinue}
            disabled={loading}
            activeOpacity={0.85}
          >
            <Text style={styles.continueButtonText}>
              {loading ? 'Processing…' : 'Continue to Face Capture'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.note}>
            You will capture 3–5 face samples using the front camera.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <DropdownModal
        visible={orgDropdownOpen}
        title="ORGANISATION CATEGORY"
        options={ORG_CATEGORIES}
        selected={orgCategory}
        onSelect={(v) => {
          setOrgCategory(v as OrgCategory);
          setPosition('');
          setIsKP(null);
        }}
        onClose={() => setOrgDropdownOpen(false)}
      />
      <DropdownModal
        visible={posDropdownOpen}
        title="POSITION"
        options={getPositionOptions()}
        selected={position}
        onSelect={setPosition}
        onClose={() => setPosDropdownOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F6FA' },
  container: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 40 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 24 },
  backText: { color: '#2563EB', fontSize: 15 },
  header: { marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', color: '#1E3A5F' },
  form: { gap: 20, marginBottom: 36 },
  field: { gap: 8 },
  label: { fontSize: 11, fontWeight: '600', color: '#374151', letterSpacing: 1.2 },
  hint: { fontSize: 11, color: '#6B7280', marginTop: 4 },
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
  dropdownTrigger: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownValue: { fontSize: 16, color: '#1F2937' },
  dropdownPlaceholder: { fontSize: 16, color: '#9CA3AF' },
  dropdownArrow: { fontSize: 16, color: '#6B7280' },
  radioRow: { flexDirection: 'row', gap: 10 },
  radioBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioBtnKP: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  radioBtnNonKP: { borderColor: '#7C3AED', backgroundColor: '#F5F3FF' },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleKP: { borderColor: '#2563EB' },
  radioCircleNonKP: { borderColor: '#7C3AED' },
  radioFillKP: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB' },
  radioFillNonKP: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED' },
  radioLabel: { fontSize: 15, fontWeight: '700', color: '#6B7280' },
  radioLabelActive: { color: '#1F2937' },
  radioSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },
  kpRow: { flexDirection: 'row', gap: 12 },
  personnelCard: {
    width: CARD_WIDTH,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  photoFrame: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 2.5,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  photoInner: {
    width: '100%',
    height: '100%',
    borderRadius: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoSilhouette: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoIcon: { fontSize: 26 },
  checkBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  checkBadgeText: { color: '#FFF', fontSize: 10, fontWeight: '700' },
  kpLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 16,
  },
  continueButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonBusy: { opacity: 0.7 },
  continueButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', letterSpacing: 0.2 },
  note: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19 },
});
