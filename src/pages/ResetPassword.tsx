import { FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout, { Field, FormError } from './AuthLayout';
import { api, errorMessage } from '../lib/api';
import { Spinner } from '../components/ui';
import { useAuth } from '../store/auth';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return setError('Passwords do not match');
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password, confirmPassword });
      setDone(true);
      // All sessions were revoked server-side.
      useAuth.getState().clear();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll be signed out on all devices.">
      {done ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
          <p className="text-sm">Your password was changed.</p>
          <Link to="/login" className="btn-primary w-full">
            Log in
          </Link>
        </div>
      ) : !token ? (
        <FormError message="This reset link is missing its token. Request a new one." />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <Field label="New password" hint="At least 8 characters with a letter and a number">
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required autoFocus />
          </Field>
          <Field label="Confirm new password">
            <input className="input" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} required />
          </Field>
          <button className="btn-primary w-full" disabled={loading}>
            {loading && <Spinner className="h-4 w-4" />} Update password
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
