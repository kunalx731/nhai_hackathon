export type KPEntry = {
  employeeId: string;
  name: string;
  position: string;
};

export type Project = {
  id: string;
  name: string;
  upc: string;
  currentKP: KPEntry[];
  previousKP: KPEntry[];
  memberIds: string[];
};

const MOCK_PROJECTS: Project[] = [
  {
    id: 'P001',
    name: 'Delhi–Mumbai Expressway (Pkg-7)',
    upc: 'NH-148N/PKG-07',
    currentKP: [
      { employeeId: 'KP-001', name: 'Rajesh Kumar', position: 'Team Leader' },
      { employeeId: 'KP-002', name: 'Anil Verma', position: 'Resident Engineer' },
    ],
    previousKP: [
      { employeeId: 'KP-005', name: 'Priya Sharma', position: 'Senior Pavement Specialist' },
    ],
    memberIds: ['KP-001', 'KP-002', 'KP-005'],
  },
  {
    id: 'P002',
    name: 'Ganga Expressway (Section II)',
    upc: 'UPEIDA/GE-02',
    currentKP: [
      { employeeId: 'KP-003', name: 'Suresh Reddy', position: 'Bridge Engineer' },
    ],
    previousKP: [
      { employeeId: 'KP-006', name: 'Kavita Iyer', position: 'Senior Quality and Material Expert' },
      { employeeId: 'KP-007', name: 'Ramesh Patel', position: 'Resident Engineer' },
    ],
    memberIds: ['KP-003', 'KP-006', 'KP-007'],
  },
  {
    id: 'P003',
    name: 'Bengaluru–Chennai Expressway (Pkg-3)',
    upc: 'NH-71/PKG-03',
    currentKP: [
      { employeeId: 'KP-004', name: 'Vikram Singh', position: 'Sr. Geotech Expert' },
      { employeeId: 'KP-008', name: 'Deepak Joshi', position: 'Tunnel Design Engineer' },
      { employeeId: 'KP-009', name: 'Neha Gupta', position: 'Tunnel Safety Expert' },
    ],
    previousKP: [],
    memberIds: ['KP-004', 'KP-008', 'KP-009'],
  },
  {
    id: 'P004',
    name: 'Dwarka Expressway (Phase IV)',
    upc: 'NH-248BB/PH-04',
    currentKP: [
      { employeeId: 'KP-002', name: 'Anil Verma', position: 'Resident Engineer' },
    ],
    previousKP: [
      { employeeId: 'KP-010', name: 'Sunita Rao', position: 'Team Leader' },
    ],
    memberIds: ['KP-002', 'KP-010'],
  },
];

export function getAllProjects(): Project[] {
  return MOCK_PROJECTS;
}

export function getProjectForEmployee(employeeId: string): Project | null {
  return MOCK_PROJECTS.find(p => p.memberIds.includes(employeeId)) ?? null;
}

export function getProjectsForOfficial(employeeId: string): Project[] {
  return MOCK_PROJECTS.filter(p =>
    p.currentKP.some(kp => kp.employeeId === employeeId) ||
    p.previousKP.some(kp => kp.employeeId === employeeId)
  );
}

export function getAllEmployees(): KPEntry[] {
  const employeeMap = new Map<string, KPEntry>();
  MOCK_PROJECTS.forEach(p => {
    [...p.currentKP, ...p.previousKP].forEach(kp => {
      employeeMap.set(kp.employeeId, kp);
    });
  });
  return Array.from(employeeMap.values());
}
