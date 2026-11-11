import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './store/auth';
import { Spinner, Toasts } from './components/ui';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import ForgotPasswordPage from './pages/ForgotPassword';
import ResetPasswordPage from './pages/ResetPassword';
import AppShell from './pages/AppShell';

export default function App() {
  const status = useAuth((s) => s.status);
  const bootstrap = useAuth((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap().catch(() => useAuth.setState({ status: 'anonymous' }));
  }, [bootstrap]);

  if (status === 'loading') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <img src="/favicon.svg" alt="" className="h-14 w-14" />
        <Spinner className="h-6 w-6 text-brand-600" />
      </div>
    );
  }

  return (
    <>
      <Routes>
        {status === 'anonymous' ? (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route path="/login" element={<Navigate to="/" replace />} />
            <Route path="/register" element={<Navigate to="/" replace />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/*" element={<AppShell />} />
          </>
        )}
      </Routes>
      <Toasts />
    </>
  );
}
