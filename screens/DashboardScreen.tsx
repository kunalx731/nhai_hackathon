import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Modal,
  Dimensions,
  Image,
} from 'react-native';

const nhaiLogo = require('../assets/NHAI_logo.png');
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { fetchAttendanceHistory, getLocalAttendanceHistory, AttendanceEvent } from '../services/attendanceService';
import { getAllProjects, getProjectForEmployee, getAllEmployees, Project, KPEntry } from '../services/projectDataService';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Dashboard'>;
  route: RouteProp<RootStackParamList, 'Dashboard'>;
};

function monthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

type ChartBar = { label: string; pass: number; fail: number };

type MonthYear = { month: number; year: number }; // month 0-11

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function startOfMonth(my: MonthYear): Date {
  return new Date(my.year, my.month, 1, 0, 0, 0, 0);
}
function endOfMonth(my: MonthYear): Date {
  return new Date(my.year, my.month + 1, 0, 23, 59, 59, 999);
}
function nowMonthYear(): MonthYear {
  const n = new Date();
  return { month: n.getMonth(), year: n.getFullYear() };
}
function monthsAgoMY(n: number): MonthYear {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return { month: d.getMonth(), year: d.getFullYear() };
}
function compareMY(a: MonthYear, b: MonthYear): number {
  return a.year !== b.year ? a.year - b.year : a.month - b.month;
}

function groupByDay(events: AttendanceEvent[]): ChartBar[] {
  const map = new Map<string, { pass: number; fail: number; d: Date }>();
  events.forEach(e => {
    const d = new Date(e.timestamp);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!map.has(key)) {
      map.set(key, { pass: 0, fail: 0, d: new Date(d.getFullYear(), d.getMonth(), d.getDate()) });
    }
    const entry = map.get(key)!;
    if (e.success) entry.pass++; else entry.fail++;
  });
  return Array.from(map.values())
    .sort((a, b) => a.d.getTime() - b.d.getTime())
    .map(v => ({
      label: `${String(v.d.getDate()).padStart(2, '0')} ${MONTH_NAMES[v.d.getMonth()]}`,
      pass: v.pass,
      fail: v.fail,
    }));
}

function groupByWeek(events: AttendanceEvent[]): ChartBar[] {
  const map = new Map<string, { pass: number; fail: number; ws: Date }>();
  events.forEach(e => {
    const d = new Date(e.timestamp);
    const ws = new Date(d);
    ws.setDate(d.getDate() - d.getDay());
    ws.setHours(0, 0, 0, 0);
    const key = ws.toISOString();
    if (!map.has(key)) map.set(key, { pass: 0, fail: 0, ws: new Date(ws) });
    const entry = map.get(key)!;
    if (e.success) entry.pass++; else entry.fail++;
  });
  return Array.from(map.values())
    .sort((a, b) => a.ws.getTime() - b.ws.getTime())
    .map(v => ({
      label: `${String(v.ws.getDate()).padStart(2, '0')} ${MONTH_NAMES[v.ws.getMonth()]}`,
      pass: v.pass,
      fail: v.fail,
    }));
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

const BAR_W = 28;
const BAR_AREA_H = 130;
const SCREEN_W = Dimensions.get('window').width;

function AttendanceBarChart({ bars, title }: { bars: ChartBar[]; title: string }) {
  if (bars.length === 0) {
    return (
      <View style={chartSt.emptyBox}>
        <Text style={chartSt.emptyText}>No events in this range</Text>
      </View>
    );
  }

  const maxVal = Math.max(...bars.map(b => b.pass + b.fail), 1);
  const yTicks = [0, Math.round(maxVal / 2), maxVal];

  return (
    <View style={chartSt.container}>
      <Text style={chartSt.sectionLabel}>{title}</Text>

      {/* Y-axis + bars */}
      <View style={{ flexDirection: 'row' }}>
        {/* Y-axis labels */}
        <View style={{ width: 24, height: BAR_AREA_H, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 4 }}>
          {yTicks.slice().reverse().map((t, i) => (
            <Text key={i} style={chartSt.yLabel}>{t}</Text>
          ))}
        </View>

        {/* Bars — horizontal scroll */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingRight: 16, gap: 6, flexDirection: 'row', alignItems: 'flex-end', minHeight: BAR_AREA_H + 28 }}
        >
          {bars.map((b, i) => {
            const total = b.pass + b.fail;
            const barH = Math.max((total / maxVal) * BAR_AREA_H, 3);
            const passH = total > 0 ? (b.pass / total) * barH : 0;
            const failH = barH - passH;

            return (
              <View key={i} style={{ alignItems: 'center', width: BAR_W + 8 }}>
                <View style={{ height: BAR_AREA_H, width: BAR_W, justifyContent: 'flex-end' }}>
                  <View style={{ width: BAR_W, borderRadius: 5, overflow: 'hidden' }}>
                    {failH > 0 && (
                      <View style={{ height: failH, backgroundColor: '#DC2626' }} />
                    )}
                    {passH > 0 && (
                      <View style={{ height: passH, backgroundColor: '#16A34A' }} />
                    )}
                  </View>
                </View>
                <Text style={chartSt.xLabel}>{b.label.slice(0, 6)}</Text>
              </View>
            );
          })}
        </ScrollView>
      </View>

      {/* Horizontal grid line at top */}
      <View style={{ marginLeft: 28, height: 0, borderTopWidth: 1, borderTopColor: '#1A1E2E', marginTop: -BAR_AREA_H - 28 + 2, marginBottom: BAR_AREA_H + 26 }} />

      {/* Legend */}
      <View style={chartSt.legend}>
        <View style={chartSt.legendItem}>
          <View style={[chartSt.legendDot, { backgroundColor: '#16A34A' }]} />
          <Text style={chartSt.legendText}>Pass</Text>
        </View>
        <View style={chartSt.legendItem}>
          <View style={[chartSt.legendDot, { backgroundColor: '#DC2626' }]} />
          <Text style={chartSt.legendText}>Fail</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Pass Rate Visual ─────────────────────────────────────────────────────────

function PassRateCard({ pass, fail }: { pass: number; fail: number }) {
  const total = pass + fail;
  const rate = total > 0 ? Math.round((pass / total) * 100) : 0;
  const color = rate >= 80 ? '#16A34A' : rate >= 60 ? '#D97706' : '#DC2626';
  const barWidth = `${rate}%` as `${number}%`;

  return (
    <View style={chartSt.container}>
      <Text style={chartSt.sectionLabel}>Pass Rate Summary</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <View style={[chartSt.rateBadge, { borderColor: color }]}>
          <Text style={[chartSt.rateValue, { color }]}>{rate}%</Text>
          <Text style={chartSt.rateSubLabel}>PASS RATE</Text>
        </View>
        <View style={{ gap: 10, flex: 1, paddingLeft: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Total events</Text>
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 13 }}>{total}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#16A34A', fontSize: 13 }}>Passed</Text>
            <Text style={{ color: '#16A34A', fontWeight: '700', fontSize: 13 }}>{pass}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: '#DC2626', fontSize: 13 }}>Failed</Text>
            <Text style={{ color: '#DC2626', fontWeight: '700', fontSize: 13 }}>{fail}</Text>
          </View>
        </View>
      </View>
      {/* Progress bar */}
      <View style={chartSt.progressTrack}>
        <View style={[chartSt.progressFill, { width: barWidth, backgroundColor: color }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 }}>
        <Text style={{ color: '#374151', fontSize: 10 }}>0%</Text>
        <Text style={{ color: '#374151', fontSize: 10 }}>50%</Text>
        <Text style={{ color: '#374151', fontSize: 10 }}>100%</Text>
      </View>
    </View>
  );
}

// ─── Custom Date Range Modal ──────────────────────────────────────────────────

