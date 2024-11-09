export interface User {
  id: number;
  email: string;
  createdAt: string;
}

export interface Student {
  id: number;
  classId: number;
  fullName: string;
  tag: string | null;
  createdAt: string;
}

export interface Constraint {
  id?: number;
  classId?: number;
  studentA: number;
  studentB: number;
  kind: 'apart' | 'together';
}

export interface ClassEntity {
  id: number;
  ownerId: number;
  name: string;
  createdAt: string;
}

export interface ClassWithStudentCount extends ClassEntity {
  studentCount: number;
}

export interface ClassDetail extends ClassEntity {
  students: Student[];
  constraints: Constraint[];
}

export interface DrawOptions {
  balanceByTag?: boolean;
  avoidRepeats?: boolean;
  candidates?: number;
  historyLimit?: number;
}

export interface GeneratedGroup {
  id?: number;
  position: number;
  name: string;
  members: Student[];
}

export interface DrawResult {
  id: number;
  classId: number;
  seed: number;
  mode: 'group_count' | 'group_size';
  param: number;
  options: DrawOptions;
  rosterSnapshot: number[];
  score: number;
  candidateIndex: number;
  createdAt: string;
  groups: GeneratedGroup[];
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface VerifyResult {
  verified: boolean;
  drawId: number;
  seed: number;
  score: number;
  recalculatedScore: number;
  matchesExactGroups: boolean;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  invalidParams?: Array<{
    name: string;
    reason: string;
  }>;
  conflictingConstraint?: {
    studentA: number;
    studentB: number;
    kind: 'apart' | 'together';
  };
}
