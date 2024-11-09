import { useMemo, useState } from 'react';
import type { Student, DrawResult } from '../types/index.js';

interface CooccurrenceMatrixProps {
  students: Student[];
  draws: DrawResult[];
}

export function CooccurrenceMatrix({ students, draws }: CooccurrenceMatrixProps) {
  const [hoveredPair, setHoveredPair] = useState<{
    a: Student;
    b: Student;
    count: number;
  } | null>(null);

  // Compute pair counts from historical draws
  const { pairCounts, maxCount } = useMemo(() => {
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

    return { pairCounts: counts, maxCount: max };
  }, [draws]);

  // Sort students by name
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students]);

  const getCellColor = (count: number) => {
    if (count === 0) return { bg: '#ffffff', text: '#888888', border: '#e5e5e5' };
    if (maxCount === 0) return { bg: '#ffffff', text: '#888888', border: '#e5e5e5' };
    const ratio = count / maxCount;
    if (ratio < 0.25) return { bg: '#f0f0f0', text: '#000000', border: '#d0d0d0' };
    if (ratio < 0.5) return { bg: '#d5d5d5', text: '#000000', border: '#b0b0b0' };
    if (ratio < 0.75) return { bg: '#888888', text: '#ffffff', border: '#666666' };
    return { bg: '#111111', text: '#ffffff', border: '#000000' };
  };

  if (students.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Aucun étudiant dans cette classe.</p>
      </div>
    );
  }

  if (draws.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>
          Aucun historique de tirage pour calculer la matrice de co-occurrence.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
          Matrice de co-occurrence ({draws.length} tirages analysés)
        </h3>
        {hoveredPair && (
          <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>
            <strong>{hoveredPair.a.fullName}</strong> & <strong>{hoveredPair.b.fullName}</strong> :{' '}
            <span className="mono">{hoveredPair.count}</span> fois ensemble
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid var(--border-light)', borderRadius: '4px', padding: '0.5rem' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: '0.75rem',
            width: '100%',
            tableLayout: 'fixed'
          }}
          aria-label="Matrice de co-occurrence triangulaire"
        >
          <thead>
            <tr>
              <th style={{ padding: '4px', width: '120px', textAlign: 'left', fontWeight: 600 }}>
                Étudiants
              </th>
              {sortedStudents.map((s, idx) => (
                <th
                  key={s.id}
                  style={{
                    padding: '4px',
                    textAlign: 'center',
                    minWidth: '28px',
                    maxWidth: '36px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={s.fullName}
                >
                  {idx + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedStudents.map((rowStudent, i) => (
              <tr key={rowStudent.id}>
                <th
                  style={{
                    padding: '4px 6px',
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    fontWeight: 500,
                    borderBottom: '1px solid var(--border-light)'
                  }}
                  title={rowStudent.fullName}
                >
                  <span className="mono" style={{ marginRight: '4px', color: 'var(--text-muted)' }}>
                    {i + 1}.
                  </span>
                  {rowStudent.fullName}
                </th>
                {sortedStudents.map((colStudent, j) => {
                  if (i === j) {
                    return (
                      <td
                        key={colStudent.id}
                        style={{
                          backgroundColor: '#f5f5f5',
                          border: '1px solid var(--border-light)',
                          textAlign: 'center',
                          color: '#aaa'
                        }}
                      >
                        -
                      </td>
                    );
                  }

                  if (j < i) {
                    return (
                      <td
                        key={colStudent.id}
                        style={{
                          backgroundColor: '#fafafa',
                          border: '1px solid #f0f0f0'
                        }}
                      />
                    );
                  }

                  const minId = Math.min(rowStudent.id, colStudent.id);
                  const maxId = Math.max(rowStudent.id, colStudent.id);
                  const count = pairCounts.get(`${minId}-${maxId}`) ?? 0;
                  const style = getCellColor(count);

                  return (
                    <td
                      key={colStudent.id}
                      style={{
                        backgroundColor: style.bg,
                        color: style.text,
                        border: `1px solid ${style.border}`,
                        textAlign: 'center',
                        fontWeight: count > 0 ? 600 : 400,
                        cursor: 'pointer',
                        padding: '4px 2px'
                      }}
                      onMouseEnter={() =>
                        setHoveredPair({ a: rowStudent, b: colStudent, count })
                      }
                      onMouseLeave={() => setHoveredPair(null)}
                      title={`${rowStudent.fullName} & ${colStudent.fullName} : ${count} fois`}
                      aria-label={`${rowStudent.fullName} et ${colStudent.fullName}, ${count} fois ensemble`}
                    >
                      {count}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        <span>Légende (fréquence) :</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '14px', height: '14px', background: '#ffffff', border: '1px solid #e5e5e5', display: 'inline-block' }} />
          <span>0</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '14px', height: '14px', background: '#f0f0f0', border: '1px solid #d0d0d0', display: 'inline-block' }} />
          <span>Faible</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '14px', height: '14px', background: '#d5d5d5', border: '1px solid #b0b0b0', display: 'inline-block' }} />
          <span>Moyenne</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <span style={{ width: '14px', height: '14px', background: '#111111', border: '1px solid #000000', display: 'inline-block' }} />
          <span>Élevée</span>
        </div>
      </div>
    </div>
  );
}
