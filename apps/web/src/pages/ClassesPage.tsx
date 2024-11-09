import { useState, type FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import type { ClassWithStudentCount } from '../types/index.js';

export function ClassesPage() {
  const [newClassName, setNewClassName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const { data: classes, isLoading, error } = useQuery<ClassWithStudentCount[]>({
    queryKey: ['classes'],
    queryFn: () => api.get<ClassWithStudentCount[]>('/api/classes')
  });

  const createClassMutation = useMutation({
    mutationFn: (name: string) => api.post('/api/classes', { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      setNewClassName('');
      setIsCreating(false);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError) {
        setFormError(err.detail);
      } else {
        setFormError('Erreur lors de la création de la classe');
      }
    }
  });

  const deleteClassMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/api/classes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['classes'] });
    }
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    setFormError(null);
    createClassMutation.mutate(newClassName.trim());
  };

  const handleDelete = (id: number, name: string) => {
    if (window.confirm(`Supprimer la classe « ${name} » et tout son historique ?`)) {
      deleteClassMutation.mutate(id);
    }
  };

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '-0.02em' }}>Mes classes</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Sélectionnez une classe pour gérer ses étudiants ou lancer un tirage.
          </p>
        </div>

        {!isCreating && (
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="btn btn-primary"
          >
            + Nouvelle classe
          </button>
        )}
      </div>

      {isCreating && (
        <div className="card" style={{ background: 'var(--bg-subtle)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.75rem' }}>Ajouter une classe</h2>
          {formError && <div className="error-banner">{formError}</div>}
          <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <input
              type="text"
              autoFocus
              required
              className="input-field"
              style={{ flex: 1, minWidth: '220px' }}
              value={newClassName}
              onChange={(e) => setNewClassName(e.target.value)}
              placeholder="Ex: Terminale S2, M1 Informatique..."
            />
            <button
              type="submit"
              disabled={createClassMutation.isPending}
              className="btn btn-primary"
            >
              {createClassMutation.isPending ? 'Création...' : 'Créer'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreating(false);
                setFormError(null);
              }}
              className="btn btn-secondary"
            >
              Annuler
            </button>
          </form>
        </div>
      )}

      {isLoading && (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
          Chargement de vos classes...
        </div>
      )}

      {error && (
        <div className="error-banner" role="alert">
          Impossible de charger vos classes.
        </div>
      )}

      {classes && classes.length === 0 && !isLoading && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Vous n'avez pas encore de classe configurée.
          </p>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="btn btn-primary"
          >
            Créer ma première classe
          </button>
        </div>
      )}

      {classes && classes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {classes.map((cls) => (
            <div
              key={cls.id}
              className="card"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                transition: 'border-color 0.15s ease'
              }}
            >
              <div style={{ flex: 1 }}>
                <Link
                  to={`/classes/${cls.id}`}
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    display: 'inline-block',
                    marginBottom: '0.2rem'
                  }}
                >
                  {cls.name}
                </Link>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {cls.studentCount} {cls.studentCount > 1 ? 'étudiants' : 'étudiant'}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Link to={`/classes/${cls.id}`} className="btn btn-secondary btn-sm">
                  Ouvrir
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(cls.id, cls.name)}
                  className="btn btn-danger btn-sm"
                  aria-label={`Supprimer ${cls.name}`}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
