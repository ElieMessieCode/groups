import { describe, it, expect } from 'vitest';
import type { DrawResult, Student } from '../types/index.js';

function computePairCounts(draws: DrawResult[]) {
  const counts = new Map<string, number>();
  let max = 0;

  for (const draw of draws) {
    for (const group of draw.groups) {
      const memberIds = group.members.map((m) => m.id);
      for (let i = 0; i < memberIds.length; i++) {
        for (let j = i + 1; j < memberIds.length; j++) {
          const minId = Math.min(memberIds[i], memberIds[j]);
          const maxId = Math.max(memberIds[i], memberIds[j]);
          const key = `${minId}-${maxId}`;
          const c = (counts.get(key) ?? 0) + 1;
          counts.set(key, c);
          if (c > max) {
            max = c;
          }
        }
      }
    }
  }

  return { counts, max };
}

describe('Cooccurrence Calculation', () => {
  it('correctly tallies pairwise student groups across multiple draws', () => {
    const student1: Student = { id: 1, classId: 1, fullName: 'Alice', tag: null, createdAt: '' };
    const student2: Student = { id: 2, classId: 1, fullName: 'Bob', tag: null, createdAt: '' };
    const student3: Student = { id: 3, classId: 1, fullName: 'Charlie', tag: null, createdAt: '' };

    const sampleDraws: DrawResult[] = [
      {
        id: 101,
        classId: 1,
        seed: 42,
        mode: 'group_count',
        param: 2,
        options: {},
        rosterSnapshot: [1, 2, 3],
        score: 100,
        candidateIndex: 0,
        createdAt: '2026-09-30T12:00:00Z',
        groups: [
          { position: 1, name: 'Groupe 1', members: [student1, student2] },
          { position: 2, name: 'Groupe 2', members: [student3] }
        ]
      },
      {
        id: 102,
        classId: 1,
        seed: 99,
        mode: 'group_count',
        param: 2,
        options: {},
        rosterSnapshot: [1, 2, 3],
        score: 95,
        candidateIndex: 1,
        createdAt: '2026-09-30T13:00:00Z',
        groups: [
          { position: 1, name: 'Groupe 1', members: [student1, student2, student3] }
        ]
      }
    ];

    const { counts, max } = computePairCounts(sampleDraws);

    // Alice & Bob were together in draw 101 and draw 102 -> count 2
    expect(counts.get('1-2')).toBe(2);
    // Alice & Charlie were together only in draw 102 -> count 1
    expect(counts.get('1-3')).toBe(1);
    // Bob & Charlie were together only in draw 102 -> count 1
    expect(counts.get('2-3')).toBe(1);
    expect(max).toBe(2);
  });
});