function MonthYearSelector({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: MonthYear;
  min?: MonthYear;
  max?: MonthYear;
  onChange: (v: MonthYear) => void;
}) {
  function canGoBack(): boolean {
    if (!min) return value.year > 2020 || value.month > 0;
    return compareMY(value, min) > 0;
  }
  function canGoForward(): boolean {
    if (!max) return true;
    return compareMY(value, max) < 0;
  }
  function prev() {
    if (!canGoBack()) return;
    if (value.month === 0) onChange({ month: 11, year: value.year - 1 });
    else onChange({ month: value.month - 1, year: value.year });
  }
  function next() {
    if (!canGoForward()) return;
    if (value.month === 11) onChange({ month: 0, year: value.year + 1 });
    else onChange({ month: value.month + 1, year: value.year });
  }

  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={modalSt.pickerLabel}>{label}</Text>
      <View style={modalSt.pickerRow}>
        <TouchableOpacity
          style={[modalSt.arrowBtn, !canGoBack() && modalSt.arrowDisabled]}
          onPress={prev}
          disabled={!canGoBack()}
        >
          <Text style={[modalSt.arrowText, !canGoBack() && modalSt.arrowTextDisabled]}>‹</Text>
        </TouchableOpacity>
        <Text style={modalSt.pickerValue}>
          {MONTH_NAMES[value.month]} {value.year}
        </Text>
        <TouchableOpacity
          style={[modalSt.arrowBtn, !canGoForward() && modalSt.arrowDisabled]}
          onPress={next}
          disabled={!canGoForward()}
        >
          <Text style={[modalSt.arrowText, !canGoForward() && modalSt.arrowTextDisabled]}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function DateRangeModal({
  visible,
  initialFrom,
  initialTo,
  onApply,
  onClose,
}: {
  visible: boolean;
  initialFrom: MonthYear;
  initialTo: MonthYear;
  onApply: (from: MonthYear, to: MonthYear) => void;
  onClose: () => void;
}) {
  const [from, setFrom] = useState<MonthYear>(initialFrom);
  const [to, setTo]     = useState<MonthYear>(initialTo);
  const now = nowMonthYear();

  function handleApply() {
    if (compareMY(from, to) > 0) {
      onApply(to, from); // swap if inverted
    } else {
      onApply(from, to);
    }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={modalSt.overlay} activeOpacity={1} onPress={onClose}>
        <View style={modalSt.sheet}>
          <Text style={modalSt.title}>Custom Date Range</Text>

          <MonthYearSelector
            label="FROM"
            value={from}
            max={to}
            onChange={setFrom}
          />
          <MonthYearSelector
            label="TO"
            value={to}
            min={from}
            max={now}
            onChange={setTo}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TouchableOpacity style={modalSt.cancelBtn} onPress={onClose}>
              <Text style={modalSt.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={modalSt.applyBtn} onPress={handleApply}>
              <Text style={modalSt.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const modalSt = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#1A1E2E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#252A3A',
    padding: 24,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 22,
  },
  pickerLabel: {
    color: '#4B5563',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0F1117',
    borderRadius: 12,
    paddingVertical: 4,
  },
  pickerValue: {
    flex: 1,
    textAlign: 'center',
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  arrowBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  arrowDisabled: { opacity: 0.3 },
  arrowText: { color: '#2563EB', fontSize: 22, fontWeight: '600' },
  arrowTextDisabled: { color: '#4B5563' },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#0F1117',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#252A3A',
  },
  cancelText: { color: '#6B7280', fontSize: 15, fontWeight: '600' },
  applyBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});

const chartSt = StyleSheet.create({
  container: {
    backgroundColor: '#1A1E2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252A3A',
    padding: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    color: '#4B5563',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  yLabel: { color: '#374151', fontSize: 9 },
  xLabel: { color: '#374151', fontSize: 9, marginTop: 6, textAlign: 'center' },
  legend: { flexDirection: 'row', gap: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: '#6B7280', fontSize: 11 },
  emptyBox: {
    backgroundColor: '#1A1E2E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252A3A',
    padding: 32,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyText: { color: '#374151', fontSize: 14, textAlign: 'center' },
  rateBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F1117',
  },
  rateValue: { fontSize: 22, fontWeight: '800' },
  rateSubLabel: { color: '#4B5563', fontSize: 8, fontWeight: '700', letterSpacing: 0.8, marginTop: 1 },
  progressTrack: {
    height: 10,
    backgroundColor: '#252A3A',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
});

// ─── Official Dashboard ───────────────────────────────────────────────────────

function ProjectCard({ project, navigation }: { project: Project; navigation: Props['navigation'] }) {
  const [expanded, setExpanded] = useState(false);

  function openKPAttendance(kp: { name: string; employeeId: string; position: string }) {
    navigation.push('Dashboard', {
      role: 'PD',
      matchedUser: { name: kp.name, employeeId: kp.employeeId, position: kp.position },
      fromManager: true,
    });
  }

  return (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.85}
    >
      <View style={styles.projectCardTop}>
        <View style={styles.projectCardLeft}>
          <Text style={styles.projectName}>{project.name}</Text>
          <View style={styles.upcBadge}>
            <Text style={styles.upcText}>{project.upc}</Text>
          </View>
        </View>
        <View style={styles.projectCardRight}>
          <View style={styles.kpCountBadge}>
            <Text style={styles.kpCountVal}>{project.currentKP.length}</Text>
            <Text style={styles.kpCountLabel}>KP</Text>
          </View>
          <Text style={styles.expandChevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </View>

      {expanded && (
        <View style={styles.projectDetail}>
          <View style={styles.divider} />
          <Text style={styles.detailSectionLabel}>CURRENT KEY PERSONNEL ({project.currentKP.length})</Text>
          {project.currentKP.length === 0 ? (
            <Text style={styles.detailEmpty}>None assigned</Text>
          ) : (
            project.currentKP.map(kp => (
              <TouchableOpacity
                key={kp.employeeId}
                style={[styles.kpRow, styles.kpRowTappable]}
                onPress={() => openKPAttendance(kp)}
                activeOpacity={0.7}
              >
                <View style={styles.kpAvatar}>
                  <Text style={styles.kpAvatarText}>{kp.name.charAt(0)}</Text>
                </View>
                <View style={styles.kpInfo}>
                  <Text style={styles.kpName}>{kp.name}</Text>
                  <Text style={styles.kpPosition}>{kp.position} · {kp.employeeId}</Text>
                </View>
                <Text style={styles.kpChevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
          {project.previousKP.length > 0 && (
            <>
              <Text style={[styles.detailSectionLabel, { marginTop: 14 }]}>
                PREVIOUS KEY PERSONNEL ({project.previousKP.length})
              </Text>
              {project.previousKP.map(kp => (
                <TouchableOpacity
                  key={kp.employeeId}
                  style={[styles.kpRow, styles.kpRowPrev, styles.kpRowTappable]}
                  onPress={() => openKPAttendance(kp)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.kpAvatar, styles.kpAvatarPrev]}>
                    <Text style={[styles.kpAvatarText, styles.kpAvatarTextPrev]}>{kp.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.kpInfo}>
                    <Text style={[styles.kpName, styles.kpNamePrev]}>{kp.name}</Text>
                    <Text style={styles.kpPosition}>{kp.position} · {kp.employeeId}</Text>
                  </View>
                  <Text style={styles.kpChevron}>›</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function OfficialDashboard({ navigation, matchedUser }: {
  navigation: Props['navigation'];
  matchedUser?: { name: string; employeeId: string; position: string };
}) {
  const [refreshing, setRefreshing] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  const load = useCallback((isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setProjects(getAllProjects());
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalKP = projects.reduce((sum, p) => sum + p.currentKP.length, 0);
  const totalPrevKP = projects.reduce((sum, p) => sum + p.previousKP.length, 0);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })} style={styles.backBtn}>
          <Text style={styles.backText}>← Home</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {matchedUser?.name ?? 'Official Dashboard'}
          </Text>
          {matchedUser && <Text style={styles.headerSub}>Official</Text>}
        </View>
        <TouchableOpacity onPress={() => load(true)} style={styles.refreshBtn}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{projects.length}</Text>
          <Text style={styles.statLabel}>PROJECTS</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, styles.colorOfficial]}>{totalKP}</Text>
          <Text style={styles.statLabel}>CURRENT KP</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#6B7280' }]}>{totalPrevKP}</Text>
          <Text style={styles.statLabel}>PREVIOUS KP</Text>
        </View>
      </View>

      <FlatList
        data={projects}
        keyExtractor={p => p.id}
        renderItem={({ item }) => <ProjectCard project={item} navigation={navigation} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#9333EA" />
        }
        ListHeaderComponent={
          <Text style={styles.listHeader}>
            {projects.length} project{projects.length !== 1 ? 's' : ''} · tap to expand KP details
          </Text>
        }
      />
    </SafeAreaView>
  );
}

// ─── Donut Chart Component (View-based) ───────────────────────────────────────

function DonutChart({ percentage, size = 100 }: { percentage: number; size?: number }) {
  const color = percentage >= 80 ? '#16A34A' : percentage >= 60 ? '#F59E0B' : '#DC2626';

  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      borderWidth: 12,
      borderColor: '#E5E7EB',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: '#FFFFFF',
      position: 'relative',
    }}>
      {/* Progress arc simulation with colored border */}
      <View style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 12,
        borderColor: 'transparent',
        borderTopColor: color,
        borderRightColor: percentage > 25 ? color : 'transparent',
        borderBottomColor: percentage > 50 ? color : 'transparent',
        borderLeftColor: percentage > 75 ? color : 'transparent',
        transform: [{ rotate: '-45deg' }],
      }} />
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color, fontSize: 24, fontWeight: '800' }}>{percentage}%</Text>
        <Text style={{ color: '#6B7280', fontSize: 10, fontWeight: '600' }}>Present</Text>
      </View>
    </View>
  );
}

// ─── Supervisor Dashboard (DRiSHTi Style) ─────────────────────────────────────

type TeamMemberStatus = 'checked-in' | 'on-duty' | 'absent';

interface TeamMemberAttendance {
  employeeId: string;
  name: string;
  position: string;
  status: TeamMemberStatus;
  checkInTime: string | null;
  checkOutTime: string | null;
}

interface TeamOverviewStats {
  totalStaff: number;
  present: number;
  onDuty: number;
  absent: number;
}

interface Alert {
  id: string;
  icon: string;
  message: string;
  timeAgo: string;
  type: 'warning' | 'info' | 'success';
}

function getTodayEventsFromList(events: AttendanceEvent[]): AttendanceEvent[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return events.filter(e => {
    const t = new Date(e.timestamp);
    return t >= today && t < tomorrow;
  });
}

function calculateTeamStatus(
  employees: KPEntry[],
  todayEvents: AttendanceEvent[]
): TeamMemberAttendance[] {
  return employees.map(emp => {
    const empEvents = todayEvents.filter(e => e.employeeId === emp.employeeId && e.success);
    const checkIn = empEvents.find(e => e.eventType === 'check-in') || empEvents[0];
    const checkOut = empEvents.find(e => e.eventType === 'check-out') || (empEvents.length > 1 ? empEvents[empEvents.length - 1] : null);

    let status: TeamMemberStatus = 'absent';
    if (checkIn && checkOut) status = 'checked-in';
    else if (checkIn && !checkOut) status = 'on-duty';

    return {
      employeeId: emp.employeeId,
      name: emp.name,
      position: emp.position,
      status,
      checkInTime: checkIn?.timestamp || null,
      checkOutTime: checkOut?.timestamp || null,
    };
  });
}

function calculateOverviewStats(team: TeamMemberAttendance[]): TeamOverviewStats {
  return {
    totalStaff: team.length,
    present: team.filter(m => m.status === 'checked-in').length,
    onDuty: team.filter(m => m.status === 'on-duty').length,
    absent: team.filter(m => m.status === 'absent').length,
  };
}

function generateAlerts(stats: TeamOverviewStats, pendingSync: number): Alert[] {
  const alerts: Alert[] = [];
  if (stats.absent > 0) {
    alerts.push({
      id: 'absent',
      icon: '⚠️',
      message: `${stats.absent} staff member${stats.absent > 1 ? 's are' : ' is'} absent today. Please follow up.`,
      timeAgo: '5 mins ago',
      type: 'warning',
    });
  }
  if (pendingSync > 0) {
    alerts.push({
      id: 'sync',
      icon: 'ℹ️',
      message: `${pendingSync} attendance record${pendingSync > 1 ? 's' : ''} pending sync.`,
      timeAgo: '10 mins ago',
      type: 'info',
    });
  }
  if (stats.present + stats.onDuty > 0) {
    alerts.push({
      id: 'geofence',
      icon: '📍',
      message: 'All team members are within geo-fence.',
      timeAgo: '15 mins ago',
      type: 'success',
    });
  }
  return alerts;
}

function SupervisorDashboard({ navigation, matchedUser }: {
  navigation: Props['navigation'];
  matchedUser?: { name: string; employeeId: string; position: string };
}) {
  const [allEvents, setAllEvents] = useState<AttendanceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const employees = useMemo(() => getAllEmployees(), []);
  const projects = useMemo(() => getAllProjects(), []);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const data = await fetchAttendanceHistory(500);
      setIsOffline(false);
      setAllEvents(data);
    } catch {
      try {
        const local = await getLocalAttendanceHistory();
        setIsOffline(true);
        setAllEvents(local);
      } catch {
        setAllEvents([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLastUpdated(new Date());
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const todayEvents = useMemo(() => getTodayEventsFromList(allEvents), [allEvents]);
  const teamAttendance = useMemo(() => calculateTeamStatus(employees, todayEvents), [employees, todayEvents]);
  const stats = useMemo(() => calculateOverviewStats(teamAttendance), [teamAttendance]);
  const alerts = useMemo(() => generateAlerts(stats, isOffline ? 2 : 0), [stats, isOffline]);

  const attendancePercent = stats.totalStaff > 0
    ? Math.round(((stats.present + stats.onDuty) / stats.totalStaff) * 100)
    : 0;

  const now = new Date();
  const currentDate = `${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
  const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  function formatTime(timestamp: string): string {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function getStatusColor(status: TeamMemberStatus): string {
    switch (status) {
      case 'checked-in': return '#16A34A';
      case 'on-duty': return '#F59E0B';
      case 'absent': return '#DC2626';
    }
  }

  function getStatusLabel(status: TeamMemberStatus): string {
    switch (status) {
      case 'checked-in': return 'Checked-In';
      case 'on-duty': return 'On Duty';
      case 'absent': return 'Absent';
    }
  }

  function openEmployeeAttendance(member: TeamMemberAttendance) {
    navigation.push('Dashboard', {
      role: 'PD',
      matchedUser: { name: member.name, employeeId: member.employeeId, position: member.position },
      fromManager: true,
    });
  }

  return (
    <SafeAreaView style={sv.safe}>
      <ScrollView
        contentContainerStyle={sv.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2563EB" />}
      >
        {/* App Header */}
        <View style={sv.header}>
          <TouchableOpacity onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}>
            <Text style={sv.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={sv.headerBrand}>
            <Image source={nhaiLogo} style={sv.nhaiLogo} resizeMode="contain" />
            <Text style={sv.headerLogo}>UPAS</Text>
            {/* <Text style={sv.headerTagline}>User Presence & Attendance System</Text> */}
            <View style={sv.headerBadge}>
              <Text style={sv.headerBadgeText}>Supervisor Dashboard</Text>
            </View>
          </View>
          <View style={sv.headerRight}>
            <View style={sv.syncBadge}>
              <View style={[sv.syncDot, isOffline ? sv.syncDotOffline : sv.syncDotOnline]} />
              <Text style={[sv.syncText, isOffline && sv.syncTextOffline]}>{isOffline ? 'Offline' : 'Synced'}</Text>
            </View>
          </View>
        </View>

        {/* Profile Card */}
        <View style={sv.profileCard}>
          <View style={sv.profileTop}>
            <View style={sv.profileLeft}>
              <View style={sv.avatar}>
                <Text style={sv.avatarEmoji}>👨‍💼</Text>
              </View>
              <View style={sv.profileInfo}>
                <Text style={sv.welcomeText}>Welcome,</Text>
                <View style={sv.nameRow}>
                  <Text style={sv.userName}>{matchedUser?.name || 'Admin'}</Text>
                  <View style={sv.roleBadge}>
                    <Text style={sv.roleText}>Supervisor</Text>
                  </View>
                </View>
                <Text style={sv.empId}>Employee ID: {matchedUser?.employeeId || 'ADM-001'}</Text>
              </View>
            </View>
          </View>
          <View style={sv.profileMeta}>
            <View style={sv.metaItem}>
              <Text style={sv.metaIcon}>📍</Text>
              <View>
                <Text style={sv.metaLabel}>Project / Section</Text>
                <Text style={sv.metaValue}>{projects.length} Projects</Text>
              </View>
            </View>
            <View style={sv.metaItem}>
              <Text style={sv.metaIcon}>🏢</Text>
              <View>
                <Text style={sv.metaLabel}>Site / Location</Text>
                <Text style={sv.metaValue}>NHAI Site Office</Text>
              </View>
            </View>
            <View style={sv.metaItem}>
              <Text style={sv.metaIcon}>📅</Text>
              <View>
                <Text style={sv.metaLabel}>{currentDate}</Text>
                <Text style={sv.metaValue}>{currentDay}</Text>
              </View>
            </View>
            <View style={sv.metaItem}>
              <Text style={sv.metaIcon}>🕐</Text>
              <View>
                <Text style={sv.metaLabel}>Current Time</Text>
                <Text style={sv.metaValue}>{currentTime}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Team Overview */}
        <View style={sv.section}>
          <View style={sv.sectionHeader}>
            <Text style={sv.sectionTitle}>TEAM OVERVIEW</Text>
            <TouchableOpacity>
              <Text style={sv.viewAllText}>View All →</Text>
            </TouchableOpacity>
          </View>
          <View style={sv.statsRow}>
            <View style={sv.statCard}>
              <View style={[sv.statIcon, { backgroundColor: '#EFF6FF' }]}>
                <Text style={sv.statIconText}>👥</Text>
              </View>
              <Text style={sv.statValue}>{stats.totalStaff}</Text>
              <Text style={sv.statLabel}>Total Staff</Text>
              <Text style={sv.statSub}>Assigned</Text>
            </View>
            <View style={sv.statCard}>
              <View style={[sv.statIcon, { backgroundColor: '#DCFCE7' }]}>
                <Text style={sv.statIconText}>✓</Text>
              </View>
              <Text style={[sv.statValue, { color: '#16A34A' }]}>{stats.present}</Text>
              <Text style={sv.statLabel}>Present</Text>
              <Text style={sv.statSub}>(Checked-In)</Text>
            </View>
            <View style={sv.statCard}>
              <View style={[sv.statIcon, { backgroundColor: '#FEF3C7' }]}>
                <Text style={sv.statIconText}>⏰</Text>
              </View>
              <Text style={[sv.statValue, { color: '#F59E0B' }]}>{stats.onDuty}</Text>
              <Text style={sv.statLabel}>On Duty</Text>
              <Text style={sv.statSub}>(Not Checked-Out)</Text>
            </View>
            <View style={sv.statCard}>
              <View style={[sv.statIcon, { backgroundColor: '#FEE2E2' }]}>
                <Text style={sv.statIconText}>✕</Text>
              </View>
              <Text style={[sv.statValue, { color: '#DC2626' }]}>{stats.absent}</Text>
              <Text style={sv.statLabel}>Absent</Text>
              <Text style={sv.statSub}>(Not Checked-In)</Text>
            </View>
          </View>
        </View>

        {/* Attendance Summary */}
        <View style={sv.section}>
          <View style={sv.sectionHeader}>
            <Text style={sv.sectionTitle}>ATTENDANCE SUMMARY (TODAY)</Text>
          </View>
          <View style={sv.summaryRow}>
            <View style={sv.summaryLeft}>
              <DonutChart percentage={attendancePercent} size={100} />
            </View>
            <View style={sv.summaryRight}>
              <View style={sv.legendItem}>
                <View style={[sv.legendDot, { backgroundColor: '#16A34A' }]} />
                <Text style={sv.legendText}>Present</Text>
                <Text style={sv.legendValue}>{stats.present} ({stats.totalStaff > 0 ? Math.round((stats.present / stats.totalStaff) * 100) : 0}%)</Text>
              </View>
              <View style={sv.legendItem}>
                <View style={[sv.legendDot, { backgroundColor: '#F59E0B' }]} />
                <Text style={sv.legendText}>On Duty</Text>
                <Text style={sv.legendValue}>{stats.onDuty} ({stats.totalStaff > 0 ? Math.round((stats.onDuty / stats.totalStaff) * 100) : 0}%)</Text>
              </View>
              <View style={sv.legendItem}>
                <View style={[sv.legendDot, { backgroundColor: '#DC2626' }]} />
                <Text style={sv.legendText}>Absent</Text>
                <Text style={sv.legendValue}>{stats.absent} ({stats.totalStaff > 0 ? Math.round((stats.absent / stats.totalStaff) * 100) : 0}%)</Text>
              </View>
              <View style={sv.legendItem}>
                <View style={[sv.legendDot, { backgroundColor: '#6B7280' }]} />
                <Text style={sv.legendText}>Leave/Holiday</Text>
                <Text style={sv.legendValue}>0 (0%)</Text>
              </View>
            </View>
          </View>
          <View style={sv.lastUpdatedRow}>
            <Text style={sv.lastUpdatedText}>Last Updated: {lastUpdated.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</Text>
            <TouchableOpacity onPress={() => load(true)}>
              <Text style={sv.refreshIcon}>↻</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Live Team Status */}
        <View style={sv.section}>
          <View style={sv.sectionHeader}>
            <Text style={sv.sectionTitle}>LIVE TEAM STATUS</Text>
            <TouchableOpacity>
              <Text style={sv.viewAllText}>View Map →</Text>
            </TouchableOpacity>
          </View>
          {teamAttendance.slice(0, 5).map((member, index) => (
            <TouchableOpacity
              key={member.employeeId}
              style={[sv.teamMemberRow, index === teamAttendance.slice(0, 5).length - 1 && sv.teamMemberRowLast]}
              onPress={() => openEmployeeAttendance(member)}
              activeOpacity={0.7}
            >
              <View style={sv.memberAvatar}>
                <Text style={sv.memberAvatarEmoji}>👷</Text>
              </View>
              <View style={sv.memberInfo}>
                <Text style={sv.memberName}>{member.name}</Text>
                <Text style={sv.memberPosition}>{member.position}</Text>
              </View>
              <View style={sv.memberStatusCol}>
                <View style={[
                  sv.statusBadge,
                  member.status === 'checked-in' && sv.statusBadgePresent,
                  member.status === 'on-duty' && sv.statusBadgeOnDuty,
                  member.status === 'absent' && sv.statusBadgeAbsent,
                ]}>
                  <Text style={[sv.statusText, { color: getStatusColor(member.status) }]}>
                    {getStatusLabel(member.status)}
                  </Text>
                </View>
                <Text style={sv.memberTime}>
                  {member.checkInTime ? formatTime(member.checkInTime) : 'Not Checked-In'}
                </Text>
              </View>
              <Text style={sv.locationPin}>📍</Text>
            </TouchableOpacity>
          ))}
          <Text style={sv.noteText}>Note: Location updates every 5 min</Text>
        </View>

        {/* Quick Actions */}
        <View style={sv.section}>
          <Text style={sv.sectionTitle}>QUICK ACTIONS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sv.quickActionsScroll}>
            <TouchableOpacity style={sv.quickAction} onPress={() => navigation.navigate('Verification', { eventType: 'check-in' })}>
              <View style={[sv.quickActionIcon, { backgroundColor: '#EFF6FF' }]}>
                <Text style={sv.quickActionIconText}>👤</Text>
              </View>
              <Text style={sv.quickActionLabel} numberOfLines={2}>Mark Attendance</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sv.quickAction} onPress={() => navigation.navigate('RegisteredUsers')}>
              <View style={[sv.quickActionIcon, { backgroundColor: '#F3E8FF' }]}>
                <Text style={sv.quickActionIconText}>👥</Text>
              </View>
              <Text style={sv.quickActionLabel} numberOfLines={2}>My Team</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sv.quickAction}>
              <View style={[sv.quickActionIcon, { backgroundColor: '#DCFCE7' }]}>
                <Text style={sv.quickActionIconText}>📍</Text>
              </View>
              <Text style={sv.quickActionLabel} numberOfLines={2}>Geofencing Status</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sv.quickAction}>
              <View style={[sv.quickActionIcon, { backgroundColor: '#FEF3C7' }]}>
                <Text style={sv.quickActionIconText}>📊</Text>
              </View>
              <Text style={sv.quickActionLabel} numberOfLines={2}>Daily Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sv.quickAction}>
              <View style={[sv.quickActionIcon, { backgroundColor: '#E0E7FF' }]}>
                <Text style={sv.quickActionIconText}>📢</Text>
              </View>
              <Text style={sv.quickActionLabel} numberOfLines={2}>Announcements</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sv.quickAction}>
              <View style={[sv.quickActionIcon, { backgroundColor: '#FEE2E2' }]}>
                <Text style={sv.quickActionIconText}>🆘</Text>
              </View>
              <Text style={sv.quickActionLabel} numberOfLines={2}>SOS</Text>
            </TouchableOpacity>
            <TouchableOpacity style={sv.quickAction}>
              <View style={[sv.quickActionIcon, { backgroundColor: '#F3F4F6' }]}>
                <Text style={sv.quickActionIconText}>⋯</Text>
              </View>
              <Text style={sv.quickActionLabel} numberOfLines={2}>More</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Alerts & Notifications */}
        <View style={sv.section}>
          <View style={sv.sectionHeader}>
            <Text style={sv.sectionTitle}>ALERTS & NOTIFICATIONS</Text>
            <TouchableOpacity>
              <Text style={sv.viewAllText}>View All →</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={sv.alertsScroll}>
            {alerts.map((alert) => (
              <View
                key={alert.id}
                style={[
                  sv.alertCard,
                  alert.type === 'warning' && sv.alertCardWarning,
                  alert.type === 'info' && sv.alertCardInfo,
                  alert.type === 'success' && sv.alertCardSuccess,
                ]}
              >
                <Text style={sv.alertIcon}>{alert.icon}</Text>
                <Text style={sv.alertMessage}>{alert.message}</Text>
                <Text style={sv.alertTime}>{alert.timeAgo}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      {loading && (
        <View style={sv.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={sv.loadingText}>Loading team data...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Supervisor Dashboard Styles ──────────────────────────────────────────────

const sv = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F6FA' },
  scrollContent: { paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backArrow: { fontSize: 24, color: '#2563EB', fontWeight: '600' },
  headerBrand: { flex: 1, alignItems: 'center' },
  nhaiLogo: { width: 50, height: 50, marginBottom: 4 },
  headerLogo: { fontSize: 20, fontWeight: '800', color: '#1E3A5F', letterSpacing: 2 },
  headerTagline: { fontSize: 11, color: '#6B7280', letterSpacing: 0.3, marginTop: 2 },
  headerBadge: { backgroundColor: '#F59E0B', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 },
  headerBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  syncBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  syncDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  syncDotOnline: { backgroundColor: '#16A34A' },
  syncDotOffline: { backgroundColor: '#F59E0B' },
  syncText: { fontSize: 11, color: '#16A34A', fontWeight: '600' },
  syncTextOffline: { color: '#F59E0B' },
  notificationBell: { position: 'relative' },
  bellIcon: { fontSize: 20 },
  bellBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#DC2626', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center' },
  bellBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },

  // Profile Card
  profileCard: {
    backgroundColor: '#1E3A5F',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
  },
  profileTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  profileLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#1E3A5F' },
  avatarEmoji: { fontSize: 32 },
  profileInfo: { flex: 1 },
  welcomeText: { fontSize: 12, color: '#9CA3AF' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  userName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  roleBadge: { backgroundColor: '#F59E0B', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3 },
  roleText: { fontSize: 10, color: '#FFFFFF', fontWeight: '700' },
  empId: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  profileMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: '45%' },
  metaIcon: { fontSize: 16 },
  metaLabel: { fontSize: 9, color: '#9CA3AF' },
  metaValue: { fontSize: 11, color: '#FFFFFF', fontWeight: '600' },

  // Sections
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#374151', letterSpacing: 0.5 },
  viewAllText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },

  // Stats Row
  statsRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  statIconText: { fontSize: 14 },
  statValue: { fontSize: 20, fontWeight: '800', color: '#1F2937' },
  statLabel: { fontSize: 9, fontWeight: '600', color: '#374151', marginTop: 2 },
  statSub: { fontSize: 8, color: '#9CA3AF' },

  // Attendance Summary
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  summaryLeft: { alignItems: 'center' },
  summaryRight: { flex: 1, gap: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#374151', width: 80 },
  legendValue: { fontSize: 11, color: '#6B7280', fontWeight: '600' },
  lastUpdatedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  lastUpdatedText: { fontSize: 10, color: '#9CA3AF' },
  refreshIcon: { fontSize: 18, color: '#2563EB' },

  // Team Members
  teamMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 10,
  },
  teamMemberRowLast: { borderBottomWidth: 0 },
  memberAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center' },
  memberAvatarText: { fontSize: 16, fontWeight: '700', color: '#2563EB' },
  memberAvatarEmoji: { fontSize: 22 },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  memberPosition: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  memberStatusCol: { alignItems: 'flex-end', minWidth: 95 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgePresent: { backgroundColor: '#DCFCE7' },
  statusBadgeOnDuty: { backgroundColor: '#FEF3C7' },
  statusBadgeAbsent: { backgroundColor: '#FEE2E2' },
  statusText: { fontSize: 10, fontWeight: '600' },
  memberTime: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  locationPin: { fontSize: 16 },
  noteText: { fontSize: 10, color: '#9CA3AF', marginTop: 8, fontStyle: 'italic' },

  // Quick Actions
  quickActionsScroll: { marginHorizontal: -8, marginTop: 8 },
  quickAction: { alignItems: 'center', marginHorizontal: 8, width: 80 },
  quickActionIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickActionIconText: { fontSize: 22 },
  quickActionLabel: { fontSize: 10, color: '#374151', textAlign: 'center', lineHeight: 14 },

  // Alerts
  alertsScroll: { marginHorizontal: -8, marginTop: 4 },
  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 6,
    minWidth: 200,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  alertCardWarning: { borderLeftWidth: 4, borderLeftColor: '#F59E0B' },
  alertCardInfo: { borderLeftWidth: 4, borderLeftColor: '#2563EB' },
  alertCardSuccess: { borderLeftWidth: 4, borderLeftColor: '#16A34A' },
  alertIcon: { fontSize: 16, marginBottom: 6 },
  alertMessage: { fontSize: 12, color: '#374151', lineHeight: 18 },
  alertTime: { fontSize: 10, color: '#9CA3AF', marginTop: 6 },

  // Loading
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6B7280' },
});

// ─── PD Dashboard (DRiSHTi Style) ─────────────────────────────────────────────

type SummaryTab = 'Today' | 'Week' | 'Month' | 'Year';
type HistoryTab = 'Week' | 'Month' | 'Year';

function PDDashboard({ navigation, matchedUser, fromManager }: {
  navigation: Props['navigation'];
  matchedUser: { name: string; employeeId: string; position: string };
  fromManager?: boolean;
}) {
  const [events, setEvents]         = useState<AttendanceEvent[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [isOffline, setIsOffline]   = useState(false);
  const [summaryTab, setSummaryTab] = useState<SummaryTab>('Today');
  const [historyTab, setHistoryTab] = useState<HistoryTab>('Week');

  const project = getProjectForEmployee(matchedUser.employeeId);
  const now = new Date();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await fetchAttendanceHistory(500);
      setIsOffline(false);
      setEvents(data.filter(e => e.employeeId === matchedUser.employeeId));
    } catch {
      try {
        const local = await getLocalAttendanceHistory();
        setIsOffline(true);
        setEvents(local.filter(e => e.employeeId === matchedUser.employeeId));
      } catch (localErr: any) {
        setError(localErr?.message ?? 'Failed to load attendance records.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [matchedUser.employeeId]);

  useEffect(() => { load(); }, [load]);

  // Get today's check-in and check-out
  const todayEvents = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return events.filter(e => {
      const t = new Date(e.timestamp);
      return t >= today && t < tomorrow;
    }).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [events]);

  const todayCheckIn = todayEvents.find(e => e.eventType === 'check-in') || todayEvents[0];
  const todayCheckOut = todayEvents.find(e => e.eventType === 'check-out') || (todayEvents.length > 1 ? todayEvents[todayEvents.length - 1] : null);

  // Calculate work hours
  const workHours = useMemo(() => {
    if (!todayCheckIn || !todayCheckOut) return null;
    const inTime = new Date(todayCheckIn.timestamp);
    const outTime = new Date(todayCheckOut.timestamp);
    const diff = (outTime.getTime() - inTime.getTime()) / (1000 * 60 * 60);
    const hours = Math.floor(diff);
    const mins = Math.round((diff - hours) * 60);
    return `${hours}h ${mins}m`;
  }, [todayCheckIn, todayCheckOut]);

  // Auto-detect next event type based on today's records
  const nextEventType = useMemo((): 'check-in' | 'check-out' => {
    if (!todayCheckIn) return 'check-in';
    if (!todayCheckOut) return 'check-out';
    return 'check-in'; // Allow re-check-in after full cycle
  }, [todayCheckIn, todayCheckOut]);

  // Get week days for history
  const weekDays = useMemo(() => {
    const days = [];
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dayStart = new Date(date);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(date);
      dayEnd.setHours(23, 59, 59, 999);

      const dayEvents = events.filter(e => {
        const t = new Date(e.timestamp);
        return t >= dayStart && t <= dayEnd;
      });

      const checkIn = dayEvents.find(e => e.eventType === 'check-in') || dayEvents[0];
      const checkOut = dayEvents.find(e => e.eventType === 'check-out') || (dayEvents.length > 1 ? dayEvents[dayEvents.length - 1] : null);

      let hours = '--';
      if (checkIn && checkOut) {
        const diff = (new Date(checkOut.timestamp).getTime() - new Date(checkIn.timestamp).getTime()) / (1000 * 60 * 60);
        hours = `${Math.floor(diff)}h ${Math.round((diff - Math.floor(diff)) * 60)}m`;
      }

      const isToday = date.toDateString() === today.toDateString();
      const isFuture = date > today;

      days.push({
        dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()],
        date: date.getDate(),
        month: MONTH_NAMES[date.getMonth()],
        isPresent: dayEvents.length > 0 && dayEvents.some(e => e.success),
        hours,
        isToday,
        isFuture,
      });
    }
    return days;
  }, [events]);

  // Monthly stats
  const monthlyStats = useMemo(() => {
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);
    const nextMonth = new Date(thisMonth);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const monthEvents = events.filter(e => {
      const t = new Date(e.timestamp);
      return t >= thisMonth && t < nextMonth;
    });

    // Group by day
    const dayMap = new Map<string, AttendanceEvent[]>();
    monthEvents.forEach(e => {
      const key = new Date(e.timestamp).toDateString();
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key)!.push(e);
    });

    const daysPresent = Array.from(dayMap.values()).filter(dayEvents => dayEvents.some(e => e.success)).length;
    const daysAbsent = Math.max(0, now.getDate() - daysPresent - (Math.floor(now.getDate() / 7) * 2)); // Rough weekend estimate
    const totalWorkingDays = now.getDate() - (Math.floor(now.getDate() / 7) * 2);
    const attendancePercent = totalWorkingDays > 0 ? Math.round((daysPresent / totalWorkingDays) * 100) : 0;

    return {
      totalWorkingDays,
      daysPresent,
      daysOnDuty: 1,
      daysAbsent: Math.max(0, daysAbsent),
      leaveHoliday: 0,
      attendancePercent: Math.min(100, attendancePercent),
    };
  }, [events, now]);

  function formatTime(timestamp: string): string {
    const d = new Date(timestamp);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }

  function formatDate(timestamp: string): string {
    const d = new Date(timestamp);
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  }

  const currentDate = `${now.getDate()} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  const currentDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
  const currentTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <SafeAreaView style={pd.safe}>
      <ScrollView
        contentContainerStyle={pd.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2563EB" />}
      >
        {/* App Header */}
        <View style={pd.appHeader}>
          <TouchableOpacity onPress={() => fromManager ? navigation.goBack() : navigation.reset({ index: 0, routes: [{ name: 'Home' }] })}>
            <Text style={pd.backArrow}>←</Text>
          </TouchableOpacity>
          <View style={pd.appBrand}>
            <Image source={nhaiLogo} style={pd.nhaiLogo} resizeMode="contain" />
            <Text style={pd.appName}>UPAS</Text>
            {/* <Text style={pd.appTagline}>User Presence & Attendance System</Text> */}
          </View>
          <View style={pd.headerRight}>
            <View style={pd.syncBadge}>
              <View style={[pd.syncDot, isOffline ? pd.syncDotOffline : pd.syncDotOnline]} />
              <Text style={pd.syncText}>{isOffline ? 'Offline' : 'Synced'}</Text>
            </View>
          </View>
        </View>

        {/* User Profile Card */}
        <View style={pd.profileCard}>
          <View style={pd.profileLeft}>
            <View style={pd.avatar}>
              <Text style={pd.avatarEmoji}>👷</Text>
            </View>
            <View style={pd.profileInfo}>
              <Text style={pd.welcomeText}>Welcome,</Text>
              <View style={pd.nameRow}>
                <Text style={pd.userName}>{matchedUser.name}</Text>
                <View style={pd.roleBadge}>
                  <Text style={pd.roleText}>{matchedUser.position.split(' ')[0]}</Text>
                </View>
              </View>
              <Text style={pd.empId}>Employee ID: {matchedUser.employeeId}</Text>
            </View>
          </View>
          <View style={pd.profileRight}>
            <View style={pd.profileMeta}>
              <Text style={pd.metaLabel}>Project / Section</Text>
              <Text style={pd.metaValue}>{project?.upc || 'N/A'}</Text>
            </View>
            <View style={pd.profileMeta}>
              <Text style={pd.metaLabel}>Site / Location</Text>
              <Text style={pd.metaValue}>{project?.name.split(' ')[0] || 'Site'} Office</Text>
            </View>
            <View style={pd.profileMeta}>
              <Text style={pd.metaLabel}>{currentDate}</Text>
              <Text style={pd.metaValue}>{currentDay}</Text>
            </View>
          </View>
        </View>

        {/* Today's Attendance */}
        <View style={pd.section}>
          <View style={pd.sectionHeader}>
            <Text style={pd.sectionTitle}>TODAY'S ATTENDANCE</Text>
            <TouchableOpacity onPress={() => load(true)} style={pd.refreshRow}>
              <Text style={pd.lastUpdated}>Last Updated: {currentTime}</Text>
              <Text style={pd.refreshIcon}>↻</Text>
            </TouchableOpacity>
          </View>

          <View style={pd.todayAttendance}>
            {/* Check-in */}
            <View style={pd.checkCard}>
              <Text style={pd.checkLabel}>CHECK-IN TIME</Text>
              <Text style={pd.checkTime}>{todayCheckIn ? formatTime(todayCheckIn.timestamp) : '--:-- --'}</Text>
              <Text style={pd.checkDate}>{todayCheckIn ? formatDate(todayCheckIn.timestamp) : '--'}</Text>
              <View style={[pd.checkStatus, todayCheckIn ? pd.checkStatusSuccess : pd.checkStatusPending]}>
                <Text style={[pd.checkStatusText, todayCheckIn ? pd.checkStatusTextSuccess : pd.checkStatusTextPending]}>
                  {todayCheckIn ? '✓ Checked-In' : 'Not Checked-In'}
                </Text>
              </View>
            </View>

            {/* Face Scan Button */}
            <TouchableOpacity
              style={[pd.faceScanBtn, nextEventType === 'check-out' && pd.faceScanBtnOut]}
              onPress={() => navigation.navigate('Verification', { eventType: nextEventType })}
              activeOpacity={0.85}
            >
              <View style={[pd.faceScanIcon, nextEventType === 'check-out' && pd.faceScanIconOut]}>
                <Text style={pd.faceScanIconText}>{nextEventType === 'check-out' ? '👋' : '👤'}</Text>
              </View>
              <Text style={pd.faceScanLabel}>{nextEventType === 'check-out' ? 'CHECK-OUT' : 'CHECK-IN'}</Text>
              <Text style={pd.faceScanSub}>Face Scan</Text>
            </TouchableOpacity>

            {/* Check-out */}
            <View style={pd.checkCard}>
              <Text style={[pd.checkLabel, pd.checkLabelOut]}>CHECK-OUT TIME</Text>
              <Text style={pd.checkTime}>{todayCheckOut ? formatTime(todayCheckOut.timestamp) : '--:-- --'}</Text>
              <Text style={pd.checkDate}>{todayCheckOut ? formatDate(todayCheckOut.timestamp) : '--'}</Text>
              <View style={[pd.checkStatus, todayCheckOut ? pd.checkStatusSuccess : pd.checkStatusPending]}>
                <Text style={[pd.checkStatusText, todayCheckOut ? pd.checkStatusTextSuccess : pd.checkStatusTextPending]}>
                  {todayCheckOut ? '✓ Checked-Out' : 'Not Checked-Out'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Attendance Summary */}
        <View style={pd.section}>
          <View style={pd.sectionHeaderWithTabs}>
            <Text style={pd.sectionTitle}>ATTENDANCE SUMMARY</Text>
            <View style={pd.tabRow}>
              {(['Today', 'Week', 'Month', 'Year'] as SummaryTab[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[pd.tab, summaryTab === tab && pd.tabActive]}
                  onPress={() => setSummaryTab(tab)}
                >
                  <Text style={[pd.tabText, summaryTab === tab && pd.tabTextActive]}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={pd.summaryCards}>
            <View style={pd.summaryCard}>
              <View style={[pd.summaryIcon, pd.summaryIconGreen]}>
                <Text style={pd.summaryIconText}>✓</Text>
              </View>
              <Text style={pd.summaryLabel}>Status</Text>
              <Text style={[pd.summaryValue, pd.summaryValueGreen]}>
                {todayCheckIn ? 'Present' : 'Absent'}
              </Text>
              <Text style={pd.summarySub}>{todayCheckIn ? 'Checked-In' : '--'}</Text>
            </View>

            <View style={pd.summaryCard}>
              <View style={pd.summaryIcon}>
                <Text style={pd.summaryIconText}>⏰</Text>
              </View>
              <Text style={pd.summaryLabel}>Check-In Time</Text>
              <Text style={pd.summaryValue}>{todayCheckIn ? formatTime(todayCheckIn.timestamp) : '--:--'}</Text>
              <Text style={pd.summarySub}>{todayCheckIn ? formatDate(todayCheckIn.timestamp) : '--'}</Text>
            </View>

            <View style={pd.summaryCard}>
              <View style={pd.summaryIcon}>
                <Text style={pd.summaryIconText}>⏱</Text>
              </View>
              <Text style={pd.summaryLabel}>Check-Out Time</Text>
              <Text style={pd.summaryValue}>{todayCheckOut ? formatTime(todayCheckOut.timestamp) : '--:--'}</Text>
              <Text style={pd.summarySub}>{todayCheckOut ? 'Checked-Out' : 'Not Checked-Out'}</Text>
            </View>

            <View style={pd.summaryCard}>
              <View style={pd.summaryIcon}>
                <Text style={pd.summaryIconText}>📊</Text>
              </View>
              <Text style={pd.summaryLabel}>Total Work Hours</Text>
              <Text style={pd.summaryValue}>{workHours || '--:--'}</Text>
              <Text style={pd.summarySub}>--</Text>
            </View>
          </View>
        </View>

        {/* Attendance History */}
        <View style={pd.section}>
          <View style={pd.sectionHeaderWithTabs}>
            <Text style={pd.sectionTitle}>ATTENDANCE HISTORY</Text>
            <View style={pd.tabRow}>
              {(['Week', 'Month', 'Year'] as HistoryTab[]).map(tab => (
                <TouchableOpacity
                  key={tab}
                  style={[pd.tab, historyTab === tab && pd.tabActive]}
                  onPress={() => setHistoryTab(tab)}
                >
                  <Text style={[pd.tabText, historyTab === tab && pd.tabTextActive]}>{tab}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={pd.weekGrid}>
            {weekDays.map((day, i) => (
              <View key={i} style={[pd.dayCard, day.isToday && pd.dayCardToday]}>
                <Text style={pd.dayName}>{day.dayName}</Text>
                <Text style={pd.dayDate}>{day.date} {day.month}</Text>
                {day.isFuture ? (
                  <>
                    <Text style={pd.dayIcon}>--</Text>
                    <Text style={pd.dayStatus}>--</Text>
                    <Text style={pd.dayHours}>--</Text>
                  </>
                ) : day.isPresent ? (
                  <>
                    <View style={pd.dayIconCircle}>
                      <Text style={pd.dayIconCheck}>✓</Text>
                    </View>
                    <Text style={[pd.dayStatus, pd.dayStatusPresent]}>Present</Text>
                    <Text style={pd.dayHours}>{day.hours}</Text>
                  </>
                ) : (
                  <>
                    <View style={[pd.dayIconCircle, pd.dayIconCircleAbsent]}>
                      <Text style={pd.dayIconX}>✕</Text>
                    </View>
                    <Text style={[pd.dayStatus, pd.dayStatusAbsent]}>Absent</Text>
                    <Text style={pd.dayHours}>--</Text>
                  </>
                )}
                {day.isToday && <Text style={pd.todayLabel}>(Today)</Text>}
              </View>
            ))}
          </View>
        </View>

        {/* Attendance Overview */}
        <View style={pd.section}>
          <Text style={pd.sectionTitle}>ATTENDANCE OVERVIEW</Text>
          <View style={pd.overviewRow}>
            {/* Donut Chart */}
            <View style={pd.overviewLeft}>
              <DonutChart percentage={monthlyStats.attendancePercent} size={110} />
              <View style={pd.legendRow}>
                <View style={pd.legendItem}>
                  <View style={[pd.legendDot, { backgroundColor: '#16A34A' }]} />
                  <Text style={pd.legendText}>Present</Text>
                  <Text style={pd.legendValue}>{monthlyStats.daysPresent} Days ({monthlyStats.attendancePercent}%)</Text>
                </View>
                <View style={pd.legendItem}>
                  <View style={[pd.legendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={pd.legendText}>On Duty</Text>
                  <Text style={pd.legendValue}>{monthlyStats.daysOnDuty} Day</Text>
                </View>
                <View style={pd.legendItem}>
                  <View style={[pd.legendDot, { backgroundColor: '#DC2626' }]} />
                  <Text style={pd.legendText}>Absent</Text>
                  <Text style={pd.legendValue}>{monthlyStats.daysAbsent} Day</Text>
                </View>
                <View style={pd.legendItem}>
                  <View style={[pd.legendDot, { backgroundColor: '#6B7280' }]} />
                  <Text style={pd.legendText}>Leave/Holiday</Text>
                  <Text style={pd.legendValue}>{monthlyStats.leaveHoliday} Day</Text>
                </View>
              </View>
            </View>

            {/* Summary Table */}
            <View style={pd.overviewRight}>
              <Text style={pd.summaryTableTitle}>MY SUMMARY (This Month)</Text>
              <View style={pd.summaryTable}>
                <View style={pd.summaryTableRow}>
                  <Text style={pd.summaryTableLabel}>Total Working Days</Text>
                  <Text style={pd.summaryTableValue}>{monthlyStats.totalWorkingDays}</Text>
                </View>
                <View style={pd.summaryTableRow}>
                  <Text style={pd.summaryTableLabel}>Days Present</Text>
                  <Text style={pd.summaryTableValue}>{monthlyStats.daysPresent}</Text>
                </View>
                <View style={pd.summaryTableRow}>
                  <Text style={pd.summaryTableLabel}>Days On Duty</Text>
                  <Text style={pd.summaryTableValue}>{monthlyStats.daysOnDuty}</Text>
                </View>
                <View style={pd.summaryTableRow}>
                  <Text style={pd.summaryTableLabel}>Days Absent</Text>
                  <Text style={pd.summaryTableValue}>{monthlyStats.daysAbsent}</Text>
                </View>
                <View style={pd.summaryTableRow}>
                  <Text style={pd.summaryTableLabel}>Leave / Holiday</Text>
                  <Text style={pd.summaryTableValue}>{monthlyStats.leaveHoliday}</Text>
                </View>
                <View style={[pd.summaryTableRow, pd.summaryTableRowLast]}>
                  <Text style={[pd.summaryTableLabel, pd.summaryTableLabelHighlight]}>Attendance %</Text>
                  <Text style={[pd.summaryTableValue, pd.summaryTableValueHighlight]}>{monthlyStats.attendancePercent}%</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={pd.section}>
          <Text style={pd.sectionTitle}>QUICK ACTIONS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pd.quickActionsScroll}>
            <TouchableOpacity style={pd.quickAction}>
              <View style={pd.quickActionIcon}><Text style={pd.quickActionIconText}>📋</Text></View>
              <Text style={pd.quickActionLabel} numberOfLines={2}>My Attendance</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pd.quickAction}>
              <View style={pd.quickActionIcon}><Text style={pd.quickActionIconText}>📅</Text></View>
              <Text style={pd.quickActionLabel} numberOfLines={2}>History</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pd.quickAction}>
              <View style={pd.quickActionIcon}><Text style={pd.quickActionIconText}>📝</Text></View>
              <Text style={pd.quickActionLabel} numberOfLines={2}>Notes</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pd.quickAction}>
              <View style={pd.quickActionIcon}><Text style={pd.quickActionIconText}>✈️</Text></View>
              <Text style={pd.quickActionLabel} numberOfLines={2}>Request Leave</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pd.quickAction}>
              <View style={pd.quickActionIcon}><Text style={pd.quickActionIconText}>📍</Text></View>
              <Text style={pd.quickActionLabel} numberOfLines={2}>Site Location</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pd.quickAction}>
              <View style={pd.quickActionIcon}><Text style={pd.quickActionIconText}>📢</Text></View>
              <Text style={pd.quickActionLabel} numberOfLines={2}>Announcements</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pd.quickAction} onPress={() => navigation.navigate('RegisteredUsers')}>
              <View style={pd.quickActionIcon}><Text style={pd.quickActionIconText}>👤</Text></View>
              <Text style={pd.quickActionLabel} numberOfLines={2}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={pd.quickAction}>
              <View style={[pd.quickActionIcon, { backgroundColor: '#FEE2E2' }]}><Text style={pd.quickActionIconText}>🆘</Text></View>
              <Text style={pd.quickActionLabel} numberOfLines={2}>SOS</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </ScrollView>

      {loading && (
        <View style={pd.loadingOverlay}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={pd.loadingText}>Loading attendance data...</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── PD Dashboard Styles ──────────────────────────────────────────────────────

const pd = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F5F6FA' },
  scrollContent: { paddingBottom: 40 },

  // App Header
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backArrow: { fontSize: 24, color: '#2563EB', fontWeight: '600' },
  appBrand: { flex: 1, alignItems: 'center' },
  nhaiLogo: { width: 50, height: 50, marginBottom: 4 },
  appName: { fontSize: 22, fontWeight: '800', color: '#1E3A5F', letterSpacing: 2 },
  appTagline: { fontSize: 12, color: '#6B7280', letterSpacing: 0.5 },
  headerRight: { alignItems: 'flex-end' },
  syncBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  syncDot: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  syncDotOnline: { backgroundColor: '#16A34A' },
  syncDotOffline: { backgroundColor: '#F59E0B' },
  syncText: { fontSize: 11, color: '#16A34A', fontWeight: '600' },

  // Profile Card
  profileCard: { flexDirection: 'row', backgroundColor: '#1E3A5F', marginHorizontal: 12, marginTop: 12, borderRadius: 16, padding: 16 },
  profileLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#1E3A5F' },
  avatarEmoji: { fontSize: 32 },
  profileInfo: { flex: 1 },
  welcomeText: { fontSize: 12, color: '#9CA3AF' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  userName: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  roleBadge: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  roleText: { fontSize: 10, color: '#FFFFFF', fontWeight: '600' },
  empId: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  profileRight: { alignItems: 'flex-end', gap: 6 },
  profileMeta: { alignItems: 'flex-end' },
  metaLabel: { fontSize: 9, color: '#9CA3AF' },
  metaValue: { fontSize: 11, color: '#FFFFFF', fontWeight: '600' },

  // Sections
  section: { backgroundColor: '#FFFFFF', marginHorizontal: 12, marginTop: 12, borderRadius: 16, padding: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionHeaderWithTabs: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: '#374151', letterSpacing: 0.5 },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastUpdated: { fontSize: 10, color: '#6B7280' },
  refreshIcon: { fontSize: 14, color: '#2563EB' },

  // Tabs
  tabRow: { flexDirection: 'row', gap: 4 },
  tab: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F3F4F6' },
  tabActive: { backgroundColor: '#2563EB' },
  tabText: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  tabTextActive: { color: '#FFFFFF' },

  // Today's Attendance
  todayAttendance: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  checkCard: { flex: 1, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  checkLabel: { fontSize: 10, color: '#16A34A', fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  checkLabelOut: { color: '#DC2626' },
  checkTime: { fontSize: 18, fontWeight: '700', color: '#1F2937' },
  checkDate: { fontSize: 10, color: '#6B7280', marginTop: 2 },
  checkStatus: { marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  checkStatusSuccess: { backgroundColor: '#DCFCE7' },
  checkStatusPending: { backgroundColor: '#FEF3C7' },
  checkStatusText: { fontSize: 10, fontWeight: '600' },
  checkStatusTextSuccess: { color: '#16A34A' },
  checkStatusTextPending: { color: '#D97706' },

  faceScanBtn: { width: 90, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 2, borderColor: '#16A34A' },
  faceScanBtnOut: { borderColor: '#F59E0B' },
  faceScanIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  faceScanIconOut: { backgroundColor: '#FEF3C7' },
  faceScanIconText: { fontSize: 24 },
  faceScanLabel: { fontSize: 8, fontWeight: '700', color: '#1F2937', textAlign: 'center' },
  faceScanSub: { fontSize: 10, color: '#6B7280', marginTop: 2 },

  // Summary Cards
  summaryCards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  summaryCard: { width: '47%', backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E5E7EB' },
  summaryIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  summaryIconGreen: { backgroundColor: '#DCFCE7' },
  summaryIconText: { fontSize: 14 },
  summaryLabel: { fontSize: 10, color: '#6B7280' },
  summaryValue: { fontSize: 16, fontWeight: '700', color: '#1F2937', marginTop: 2 },
  summaryValueGreen: { color: '#16A34A' },
  summarySub: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },

  // Week Grid
  weekGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dayCard: { width: '13%', minWidth: 44, backgroundColor: '#F9FAFB', borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  dayCardToday: { borderColor: '#2563EB', borderWidth: 2, backgroundColor: '#EFF6FF' },
  dayName: { fontSize: 10, fontWeight: '600', color: '#374151' },
  dayDate: { fontSize: 8, color: '#6B7280', marginTop: 2 },
  dayIcon: { fontSize: 12, color: '#9CA3AF', marginVertical: 6 },
  dayIconCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#DCFCE7', justifyContent: 'center', alignItems: 'center', marginVertical: 6 },
  dayIconCircleAbsent: { backgroundColor: '#FEE2E2' },
  dayIconCheck: { fontSize: 12, color: '#16A34A' },
  dayIconX: { fontSize: 12, color: '#DC2626' },
  dayStatus: { fontSize: 9, fontWeight: '600', color: '#6B7280' },
  dayStatusPresent: { color: '#16A34A' },
  dayStatusAbsent: { color: '#DC2626' },
  dayHours: { fontSize: 8, color: '#9CA3AF' },
  todayLabel: { fontSize: 8, color: '#2563EB', fontWeight: '600', marginTop: 2 },

  // Overview
  overviewRow: { flexDirection: 'row', gap: 12 },
  overviewLeft: { flex: 0.9, alignItems: 'center' },
  legendRow: { marginTop: 12, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 10, color: '#374151', width: 70 },
  legendValue: { fontSize: 10, color: '#6B7280' },

  overviewRight: { flex: 1.1 },
  summaryTableTitle: { fontSize: 11, fontWeight: '700', color: '#374151', marginBottom: 8, backgroundColor: '#F3F4F6', padding: 8, borderRadius: 8 },
  summaryTable: { gap: 6 },
  summaryTableRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  summaryTableRowLast: { borderBottomWidth: 0, backgroundColor: '#EFF6FF', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 6 },
  summaryTableLabel: { fontSize: 11, color: '#6B7280', flexShrink: 1 },
  summaryTableValue: { fontSize: 11, color: '#1F2937', fontWeight: '600' },
  summaryTableLabelHighlight: { color: '#2563EB', fontWeight: '600' },
  summaryTableValueHighlight: { color: '#2563EB', fontWeight: '700' },

  // Quick Actions
  quickActionsScroll: { marginHorizontal: -8 },
  quickAction: { alignItems: 'center', marginHorizontal: 8, width: 80 },
  quickActionIcon: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center', marginBottom: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  quickActionIconText: { fontSize: 22 },
  quickActionLabel: { fontSize: 10, color: '#374151', textAlign: 'center', lineHeight: 14 },

  // Loading
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 14, color: '#6B7280' },
});

// ─── Root screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen({ navigation, route }: Props) {
  const { role, matchedUser, fromManager } = route.params ?? {};
  const effectiveRole = role ?? 'Official';

  if (effectiveRole === 'PD' && matchedUser) {
    return <PDDashboard navigation={navigation} matchedUser={matchedUser} fromManager={fromManager} />;
  }
  return <SupervisorDashboard navigation={navigation} matchedUser={matchedUser} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: '#0F1117' },

  header:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1A1E2E' },
  backBtn:            { width: 60 },
  backText:           { color: '#2563EB', fontSize: 15, fontWeight: '500' },
  headerCenter:       { flex: 1, alignItems: 'center', overflow: 'visible' },
  headerTitle:        { color: '#FFFFFF', fontSize: 17, fontWeight: '700', lineHeight: 22 },
  headerSub:          { color: '#6B7280', fontSize: 12, lineHeight: 17, marginTop: 1 },
  refreshBtn:         { width: 60, alignItems: 'flex-end' },
  refreshText:        { color: '#2563EB', fontSize: 15, fontWeight: '500' },

  statsRow:           { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 16, gap: 8 },
  statCard:           { flex: 1, backgroundColor: '#1A1E2E', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#252A3A' },
  statValue:          { color: '#FFFFFF', fontSize: 22, fontWeight: '700' },
  statLabel:          { color: '#4B5563', fontSize: 9, fontWeight: '700', marginTop: 3, letterSpacing: 0.6 },
  colorPass:          { color: '#16A34A' },
  colorFail:          { color: '#DC2626' },
  colorOfficial:      { color: '#9333EA' },

  list:               { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 40, gap: 8 },
  listHeader:         { color: '#4B5563', fontSize: 12, paddingVertical: 8, paddingHorizontal: 4 },

  center:             { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 32, paddingTop: 60 },
  offlineBanner:      { backgroundColor: '#78350F', marginHorizontal: 16, marginBottom: 8, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  offlineBannerText:  { color: '#FDE68A', fontSize: 12, textAlign: 'center' },
  loadingText:        { color: '#6B7280', fontSize: 14, marginTop: 12 },
  errorText:          { color: '#DC2626', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  retryBtn:           { backgroundColor: '#1A1E2E', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, borderWidth: 1, borderColor: '#252A3A' },
  retryText:          { color: '#2563EB', fontSize: 14, fontWeight: '600' },

  chartScroll:        { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 40 },

  // Project card (Official view)
  projectCard:        { backgroundColor: '#1A1E2E', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#252A3A' },
  projectCardTop:     { flexDirection: 'row', alignItems: 'flex-start' },
  projectCardLeft:    { flex: 1, gap: 6 },
  projectName:        { color: '#FFFFFF', fontSize: 15, fontWeight: '600', lineHeight: 21 },
  upcBadge:           { alignSelf: 'flex-start', backgroundColor: '#1E1432', borderWidth: 1, borderColor: '#4B2D8A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  upcText:            { color: '#A78BFA', fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  projectCardRight:   { alignItems: 'flex-end', gap: 8, marginLeft: 12 },
  kpCountBadge:       { backgroundColor: '#1E1432', borderWidth: 1, borderColor: '#4B2D8A', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  kpCountVal:         { color: '#C4B5FD', fontSize: 18, fontWeight: '700' },
  kpCountLabel:       { color: '#7C3AED', fontSize: 9, fontWeight: '700', letterSpacing: 0.6 },
  expandChevron:      { color: '#4B5563', fontSize: 12 },
  projectDetail:      { marginTop: 12, gap: 8 },
  divider:            { height: 1, backgroundColor: '#252A3A', marginBottom: 4 },
  detailSectionLabel: { color: '#4B5563', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  detailEmpty:        { color: '#374151', fontSize: 13 },
  kpRow:              { flexDirection: 'row', alignItems: 'center', gap: 10 },
  kpRowPrev:          { opacity: 0.6 },
  kpRowTappable:      { paddingVertical: 4 },
  kpChevron:          { color: '#4B5563', fontSize: 18, marginLeft: 4 },
  kpAvatar:           { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E2A45', borderWidth: 1, borderColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  kpAvatarPrev:       { borderColor: '#374151', backgroundColor: '#1A1E2E' },
  kpAvatarText:       { color: '#60A5FA', fontSize: 13, fontWeight: '700' },
  kpAvatarTextPrev:   { color: '#6B7280' },
  kpInfo:             { flex: 1 },
  kpName:             { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  kpNamePrev:         { color: '#9CA3AF' },
  kpPosition:         { color: '#6B7280', fontSize: 11, marginTop: 1 },

  // Profile card (PD view)
  profileCard:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1A1E2E' },
  profileAvatar:      { width: 52, height: 52, borderRadius: 26, backgroundColor: '#1E2A45', borderWidth: 2, borderColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
  profileAvatarText:  { color: '#60A5FA', fontSize: 22, fontWeight: '700' },
  profileInfo:        { flex: 1, gap: 3 },
  profileName:        { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  profilePosition:    { color: '#9CA3AF', fontSize: 13 },
  profileProjectRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  profileProjectName: { color: '#6B7280', fontSize: 12 },
  upcBadgeSmall:      { backgroundColor: '#1E1432', borderWidth: 1, borderColor: '#4B2D8A', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  upcTextSmall:       { color: '#A78BFA', fontSize: 10, fontWeight: '600' },
  profileNoProject:   { color: '#374151', fontSize: 12, marginTop: 4 },

  // Range filter
  rangeRow:           { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#1A1E2E', flexWrap: 'wrap' },
  rangeLabel:         { color: '#4B5563', fontSize: 10, fontWeight: '700', letterSpacing: 1, marginRight: 4 },
  rangeBtn:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#252A3A', backgroundColor: '#1A1E2E' },
  rangeBtnActive:     { borderColor: '#2563EB', backgroundColor: '#1E2A45' },
  rangeBtnText:       { color: '#6B7280', fontSize: 13, fontWeight: '500' },
  rangeBtnTextActive: { color: '#60A5FA', fontWeight: '600' },
  customDatePill:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: '#2563EB', backgroundColor: '#1E2A45' },
  customDateText:     { color: '#60A5FA', fontSize: 11, fontWeight: '500' },
});
