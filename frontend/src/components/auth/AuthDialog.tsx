import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function AuthDialog({ open, onClose }: Props) {
  const { login, register, isLoading, error, clearError } = useAuthStore();

  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [localError, setLocalError] = useState('');

  const handleClose = () => { clearError(); setLocalError(''); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    try {
      if (tab === 'login') {
        await login(form.username, form.password);
      } else {
        if (!form.email) { setLocalError('E-Mail ist erforderlich'); return; }
        await register(form.username, form.email, form.password);
      }
      handleClose();
    } catch (err) {
      setLocalError((err as Error).message);
    }
  };

  const displayError = localError || error;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 w-full max-w-sm p-6">
          <Dialog.Title className="text-lg font-semibold text-white mb-4">
            Anmelden bei WebFilius
          </Dialog.Title>

          <Tabs.Root value={tab} onValueChange={v => { setTab(v as 'login' | 'register'); clearError(); setLocalError(''); }}>
            <Tabs.List className="flex border-b border-gray-700 mb-4">
              {(['login', 'register'] as const).map(t => (
                <Tabs.Trigger
                  key={t}
                  value={t}
                  className="flex-1 py-2 text-sm text-gray-400 data-[state=active]:text-white data-[state=active]:border-b-2 data-[state=active]:border-blue-400"
                >
                  {t === 'login' ? 'Anmelden' : 'Registrieren'}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Benutzername</label>
                <input
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required minLength={3}
                  className="w-full bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-400"
                  placeholder="schuler42"
                />
              </div>

              {tab === 'register' && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">E-Mail</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-400"
                    placeholder="schueler@schule.de"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 block mb-1">Passwort</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required minLength={8}
                  className="w-full bg-gray-800 text-white border border-gray-600 rounded px-3 py-2 text-sm outline-none focus:border-blue-400"
                  placeholder="••••••••"
                />
              </div>

              {displayError && (
                <p className="text-red-400 text-xs bg-red-900/20 border border-red-700/30 rounded p-2">
                  {displayError}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded py-2 text-sm font-medium transition-colors"
              >
                {isLoading ? 'Lädt...' : tab === 'login' ? 'Anmelden' : 'Konto erstellen'}
              </button>

              <button type="button" onClick={handleClose} className="w-full text-gray-500 hover:text-gray-300 text-xs py-1">
                Ohne Konto fortfahren
              </button>
            </form>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
