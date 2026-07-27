import { FaceQualityResult } from '../services/faceQualityService';

export type FaceEmbedding = number[];

export type CapturedRegistrationSample = {
  localImagePath: string;
  embedding: FaceEmbedding;
  quality: FaceQualityResult;
  sampleIndex: number;
  instruction: string;
};

export type RegisteredFaceTemplate = {
  templateId: string;
  employeeId: string;
  name: string;
  embedding: FaceEmbedding;
  modelName: "MobileFaceNet";
  modelVersion: string;
  sampleIndex: number;
  quality: FaceQualityResult;
  createdAt: string;
};

export type RegisteredUser = {
  employeeId: string;
  name: string;
  password: string;
  role: 'Official' | 'PD';
  position: string;
  organisationCategory: string;
  organisationName: string;
  isKP?: boolean;
  templates: RegisteredFaceTemplate[];
  createdAt: string;
  updatedAt: string;
};
