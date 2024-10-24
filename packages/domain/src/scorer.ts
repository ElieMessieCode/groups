import type { Constraint, HistoricalDraw, Student } from './types.js';

export function buildPairKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`;
}

export function buildHistoricalPairPenaltyMap(
  history: readonly HistoricalDraw[],
  historyLimit: number
): Map<string, number> {
  const penaltyMap = new Map<string, number>();
  const effectiveHistory = historyLimit > 0 ? history.slice(-historyLimit) : [];

  for (const draw of effectiveHistory) {
    const weight = draw.weight;
    for (const group of draw.groups) {
      const studentIds = group.studentIds;
      const len = studentIds.length;
      for (let i = 0; i < len; i++) {
        const idA = studentIds[i]!;
        for (let j = i + 1; j < len; j++) {
          const idB = studentIds[j]!;
          const key = buildPairKey(idA, idB);
          penaltyMap.set(key, (penaltyMap.get(key) ?? 0) + weight);
        }
      }
    }
  }

  return penaltyMap;
}

export function calculatePartitionScore(
  groups: readonly (readonly Student[])[],
  penaltyMap: ReadonlyMap<string, number>,
  avoidRepeats: boolean
): number {
  if (!avoidRepeats || penaltyMap.size === 0) {
    return 0;
  }

  let totalScore = 0;
  for (const group of groups) {
    const len = group.length;
    for (let i = 0; i < len; i++) {
      const idA = group[i]!.id;
      for (let j = i + 1; j < len; j++) {
        const idB = group[j]!.id;
        const key = buildPairKey(idA, idB);
        const penalty = penaltyMap.get(key);
        if (penalty !== undefined) {
          totalScore += penalty;
        }
      }
    }
  }

  return totalScore;
}

export function validateApartConstraints(
  groups: readonly (readonly Student[])[],
  constraints: readonly Constraint[]
): { valid: boolean; violation?: Constraint } {
  const apartConstraints = constraints.filter(c => c.kind === 'apart');
  if (apartConstraints.length === 0) {
    return { valid: true };
  }

  const studentToGroupMap = new Map<number, number>();
  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    for (const student of groups[gIdx]!) {
      studentToGroupMap.set(student.id, gIdx);
    }
  }

  for (const constraint of apartConstraints) {
    const groupA = studentToGroupMap.get(constraint.studentA);
    const groupB = studentToGroupMap.get(constraint.studentB);
    if (groupA !== undefined && groupB !== undefined && groupA === groupB) {
      return { valid: false, violation: constraint };
    }
  }

  return { valid: true };
}

export function validateTogetherConstraints(
  groups: readonly (readonly Student[])[],
  constraints: readonly Constraint[]
): { valid: boolean; violation?: Constraint } {
  const togetherConstraints = constraints.filter(c => c.kind === 'together');
  if (togetherConstraints.length === 0) {
    return { valid: true };
  }

  const studentToGroupMap = new Map<number, number>();
  for (let gIdx = 0; gIdx < groups.length; gIdx++) {
    for (const student of groups[gIdx]!) {
      studentToGroupMap.set(student.id, gIdx);
    }
  }

  for (const constraint of togetherConstraints) {
    const groupA = studentToGroupMap.get(constraint.studentA);
    const groupB = studentToGroupMap.get(constraint.studentB);
    if (groupA !== undefined && groupB !== undefined && groupA !== groupB) {
      return { valid: false, violation: constraint };
    }
  }

  return { valid: true };
}

export function validateAllConstraints(
  groups: readonly (readonly Student[])[],
  constraints: readonly Constraint[]
): { valid: boolean; violation?: Constraint } {
  const apartResult = validateApartConstraints(groups, constraints);
  if (!apartResult.valid) {
    return apartResult;
  }
  return validateTogetherConstraints(groups, constraints);
}
