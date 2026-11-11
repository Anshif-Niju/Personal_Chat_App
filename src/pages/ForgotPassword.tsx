import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import AuthLayout, { Field, FormError } from './AuthLayout';
import { api, errorMessage } from '../lib/api';
import { Spinner } from '../components/ui';

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { identifier: identifier.trim() });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset your password" subtitle="We'll email a reset link to the recovery address on your account.">
      {sent ? (
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto h-12 w-12 text-brand-600" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            If an account with a recovery email exists, a reset link is on its way. It expires in 1 hour.
          </p>
          <p className="text-xs text-slate-500">Accounts created without an email can't be recovered by email.</p>
          <Link to="/login" className="btn-ghost w-full">
            Back to login
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <Field label="Username or email">
            <input className="input" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required autoFocus />
          </Field>
          <button className="btn-primary w-full" disabled={loading}>
            {loading && <Spinner className="h-4 w-4" />} Send reset link
          </button>
          <Link to="/login" className="block text-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
            Back to login
          </Link>
        </form>
      )}
    </AuthLayout>
  );
}
