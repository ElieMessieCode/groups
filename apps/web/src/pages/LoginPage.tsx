import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { ApiError } from '../api/client.js';

export function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const { login, register, isLoggingIn, isRegistering } = useAuth();
  const navigate = useNavigate();

  const loading = isLoggingIn || isRegistering;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    try {
      if (isRegister) {
        await register({ email, password });
      } else {
        await login({ email, password });
      }
      navigate('/classes');
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.detail);
      } else {
        setFormError('Une erreur inattendue est survenue');
      }
    }
  };

  return (
    <div className="container" style={{ maxWidth: '420px', marginTop: '4rem' }}>
      <div className="card" style={{ padding: '2rem' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '-0.02em' }}>
          {isRegister ? 'Créer un compte' : 'Connexion'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          {isRegister
            ? 'Inscrivez-vous pour gérer vos classes et tirages'
            : 'Accédez à votre espace de tirage déterministe'}
        </p>

        {formError && (
          <div className="error-banner" role="alert">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              htmlFor="email"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}
            >
              Adresse email
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              className="input-field"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="enseignant@ecole.fr"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.35rem' }}
            >
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              className="input-field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.65rem' }}
          >
            {loading
              ? 'Traitement en cours...'
              : isRegister
              ? "S'inscrire"
              : 'Se connecter'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem' }}>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setFormError(null);
            }}
            style={{ background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--text-secondary)' }}
          >
            {isRegister
              ? 'Déjà un compte ? Se connecter'
              : 'Pas encore de compte ? S\'inscrire'}
          </button>
        </div>
      </div>
    </div>
  );
}
