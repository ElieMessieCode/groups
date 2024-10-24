import type {
  Constraint,
  DrawMode,
  DrawOptions,
  DrawResult,
  HistoricalDraw,
  Student
} from './types.js';
import { partitionStudents } from './partition.js';

export function verifyDraw(params: {
  seed: number;
  rosterSnapshot: number[];
  options: DrawOptions;
  mode: DrawMode;
  param: number;
  constraints: Constraint[];
  history: HistoricalDraw[];
  expectedResult: DrawResult;
}): boolean {
  try {
    const studentMap = new Map<number, Student>();
    for (const group of params.expectedResult.groups) {
      for (const student of group.members) {
        studentMap.set(student.id, student);
      }
    }

    const reconstructedRoster: Student[] = params.rosterSnapshot.map(id => {
      const existing = studentMap.get(id);
      if (existing) {
        return existing;
      }
      return { id, fullName: `Student ${id}` };
    });

    const recomputed = partitionStudents({
      roster: reconstructedRoster,
      mode: params.mode,
      param: params.param,
      constraints: params.constraints,
      history: params.history,
      options: params.options,
      seed: params.seed
    });

    if (recomputed.seed !== params.expectedResult.seed) {
      return false;
    }
    if (recomputed.score !== params.expectedResult.score) {
      return false;
    }
    if (recomputed.candidateIndex !== params.expectedResult.candidateIndex) {
      return false;
    }
    if (recomputed.groups.length !== params.expectedResult.groups.length) {
      return false;
    }

    for (let i = 0; i < recomputed.groups.length; i++) {
      const gActual = recomputed.groups[i]!;
      const gExpected = params.expectedResult.groups[i]!;
      if (gActual.position !== gExpected.position) {
        return false;
      }
      if (gActual.members.length !== gExpected.members.length) {
        return false;
      }
      for (let j = 0; j < gActual.members.length; j++) {
        if (gActual.members[j]!.id !== gExpected.members[j]!.id) {
          return false;
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}
