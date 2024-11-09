import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="no-print" style={{ borderBottom: '1px solid var(--border-light)', background: '#ffffff' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem' }}>
        <Link to="/classes" style={{ textDecoration: 'none', fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em' }}>
          GROUPES
        </Link>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{user.email}</span>
            <button type="button" onClick={handleLogout} className="btn btn-secondary btn-sm">
              Déconnexion
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
