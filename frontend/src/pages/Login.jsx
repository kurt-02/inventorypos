import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../utils/api';
import { Alert, Spinner } from '../components/Ui';

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return <Spinner label="Checking your session…" />;

  // Already signed in - send them to the right home page for their role.
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/pos'} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const loggedIn = await login(form.username.trim(), form.password);
      navigate(loggedIn.role === 'admin' ? '/admin' : '/pos', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Unable to log in.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none" className="mx-auto" aria-hidden="true">
            <rect x="3" y="3" width="26" height="26" rx="6" className="fill-brand-500" />
            <path d="M9 12.5 16 9l7 3.5v7L16 23l-7-3.5v-7Z" fill="none" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M9 12.5 16 16l7-3.5M16 16v7" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          <h1 className="mt-4 font-mono text-xl font-bold uppercase tracking-widest text-ink-900">
            Inventory <span className="text-brand-600">POS</span>
          </h1>
          <p className="mt-1 text-sm text-ink-500">Sign in to start your shift</p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <Alert onDismiss={() => setError('')}>{error}</Alert>

          <div className="mb-4">
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              autoComplete="username"
              required
            />
          </div>

          <div className="mb-5">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="current-password"
              required
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <ul className="mt-6 space-y-1 text-center font-mono text-xs text-ink-500">
          <li>admin / Admin123!</li>
          <li>cashier1 / Cashier123!</li>
          <li>cashier2 / Cashier123!</li>
        </ul>
      </div>
    </div>
  );
}
