import { describe, it, expect } from 'vitest';
import { parseCsvStudents } from '../src/utils/csvParser.js';

describe('CSV Student Parser', () => {
  it('parses simple name list with LF', () => {
    const csv = 'Alice Martin\nBob Dupont\nCharlie Durand';
    const result = parseCsvStudents(csv);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ fullName: 'Alice Martin', tag: null });
    expect(result[1]).toEqual({ fullName: 'Bob Dupont', tag: null });
    expect(result[2]).toEqual({ fullName: 'Charlie Durand', tag: null });
  });

  it('handles CRLF line endings and trims whitespace', () => {
    const csv = '  Alice Martin  \r\n  Bob Dupont  \r\n';
    const result = parseCsvStudents(csv);

    expect(result).toHaveLength(2);
    expect(result[0].fullName).toBe('Alice Martin');
    expect(result[1].fullName).toBe('Bob Dupont');
  });

  it('parses comma-separated and semicolon-separated tags', () => {
    const csvComma = 'Alice Martin, Groupe A\nBob Dupont, Groupe B';
    const resultComma = parseCsvStudents(csvComma);

    expect(resultComma).toEqual([
      { fullName: 'Alice Martin', tag: 'Groupe A' },
      { fullName: 'Bob Dupont', tag: 'Groupe B' }
    ]);

    const csvSemi = 'Claire Petit; TD1\nDavid Grand; TD2';
    const resultSemi = parseCsvStudents(csvSemi);

    expect(resultSemi).toEqual([
      { fullName: 'Claire Petit', tag: 'TD1' },
      { fullName: 'David Grand', tag: 'TD2' }
    ]);
  });

  it('ignores standard header rows', () => {
    const csvWithHeader = 'nom,étiquette\nAlice Martin,Groupe A\nBob Dupont,Groupe B';
    const result = parseCsvStudents(csvWithHeader);

    expect(result).toHaveLength(2);
    expect(result[0].fullName).toBe('Alice Martin');
    expect(result[1].fullName).toBe('Bob Dupont');
  });

  it('handles quoted names with commas', () => {
    const csv = '"Martin, Alice",Groupe A\n"Dupont, Bob",Groupe B';
    const result = parseCsvStudents(csv);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ fullName: 'Martin, Alice', tag: 'Groupe A' });
    expect(result[1]).toEqual({ fullName: 'Dupont, Bob', tag: 'Groupe B' });
  });

  it('returns empty array on empty or whitespace string', () => {
    expect(parseCsvStudents('')).toEqual([]);
    expect(parseCsvStudents('   \r\n   ')).toEqual([]);
  });
});
