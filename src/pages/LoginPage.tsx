import { useState, type FormEvent } from 'react';
import { Ambulance, Building2, Radio } from 'lucide-react';
import { User, UserRole } from '../types/medilink';
import { AppLogo } from '../components/AppLogo';

interface LoginPageProps {
  onLogin: (user: User) => void;
}

const DEMO_ACCOUNTS: Array<{
  role: UserRole;
  title: string;
  email: string;
  icon: typeof Radio;
}> = [
  {
    role: 'CONTROL_ROOM',
    title: 'Control Room Operator',
    email: 'control@medigrid.org',
    icon: Radio,
  },
  {
    role: 'HOSPITAL_STAFF',
    title: 'Hospital Staff',
    email: 'staff@apollohyd.medigrid.org',
    icon: Building2,
  },
  {
    role: 'AMBULANCE_DISPATCHER',
    title: 'Ambulance Dispatcher',
    email: 'dispatch04@medigrid.org',
    icon: Ambulance,
  },
];

export function LoginPage({ onLogin }: LoginPageProps) {
  const [selectedRole, setSelectedRole] = useState<UserRole>('CONTROL_ROOM');
  const [email, setEmail] = useState('control@medigrid.org');
  const [password, setPassword] = useState('demo123');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSelectPreset = (acc: (typeof DEMO_ACCOUNTS)[number]) => {
    setSelectedRole(acc.role);
    setEmail(acc.email);
    setPassword('demo123');
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role: selectedRole }),
      });
      const data = (await res.json()) as { user?: User; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || 'Authentication failed.');
        return;
      }
      onLogin(data.user);
    } catch {
      setError('Unable to reach MediGrid authentication service.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F3E9] text-[#302B2B] flex flex-col justify-center py-10 px-5">
      <div className="max-w-lg w-full mx-auto bg-[#FFFEFA] border border-[#E7DED2] rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-[#E7DED2]">
          <AppLogo size="lg" />
          <div>
            <div className="text-xl font-bold tracking-tight text-[#702C3B]">MediGrid</div>
            <div className="text-xs text-[#77716D]">City Emergency Bed &amp; Patient Transfer Network</div>
          </div>
        </div>

        <h1 className="text-xl font-bold text-[#302B2B]">Sign in to MediGrid</h1>

        <div className="mt-5 space-y-2.5">
          {DEMO_ACCOUNTS.map((acc) => {
            const Icon = acc.icon;
            const active = selectedRole === acc.role;
            return (
              <button
                key={acc.role}
                type="button"
                onClick={() => handleSelectPreset(acc)}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors flex items-center gap-3 ${
                  active
                    ? 'bg-[#F1E4E5] border-[#702C3B]'
                    : 'bg-[#FFFDF8] border-[#E7DED2] hover:bg-[#F8F3E9]'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    active ? 'bg-[#702C3B] text-[#FFFDF8]' : 'bg-[#F3ECE0] text-[#702C3B]'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </div>
                <div className="text-sm font-semibold text-[#302B2B]">{acc.title}</div>
              </button>
            );
          })}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="block text-xs font-medium text-[#302B2B] mb-1.5">
              Operator Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-sm text-[#302B2B] focus:outline-none focus:border-[#702C3B] focus:ring-1 focus:ring-[#702C3B]"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-[#302B2B] mb-1.5">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#FFFDF8] border border-[#E7DED2] text-sm text-[#302B2B] focus:outline-none focus:border-[#702C3B] focus:ring-1 focus:ring-[#702C3B]"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-[#F1E4E5] border border-[#DEC4C8] text-xs font-medium text-[#702C3B]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-[#702C3B] hover:bg-[#5B222F] text-[#FFFDF8] text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {submitting ? 'Signing in...' : 'Access MediGrid Console'}
          </button>
        </form>
      </div>
    </div>
  );
}
