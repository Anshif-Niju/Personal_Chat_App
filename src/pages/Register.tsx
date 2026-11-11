import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AuthLayout, { Field, FormError } from './AuthLayout';
import { useAuth } from '../store/auth';
import { errorMessage } from '../lib/api';
import { Spinner } from '../components/ui';
import { unlockAudio } from '../lib/sounds';

const USERNAME = /^[a-z0-9_.]{3,30}$/;

export default function RegisterPage() {
  const register = useAuth((s) => s.register);
  const [form, setForm] = useState({ username: '', displayName: '', email: '', password: '', confirmPassword: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === 'username' ? e.target.value.toLowerCase().replace(/^@/, '') : e.target.value }));
  const touch = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!USERNAME.test(form.username)) e.username = '3–30 characters: a–z, 0–9, "_" or "."';
    if (!form.displayName.trim()) e.displayName = 'Display name is required';
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Invalid email';
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'At least 8 characters with a letter and a number';
    if (form.confirmPassword !== form.password) e.confirmPassword = 'Passwords do not match';
    return e;
  }, [form]);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    unlockAudio();
    setTouched({ username: true, displayName: true, email: true, password: true, confirmPassword: true });
    if (Object.keys(errors).length) return;
    setError(null);
    setLoading(true);
    try {
      await register({ ...form, email: form.email.trim() || undefined, displayName: form.displayName.trim() });
    } catch (err) {
      setError(errorMessage(err));
      setLoading(false);
    }
  };

  const err = (k: string) => (touched[k] ? errors[k] : undefined);

  return (
    <AuthLayout title="Create your account" subtitle="">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Username" error={err('username')} hint="People find you by this, e.g. @alex123">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-sm text-slate-400">@</span>
            <input className="input pl-8" autoComplete="username" value={form.username} onChange={set('username')} onBlur={touch('username')} maxLength={30} autoFocus />
          </div>
        </Field>
        <Field label="Display name" error={err('displayName')}>
          <input className="input" autoComplete="name" value={form.displayName} onChange={set('displayName')} onBlur={touch('displayName')} maxLength={50} />
        </Field>
        <Field label="Email (optional)" error={err('email')} hint="Only used to reset your password. Never shown to others.">
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} onBlur={touch('email')} />
        </Field>
        <Field label="Password" error={err('password')}>
          <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} onBlur={touch('password')} />
        </Field>
        <Field label="Confirm password" error={err('confirmPassword')}>
          <input className="input" type="password" autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} onBlur={touch('confirmPassword')} />
        </Field>
        <button className="btn-primary w-full" disabled={loading}>
          {loading && <Spinner className="h-4 w-4" />} Create account
        </button>
        <p className="text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
            Log in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
