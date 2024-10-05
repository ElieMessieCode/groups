export interface User {
  id: number;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface UserResponse {
  id: number;
  email: string;
  createdAt: string;
}

export interface Session {
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  createdAt: Date;
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

export interface StudentEntity {
  id: number;
  classId: number;
  fullName: string;
  tag: string | null;
  createdAt: string;
}

export interface StudentWithClass extends StudentEntity {
  ownerId: number;
}

export interface ConstraintEntity {
  id: number;
  classId: number;
  studentA: number;
  studentB: number;
  kind: 'apart' | 'together';
}

export interface DrawOptionsEntity {
  balanceByTag?: boolean;
  avoidRepeats?: boolean;
  candidates?: number;
  historyLimit?: number;
}

export interface DrawEntity {
  id: number;
  classId: number;
  seed: number;
  mode: 'group_count' | 'group_size';
  param: number;
  options: DrawOptionsEntity;
  rosterSnapshot: number[];
  score: number;
  candidateIndex: number;
  createdAt: string;
}

export interface DrawGroupEntity {
  id: number;
  drawId: number;
  position: number;
  name: string;
  members: StudentEntity[];
}

export interface DrawWithGroupsEntity extends DrawEntity {
  groups: DrawGroupEntity[];
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string | undefined;
  invalidParams?: Array<{
    name: string;
    reason: string;
  }> | undefined;
  conflictingConstraint?: unknown | undefined;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserResponse | undefined;
      sessionToken?: string | undefined;
    }
  }
}

