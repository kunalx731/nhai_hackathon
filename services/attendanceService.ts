import { AWS_CONFIG } from '../constants/aws';
import { getLocalVerificationEvents, VerificationEventPayload } from './syncService';

export interface AttendanceEvent {
  id:           string;
  employeeId:   string;
  matchedName:  string | null;
  success:      boolean;
  matchScore:   number;
  processingMs: number;
  timestamp:    string;
  syncedAt:     string;
  eventType?:   'check-in' | 'check-out';
}

// Employee data for dummy generation
const EMPLOYEES = [
  { id: 'KP-001', name: 'Rajesh Kumar' },
  { id: 'KP-002', name: 'Anil Verma' },
  { id: 'KP-003', name: 'Suresh Reddy' },
  { id: 'KP-004', name: 'Vikram Singh' },
  { id: 'KP-005', name: 'Priya Sharma' },
  { id: 'KP-006', name: 'Kavita Iyer' },
  { id: 'KP-007', name: 'Ramesh Patel' },
  { id: 'KP-008', name: 'Deepak Joshi' },
  { id: 'KP-009', name: 'Neha Gupta' },
  { id: 'KP-010', name: 'Sunita Rao' },
];

function generateDummyAttendance(): AttendanceEvent[] {
  const events: AttendanceEvent[] = [];
  const now = new Date();

  for (const emp of EMPLOYEES) {
    // Generate 60 days of attendance data
    for (let dayOffset = 0; dayOffset < 60; dayOffset++) {
      const date = new Date(now);
      date.setDate(date.getDate() - dayOffset);

      // Skip weekends (random ~20% chance to have weekend work)
      const dayOfWeek = date.getDay();
      if ((dayOfWeek === 0 || dayOfWeek === 6) && Math.random() > 0.2) continue;

      // Random absence (~8% chance)
      if (Math.random() < 0.08) continue;

      // Check-in time: 8:30 AM - 10:00 AM (random)
      const checkInHour = 8 + Math.floor(Math.random() * 2);
      const checkInMin = Math.floor(Math.random() * 60);
      const checkInTime = new Date(date);
      checkInTime.setHours(checkInHour, checkInMin, 0, 0);

      // Check-in event
      events.push({
        id: `dummy-${emp.id}-${dayOffset}-in`,
        employeeId: emp.id,
        matchedName: emp.name,
        success: Math.random() > 0.02, // 98% success rate
        matchScore: 0.85 + Math.random() * 0.14,
        processingMs: 150 + Math.floor(Math.random() * 200),
        timestamp: checkInTime.toISOString(),
        syncedAt: checkInTime.toISOString(),
        eventType: 'check-in',
      });

      // Check-out time: 5:00 PM - 8:00 PM (random), skip if today and before 5pm
      const isToday = dayOffset === 0;
      const currentHour = now.getHours();
      if (isToday && currentHour < 17) continue; // No checkout yet today

      const checkOutHour = 17 + Math.floor(Math.random() * 3);
      const checkOutMin = Math.floor(Math.random() * 60);
      const checkOutTime = new Date(date);
      checkOutTime.setHours(checkOutHour, checkOutMin, 0, 0);

      // Check-out event (~95% of days have checkout)
      if (Math.random() > 0.05 || !isToday) {
        events.push({
          id: `dummy-${emp.id}-${dayOffset}-out`,
          employeeId: emp.id,
          matchedName: emp.name,
          success: Math.random() > 0.02,
          matchScore: 0.85 + Math.random() * 0.14,
          processingMs: 150 + Math.floor(Math.random() * 200),
          timestamp: checkOutTime.toISOString(),
          syncedAt: checkOutTime.toISOString(),
          eventType: 'check-out',
        });
      }
    }
  }

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

let _dummyData: AttendanceEvent[] | null = null;
function getDummyData(): AttendanceEvent[] {
  if (!_dummyData) _dummyData = generateDummyAttendance();
  return _dummyData;
}

/**
 * Read attendance records from the local sync queue when offline.
 * Returns events ordered newest-first, matching the AWS response order.
 */
export async function getLocalAttendanceHistory(): Promise<AttendanceEvent[]> {
  const items = await getLocalVerificationEvents();
  const localEvents = items
    .map(item => {
      const p = item.payload as VerificationEventPayload;
      return {
        id:           item.id,
        employeeId:   p.employeeId ?? '',
        matchedName:  p.matchedName ?? null,
        success:      p.success,
        matchScore:   p.matchScore,
        processingMs: p.processingMs,
        timestamp:    p.timestamp,
        syncedAt:     '',
        eventType:    p.eventType,
      } as AttendanceEvent;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Return real local events (dummy data disabled for production use)
  // To enable demo mode, uncomment: return [...localEvents, ...getDummyData()];
  return localEvents;
}

export async function fetchAttendanceHistory(limit = 100): Promise<AttendanceEvent[]> {
  const url = `${AWS_CONFIG.apiEndpoint}${AWS_CONFIG.attendancePath}?limit=${limit}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (AWS_CONFIG.apiKey) headers['x-api-key'] = AWS_CONFIG.apiKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AWS_CONFIG.timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { events?: AttendanceEvent[] };
    return body.events ?? [];
  } catch {
    // Fallback to local events when AWS is unavailable
    return getLocalAttendanceHistory();
  } finally {
    clearTimeout(timeout);
  }
}
