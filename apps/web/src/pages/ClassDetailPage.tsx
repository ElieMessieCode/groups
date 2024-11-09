import { useState, useMemo, type FormEvent, type ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client.js';
import type {
  ClassDetail,
  Student,
  Constraint,
  DrawResult,
  PaginatedResult
} from '../types/index.js';
import { DrawReveal } from '../components/DrawReveal.js';
import { CooccurrenceMatrix } from '../components/CooccurrenceMatrix.js';

type Tab = 'students' | 'constraints' | 'draw' | 'reveal' | 'history';

interface ParsedPastedStudent {
  fullName: string;
  tag: string | null;
  isDuplicate: boolean;
}

export function ClassDetailPage() {
  const { id } = useParams<{ id: string }>();
  const classId = Number(id);
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<Tab>('students');
  const [currentDraw, setCurrentDraw] = useState<DrawResult | null>(null);

  // --- Students Tab State ---
  const [pasteText, setPasteText] = useState('');
  const [singleStudentName, setSingleStudentName] = useState('');
  const [singleStudentTag, setSingleStudentTag] = useState('');
  const [studentError, setStudentError] = useState<string | null>(null);

  // --- Constraints Tab State ---
  const [selectedStudentA, setSelectedStudentA] = useState<number | ''>('');
  const [selectedStudentB, setSelectedStudentB] = useState<number | ''>('');
  const [constraintKind, setConstraintKind] = useState<'apart' | 'together'>('apart');
  const [localConstraints, setLocalConstraints] = useState<Constraint[] | null>(null);
  const [constraintError, setConstraintError] = useState<string | null>(null);
  const [hasConstraintChanges, setHasConstraintChanges] = useState(false);

  // --- Draw Launch Tab State ---
  const [drawMode, setDrawMode] = useState<'group_count' | 'group_size'>('group_count');
  const [drawParam, setDrawParam] = useState<number>(4);
  const [balanceByTag, setBalanceByTag] = useState<boolean>(false);
  const [avoidRepeats, setAvoidRepeats] = useState<boolean>(true);
  const [customSeed, setCustomSeed] = useState<string>('');
  const [drawError, setDrawError] = useState<string | null>(null);

  // Fetch class details
  const { data: classData, isLoading: isClassLoading, error: classLoadError } = useQuery<ClassDetail>({
    queryKey: ['class', classId],
    queryFn: () => api.get<ClassDetail>(`/api/classes/${classId}`),
    enabled: !!classId
  });

  // Fetch past draws
  const { data: pastDrawsData } = useQuery<PaginatedResult<DrawResult>>({
    queryKey: ['draws', classId],
    queryFn: () => api.get<PaginatedResult<DrawResult>>(`/api/classes/${classId}/draws?limit=50`),
    enabled: !!classId
  });

  const students = classData?.students ?? [];
  const constraints = localConstraints ?? classData?.constraints ?? [];
  const pastDraws = pastDrawsData?.items ?? [];

  // Parse pasted lines in real time
  const parsedPastedStudents = useMemo<ParsedPastedStudent[]>(() => {
    if (!pasteText.trim()) return [];
    const existingNames = new Set(students.map((s) => s.fullName.toLowerCase().trim()));
    const seenInBatch = new Set<string>();

    return pasteText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        let fullName = line;
        let tag: string | null = null;

        const sepIndex = line.search(/[,;\t]/);
        if (sepIndex !== -1) {
          fullName = line.slice(0, sepIndex).trim();
          const rawTag = line.slice(sepIndex + 1).trim();
          tag = rawTag.length > 0 ? rawTag : null;
        }

        const lower = fullName.toLowerCase();
        const isDuplicate = existingNames.has(lower) || seenInBatch.has(lower);
        seenInBatch.add(lower);

        return { fullName, tag, isDuplicate };
      });
  }, [pasteText, students]);

  // Mutations
  const addStudentsBatchMutation = useMutation({
    mutationFn: (items: Array<{ fullName: string; tag?: string | null }>) =>
      api.post(`/api/classes/${classId}/students`, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class', classId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setPasteText('');
      setSingleStudentName('');
      setSingleStudentTag('');
      setStudentError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setStudentError(err.detail);
      } else {
        setStudentError("Erreur lors de l'ajout des étudiants");
      }
    }
  });

  const deleteStudentMutation = useMutation({
    mutationFn: (studentId: number) => api.delete(`/api/students/${studentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['class', classId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    }
  });

  const saveConstraintsMutation = useMutation({
    mutationFn: (items: Constraint[]) =>
      api.put<Constraint[]>(`/api/classes/${classId}/constraints`, { constraints: items }),
    onSuccess: (updated: Constraint[]) => {
      queryClient.invalidateQueries({ queryKey: ['class', classId] });
      setLocalConstraints(updated);
      setHasConstraintChanges(false);
      setConstraintError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setConstraintError(err.detail);
      } else {
        setConstraintError("Erreur lors de l'enregistrement des contraintes");
      }
    }
  });

  const launchDrawMutation = useMutation({
    mutationFn: async () => {
      const payload: {
        mode: 'group_count' | 'group_size';
        param: number;
        seed?: number;
        options: {
          balanceByTag: boolean;
          avoidRepeats: boolean;
          candidates: number;
          historyLimit: number;
        };
      } = {
        mode: drawMode,
        param: drawParam,
        options: {
          balanceByTag,
          avoidRepeats,
          candidates: 200,
          historyLimit: 5
        }
      };

      if (customSeed.trim()) {
        const parsedSeed = parseInt(customSeed.trim(), 10);
        if (!isNaN(parsedSeed) && parsedSeed >= 0) {
          payload.seed = parsedSeed;
        }
      }

      return api.post<DrawResult>(`/api/classes/${classId}/draws`, payload);
    },
    onSuccess: (result: DrawResult) => {
      queryClient.invalidateQueries({ queryKey: ['draws', classId] });
      setCurrentDraw(result);
      setActiveTab('reveal');
      setDrawError(null);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setDrawError(err.detail);
      } else {
        setDrawError('Impossible de générer le tirage');
      }
    }
  });

  const deleteDrawMutation = useMutation({
    mutationFn: (drawId: number) => api.delete(`/api/draws/${drawId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['draws', classId] });
    }
  });

  // Handlers
  const handleAddSingleStudent = (e: FormEvent) => {
    e.preventDefault();
    if (!singleStudentName.trim()) return;
    addStudentsBatchMutation.mutate([
      {
        fullName: singleStudentName.trim(),
        tag: singleStudentTag.trim() || null
      }
    ]);
  };

  const handleAddBatch = () => {
    if (parsedPastedStudents.length === 0) return;
    addStudentsBatchMutation.mutate(
      parsedPastedStudents.map((s) => ({
        fullName: s.fullName,
        tag: s.tag
      }))
    );
  };

  const handleAddConstraint = (e: FormEvent) => {
    e.preventDefault();
    if (selectedStudentA === '' || selectedStudentB === '') return;
    if (selectedStudentA === selectedStudentB) {
      setConstraintError('Un étudiant ne peut pas être contraint avec lui-même');
      return;
    }

    const a = Math.min(Number(selectedStudentA), Number(selectedStudentB));
    const b = Math.max(Number(selectedStudentA), Number(selectedStudentB));

    const currentList = localConstraints ?? classData?.constraints ?? [];

    const existingIndex = currentList.findIndex(
      (c) => c.studentA === a && c.studentB === b
    );

    let updatedList: Constraint[];
    if (existingIndex !== -1) {
      updatedList = currentList.map((c, idx) =>
        idx === existingIndex ? { studentA: a, studentB: b, kind: constraintKind } : c
      );
    } else {
      updatedList = [...currentList, { studentA: a, studentB: b, kind: constraintKind }];
    }

    setLocalConstraints(updatedList);
    setHasConstraintChanges(true);
    setConstraintError(null);
    setSelectedStudentA('');
    setSelectedStudentB('');
  };

  const handleRemoveConstraint = (studentA: number, studentB: number) => {
    const currentList = localConstraints ?? classData?.constraints ?? [];
    const updated = currentList.filter(
      (c) => !(c.studentA === studentA && c.studentB === studentB)
    );
    setLocalConstraints(updated);
    setHasConstraintChanges(true);
  };

  const handleCsvFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setPasteText((prev) => (prev ? `${prev}\n${text}` : text));
      }
    };
    reader.readAsText(file);
  };

  const studentMap = useMemo(() => {
    const map = new Map<number, Student>();
    for (const s of students) {
      map.set(s.id, s);
    }
    return map;
  }, [students]);

  if (isClassLoading) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
          Chargement de la classe...
        </div>
      </div>
    );
  }

  if (classLoadError || !classData) {
    return (
      <div className="container">
        <div className="error-banner">Classe introuvable ou inaccessible.</div>
        <Link to="/classes" className="btn btn-secondary">
          ← Retour à mes classes
        </Link>
      </div>
    );
  }

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <Link to="/classes" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            ← Retour aux classes
          </Link>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '-0.02em', marginTop: '0.2rem' }}>
            {classData.name}
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            {students.length} {students.length > 1 ? 'étudiants' : 'étudiant'} · {constraints.length} contraintes
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setActiveTab('draw');
          }}
          className="btn btn-primary"
        >
          Lancer un tirage →
        </button>
      </div>

      {/* Tabs Bar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          gap: '0.25rem',
          borderBottom: '1px solid var(--border-light)',
          paddingBottom: '0.5rem',
          overflowX: 'auto'
        }}
        role="tablist"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'students'}
          onClick={() => setActiveTab('students')}
          className={`btn btn-sm ${activeTab === 'students' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Étudiants ({students.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'constraints'}
          onClick={() => setActiveTab('constraints')}
          className={`btn btn-sm ${activeTab === 'constraints' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Contraintes ({constraints.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'draw'}
          onClick={() => setActiveTab('draw')}
          className={`btn btn-sm ${activeTab === 'draw' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Nouveau tirage
        </button>
        {currentDraw && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'reveal'}
            onClick={() => setActiveTab('reveal')}
            className={`btn btn-sm ${activeTab === 'reveal' ? 'btn-primary' : 'btn-secondary'}`}
          >
            Révélation en cours
          </button>
        )}
        <button
          role="tab"
          type="button"
          aria-selected={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
          className={`btn btn-sm ${activeTab === 'history' ? 'btn-primary' : 'btn-secondary'}`}
        >
          Historique & Matrice ({pastDraws.length})
        </button>
      </div>

      {/* TAB: STUDENTS */}
      {activeTab === 'students' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {studentError && <div className="error-banner">{studentError}</div>}

          {/* Quick Paste / Import Section */}
          <div className="card" style={{ background: 'var(--bg-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>
                Collage rapide (clavier-first) ou import CSV
              </h2>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                Importer un fichier CSV
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleCsvFileUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              Collez une liste d'étudiants (un par ligne). Format supporté : <code>Nom Prénom</code> ou <code>Nom Prénom ; Étiquette</code>.
            </p>
            <textarea
              className="input-field"
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={'Alice Dupont; Groupe A\nBob Martin; Groupe B\nCharlie Durand'}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
            />

            {parsedPastedStudents.length > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem' }}>
                  {parsedPastedStudents.length} étudiant(s) détecté(s)
                  {parsedPastedStudents.some((p) => p.isDuplicate) && (
                    <strong style={{ marginLeft: '0.5rem', color: '#000' }}>
                      (Doublons détectés ignorés ou signalés)
                    </strong>
                  )}
                </span>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setPasteText('')}
                    className="btn btn-secondary btn-sm"
                  >
                    Effacer
                  </button>
                  <button
                    type="button"
                    onClick={handleAddBatch}
                    disabled={addStudentsBatchMutation.isPending}
                    className="btn btn-primary btn-sm"
                  >
                    {addStudentsBatchMutation.isPending
                      ? 'Ajout en cours...'
                      : `Ajouter ces ${parsedPastedStudents.length} étudiants`}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Single Student Add */}
          <form onSubmit={handleAddSingleStudent} className="card" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 2, minWidth: '180px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                Nom complet
              </label>
              <input
                type="text"
                required
                className="input-field"
                placeholder="Ex: Clara Blanc"
                value={singleStudentName}
                onChange={(e) => setSingleStudentName(e.target.value)}
              />
            </div>
            <div style={{ flex: 1, minWidth: '120px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                Étiquette / Tag (optionnel)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Ex: Informatique"
                value={singleStudentTag}
                onChange={(e) => setSingleStudentTag(e.target.value)}
              />
            </div>
            <button
              type="submit"
              disabled={addStudentsBatchMutation.isPending}
              className="btn btn-secondary"
            >
              + Ajouter
            </button>
          </form>

          {/* Student List */}
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Liste des étudiants ({students.length})
            </h2>
            {students.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Aucun étudiant dans cette classe.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {students.map((s, idx) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.4rem 0.6rem',
                      borderBottom: '1px solid var(--border-light)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem', width: '24px' }}>
                        {idx + 1}.
                      </span>
                      <span style={{ fontWeight: 500 }}>{s.fullName}</span>
                      {s.tag && <span className="badge">{s.tag}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteStudentMutation.mutate(s.id)}
                      className="btn btn-danger btn-sm"
                      aria-label={`Supprimer ${s.fullName}`}
                    >
                      Supprimer
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: CONSTRAINTS */}
      {activeTab === 'constraints' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {constraintError && <div className="error-banner">{constraintError}</div>}

          {/* New Constraint Form */}
          <div className="card" style={{ background: 'var(--bg-subtle)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Ajouter une contrainte de binôme
            </h2>
            <form onSubmit={handleAddConstraint} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: '160px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                  Étudiant 1
                </label>
                <select
                  className="input-field"
                  value={selectedStudentA}
                  onChange={(e) => setSelectedStudentA(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Sélectionner...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1, minWidth: '140px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                  Type
                </label>
                <select
                  className="input-field"
                  value={constraintKind}
                  onChange={(e) => setConstraintKind(e.target.value as 'apart' | 'together')}
                >
                  <option value="apart">Séparés (apart)</option>
                  <option value="together">Ensemble (together)</option>
                </select>
              </div>

              <div style={{ flex: 1, minWidth: '160px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.2rem' }}>
                  Étudiant 2
                </label>
                <select
                  className="input-field"
                  value={selectedStudentB}
                  onChange={(e) => setSelectedStudentB(e.target.value ? Number(e.target.value) : '')}
                  required
                >
                  <option value="">Sélectionner...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id === selectedStudentA}>
                      {s.fullName}
                    </option>
                  ))}
                </select>
              </div>

              <button type="submit" className="btn btn-secondary">
                + Ajouter la règle
              </button>
            </form>
          </div>

          {/* Constraints List */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>
                Règles actives ({constraints.length})
              </h2>
              {hasConstraintChanges && (
                <button
                  type="button"
                  onClick={() => saveConstraintsMutation.mutate(constraints)}
                  disabled={saveConstraintsMutation.isPending}
                  className="btn btn-primary btn-sm"
                >
                  {saveConstraintsMutation.isPending
                    ? 'Enregistrement...'
                    : 'Enregistrer les modifications'}
                </button>
              )}
            </div>

            {constraints.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                Aucune contrainte définie. Le tirage sera libre et équilibré.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {constraints.map((c) => {
                  const studentA = studentMap.get(c.studentA);
                  const studentB = studentMap.get(c.studentB);
                  return (
                    <div
                      key={`${c.studentA}-${c.studentB}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.4rem 0.6rem',
                        borderBottom: '1px solid var(--border-light)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontWeight: 500 }}>
                          {studentA ? studentA.fullName : `ID #${c.studentA}`}
                        </span>
                        <span className={`badge ${c.kind === 'together' ? 'badge-dark' : ''}`}>
                          {c.kind === 'together' ? 'doivent être ENSEMBLE' : 'doivent être SÉPARÉS'}
                        </span>
                        <span style={{ fontWeight: 500 }}>
                          {studentB ? studentB.fullName : `ID #${c.studentB}`}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveConstraint(c.studentA, c.studentB)}
                        className="btn btn-danger btn-sm"
                        aria-label="Retirer cette contrainte"
                      >
                        Retirer
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: DRAW LAUNCH */}
      {activeTab === 'draw' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '600px' }}>
          {drawError && <div className="error-banner">{drawError}</div>}

          <div className="card">
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>
              Paramètres du tirage déterministe
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Mode Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  Mode de répartition
                </label>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="drawMode"
                      checked={drawMode === 'group_count'}
                      onChange={() => setDrawMode('group_count')}
                    />
                    Nombre de groupes fixé
                  </label>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="drawMode"
                      checked={drawMode === 'group_size'}
                      onChange={() => setDrawMode('group_size')}
                    />
                    Taille de groupe fixée
                  </label>
                </div>
              </div>

              {/* Param Input */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  {drawMode === 'group_count'
                    ? 'Nombre total de groupes souhaité'
                    : 'Nombre d’étudiants par groupe cible'}
                </label>
                <input
                  type="number"
                  min={1}
                  max={students.length || 100}
                  className="input-field"
                  value={drawParam}
                  onChange={(e) => setDrawParam(Number(e.target.value))}
                />
              </div>

              {/* Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={balanceByTag}
                    onChange={(e) => setBalanceByTag(e.target.checked)}
                  />
                  Équilibrer la répartition des étiquettes (tags) entre les groupes
                </label>

                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={avoidRepeats}
                    onChange={(e) => setAvoidRepeats(e.target.checked)}
                  />
                  Éviter la répétition des binômes des 5 derniers tirages
                </label>
              </div>

              {/* Seed */}
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Graine déterministe (Seed - optionnelle)
                </label>
                <input
                  type="text"
                  className="input-field mono"
                  placeholder="Laissez vide pour un tirage aléatoire nouveau"
                  value={customSeed}
                  onChange={(e) => setCustomSeed(e.target.value)}
                />
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Une même graine avec les mêmes étudiants et contraintes produira exactement les mêmes groupes.
                </span>
              </div>

              <button
                type="button"
                onClick={() => launchDrawMutation.mutate()}
                disabled={launchDrawMutation.isPending || students.length === 0}
                className="btn btn-primary"
                style={{ padding: '0.75rem', fontSize: '1rem' }}
              >
                {launchDrawMutation.isPending
                  ? 'Calcul mathématique en cours...'
                  : 'Lancer le tirage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB: REVEAL */}
      {activeTab === 'reveal' && currentDraw && (
        <DrawReveal
          draw={currentDraw}
          onNewDraw={() => setActiveTab('draw')}
        />
      )}

      {/* TAB: HISTORY & CO-OCCURRENCE */}
      {activeTab === 'history' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          {/* Triangular Heatmap */}
          <div className="card">
            <CooccurrenceMatrix students={students} draws={pastDraws} />
          </div>

          {/* Past Draws List */}
          <div className="card">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Historique des tirages ({pastDraws.length})
            </h2>

            {pastDraws.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>Aucun tirage antérieur enregistré.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {pastDraws.map((d) => (
                  <div
                    key={d.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.75rem',
                      border: '1px solid var(--border-light)',
                      borderRadius: '4px',
                      flexWrap: 'wrap',
                      gap: '0.75rem'
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <strong>Tirage #{d.id}</strong>
                        <span className="badge mono">Graine: {d.seed}</span>
                        <span className="badge">Score: {d.score}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        {d.groups.length} groupes · Créé le {new Date(d.createdAt).toLocaleString('fr-FR')}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentDraw(d);
                          setActiveTab('reveal');
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        Ouvrir / Révéler
                      </button>
                      <a
                        href={`/api/draws/${d.id}/export.csv`}
                        download={`tirage-${d.id}.csv`}
                        className="btn btn-secondary btn-sm"
                      >
                        Export CSV
                      </a>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Supprimer le tirage #${d.id} ?`)) {
                            deleteDrawMutation.mutate(d.id);
                          }
                        }}
                        className="btn btn-danger btn-sm"
                        aria-label={`Supprimer le tirage #${d.id}`}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
