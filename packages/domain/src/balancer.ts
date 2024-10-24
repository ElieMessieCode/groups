import type { DrawMode, Student } from './types.js';

export interface StudentBlock {
  id: number;
  students: Student[];
  tag?: string | null | undefined;
}

export function calculateGroupCapacities(n: number, mode: DrawMode, param: number): number[] {
  if (n <= 0) {
    return [];
  }
  const g = mode === 'group_count' ? param : Math.ceil(n / param);
  if (g <= 0) {
    return [];
  }
  const baseSize = Math.floor(n / g);
  const remainder = n % g;
  const capacities: number[] = new Array(g);
  for (let i = 0; i < g; i++) {
    capacities[i] = i < remainder ? baseSize + 1 : baseSize;
  }
  return capacities;
}

export function distributeBlocksSerpentine(
  blocks: readonly StudentBlock[],
  capacities: readonly number[]
): Student[][] | null {
  const numGroups = capacities.length;
  if (numGroups === 0) {
    return [];
  }
  const groups: Student[][] = Array.from({ length: numGroups }, () => []);
  const remaining = [...capacities];

  let dir = 1;
  let groupIdx = 0;

  for (const block of blocks) {
    const blockSize = block.students.length;
    let placed = false;
    let attempts = 0;

    while (attempts < numGroups * 2) {
      if (remaining[groupIdx]! >= blockSize) {
        groups[groupIdx]!.push(...block.students);
        remaining[groupIdx]! -= blockSize;
        placed = true;

        if (numGroups > 1) {
          if (groupIdx === numGroups - 1 && dir === 1) {
            dir = -1;
          } else if (groupIdx === 0 && dir === -1) {
            dir = 1;
          } else {
            groupIdx += dir;
          }
        }
        break;
      }

      if (numGroups > 1) {
        if (groupIdx === numGroups - 1 && dir === 1) {
          dir = -1;
        } else if (groupIdx === 0 && dir === -1) {
          dir = 1;
        } else {
          groupIdx += dir;
        }
      }
      attempts++;
    }

    if (!placed) {
      return null;
    }
  }

  for (let i = 0; i < numGroups; i++) {
    if (remaining[i]! !== 0) {
      return null;
    }
  }

  return groups;
}
