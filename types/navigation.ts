export type RootStackParamList = {
  Home: undefined;
  Verification: { eventType?: 'check-in' | 'check-out' } | undefined;
  Result: {
    success: boolean;
    matchScore: number;
    processingMs: number;
    matchedUser?: { name: string; employeeId: string; role: 'Official' | 'PD'; position: string };
    eventType?: 'check-in' | 'check-out';
  };
  RegistrationForm: undefined;
  FaceRegistrationCamera: {
    employeeId: string;
    name: string;
    password: string;
    role: 'Official' | 'PD';
    position: string;
    organisationCategory: string;
    organisationName: string;
    isKP?: boolean;
  };
  RegisteredUsers: undefined;
  AdminLogin: undefined;
  UserLogin: undefined;
  Dashboard: {
    role?: 'Official' | 'PD';
    matchedUser?: { name: string; employeeId: string; position: string };
    fromManager?: boolean;
  };
};
