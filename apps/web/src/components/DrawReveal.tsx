import { useState, useEffect, useCallback } from 'react';
import type { DrawResult } from '../types/index.js';
import { VerificationBadge } from './VerificationBadge.js';

interface DrawRevealProps {
  draw: DrawResult;
  onNewDraw?: () => void;
}

export function DrawReveal({ draw, onNewDraw }: DrawRevealProps) {
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [revealAll, setRevealAll] = useState<boolean>(false);
  const [copiedSeed, setCopiedSeed] = useState<boolean>(false);
  const [copiedRoster, setCopiedRoster] = useState<boolean>(false);

  const totalGroups = draw.groups.length;

  const nextStep = useCallback(() => {
    setCurrentStep((prev) => Math.min(prev + 1, totalGroups));
  }, [totalGroups]);

  const prevStep = useCallback(() => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const resetReveal = useCallback(() => {
    setCurrentStep(0);
    setRevealAll(false);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevStep();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        setRevealAll((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextStep, prevStep]);

  const handleCopySeed = async () => {
    await navigator.clipboard.writeText(String(draw.seed));
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const handleCopyRoster = async () => {
    const text = draw.groups
      .map(
        (g) =>
          `=== ${g.name} ===\n` +
          g.members.map((m) => `- ${m.fullName}${m.tag ? ` (${m.tag})` : ''}`).join('\n')
      )
      .join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopiedRoster(true);
    setTimeout(() => setCopiedRoster(false), 2000);
  };

  const visibleGroups = revealAll ? draw.groups : draw.groups.slice(0, currentStep);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header Info */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Graine aléatoire :
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
            <span className="mono" style={{ fontWeight: 600, fontSize: '1.05rem' }}>
              {draw.seed}
            </span>
            <button
              type="button"
              onClick={handleCopySeed}
              className="btn btn-secondary btn-sm no-print"
              aria-label="Copier la graine"
            >
              {copiedSeed ? 'Copié !' : 'Copier'}
            </button>
          </div>
        </div>

        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <VerificationBadge drawId={draw.id} seed={draw.seed} />
          <button
            type="button"
            onClick={handleCopyRoster}
            className="btn btn-secondary btn-sm"
          >
            {copiedRoster ? 'Groupes copiés !' : 'Copier le tirage'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn btn-secondary btn-sm"
          >
            Imprimer
          </button>
          {onNewDraw && (
            <button
              type="button"
              onClick={onNewDraw}
              className="btn btn-primary btn-sm"
            >
              Nouveau tirage
            </button>
          )}
        </div>
      </div>

      {/* Sequencer Bar */}
      <div
        className="card no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          background: 'var(--bg-subtle)'
        }}
        aria-label="Contrôles de révélation"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 600 }}>Révélation :</span>
          <span>
            {revealAll
              ? `${totalGroups} / ${totalGroups} (Tous)`
              : `${currentStep} / ${totalGroups} groupes`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={prevStep}
            disabled={revealAll || currentStep === 0}
            className="btn btn-secondary btn-sm"
          >
            ← Précédent
          </button>
          <button
            type="button"
            onClick={nextStep}
            disabled={revealAll || currentStep >= totalGroups}
            className="btn btn-primary btn-sm"
          >
            Suivant →
          </button>
          <button
            type="button"
            onClick={() => setRevealAll((prev) => !prev)}
            className="btn btn-secondary btn-sm"
          >
            {revealAll ? 'Mode pas à pas' : 'Tout révéler'}
          </button>
          <button
            type="button"
            onClick={resetReveal}
            disabled={currentStep === 0 && !revealAll}
            className="btn btn-secondary btn-sm"
          >
            Recommencer
          </button>
        </div>
      </div>

      {/* Group List Screen Reader Announcer */}
      <div className="sr-only" aria-live="polite">
        {revealAll
          ? `Tous les ${totalGroups} groupes sont affichés.`
          : currentStep === 0
          ? 'Aucun groupe révélé pour l\'instant.'
          : `Groupe ${currentStep} sur ${totalGroups} révélé : ${
              draw.groups[currentStep - 1]?.name
            }.`}
      </div>

      {/* Group Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
          gap: '1rem'
        }}
      >
        {visibleGroups.map((group) => (
          <div
            key={group.position}
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              borderColor: 'var(--border-dark)'
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                borderBottom: '1px solid var(--border-light)',
                paddingBottom: '0.5rem',
                marginBottom: '0.75rem'
              }}
            >
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>{group.name}</h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {group.members.length} {group.members.length > 1 ? 'étudiants' : 'étudiant'}
              </span>
            </div>

            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {group.members.map((member) => (
                <li
                  key={member.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.95rem'
                  }}
                >
                  <span>{member.fullName}</span>
                  {member.tag && <span className="badge">{member.tag}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {visibleGroups.length === 0 && (
        <div
          className="card"
          style={{
            textAlign: 'center',
            padding: '3rem 1rem',
            color: 'var(--text-secondary)'
          }}
        >
          <p>Appuyez sur <strong>« Suivant »</strong> ou sur la <strong>barre d'espace</strong> pour révéler le premier groupe.</p>
        </div>
      )}
    </div>
  );
}
