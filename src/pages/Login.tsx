import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import AuthLayout, { Field, FormError } from './AuthLayout';
import { useAuth } from '../store/auth';
import { errorMessage } from '../lib/api';
import { Spinner } from '../components/ui';
import { unlockAudio } from '../lib/sounds';

export default function LoginPage() {
  const login = useAuth((s) => s.login);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    unlockAudio();
    setError(null);
    setLoading(true);
    try {
      await login(identifier.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="">
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <Field label="Username or email">
          <input className="input" autoComplete="username" autoFocus value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="@username" required />
        </Field>
        <Field label="Password">
          <div className="relative">
            <input
              className="input pr-11"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-0 px-3 text-slate-400" aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Forgot password?
          </Link>
        </div>
        <button className="btn-primary w-full" disabled={loading}>
          {loading && <Spinner className="h-4 w-4" />} Log in
        </button>
        <p className="text-center text-sm text-slate-500">
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
