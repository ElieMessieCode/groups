import { Routes, Route, Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './hooks/useAuth.js';
import { Layout } from './components/Layout.js';
import { LoginPage } from './pages/LoginPage.js';
import { ClassesPage } from './pages/ClassesPage.js';
import { ClassDetailPage } from './pages/ClassDetailPage.js';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Vérification de la session...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/classes"
          element={
            <ProtectedRoute>
              <ClassesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/classes/:id"
          element={
            <ProtectedRoute>
              <ClassDetailPage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/classes" replace />} />
        <Route path="*" element={<Navigate to="/classes" replace />} />
      </Routes>
    </Layout>
  );
}
