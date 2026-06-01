import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';

interface VirtualLink {
  linkToken: string;
  roomName: string;
  maxUsers: number;
  expiresAt: string | null;
  createdAt: string;
}

export default function TeacherDashboard() {
  const user = useAuthStore((s) => s.user);
  const [links, setLinks] = useState<VirtualLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expiresIn, setExpiresIn] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const loadLinks = async () => {
    setLoading(true);
    try {
      const data = await api.get<VirtualLink[]>('/api/links');
      setLinks(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (user?.role === 'teacher' || user?.role === 'admin') loadLinks();
  }, [user]);

  const createLink = async () => {
    setCreating(true);
    try {
      const body: Record<string, number> = {};
      const h = parseInt(expiresIn);
      if (!isNaN(h) && h > 0) body.expiresInHours = h;
      await api.post('/api/links', body);
      await loadLinks();
      setExpiresIn('');
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  const deleteLink = async (token: string) => {
    try {
      await api.del(`/api/links/${token}`);
      setLinks((prev) => prev.filter((l) => l.linkToken !== token));
    } catch { /* ignore */ }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  };

  const formatDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';

  if (user?.role !== 'teacher' && user?.role !== 'admin') {
    return (
      <div className="p-3 text-xs text-gray-500 text-center">
        Nur für Lehrkräfte verfügbar
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 text-xs overflow-y-auto h-full">
      <h3 className="text-sm font-semibold text-white">Lehrer-Dashboard</h3>

      {/* Neuen Link erstellen */}
      <div className="bg-gray-800 rounded-lg p-2 space-y-2">
        <p className="text-gray-400 font-medium">Neuer WAN-Link</p>
        <div className="flex gap-2 items-center">
          <input
            type="number"
            min="1"
            max="72"
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value)}
            placeholder="Gültig (Std.)"
            className="w-28 bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 outline-none focus:border-blue-400 text-xs"
          />
          <button
            onClick={createLink}
            disabled={creating}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded text-xs"
          >
            {creating ? 'Erstelle…' : '+ Erstellen'}
          </button>
        </div>
      </div>

      {/* Link-Liste */}
      {loading ? (
        <p className="text-gray-500 text-center py-2">Laden…</p>
      ) : links.length === 0 ? (
        <p className="text-gray-500 text-center py-4">Keine aktiven Links</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <li key={link.linkToken} className="bg-gray-800 rounded-lg p-2 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <code className="text-cyan-400 font-mono text-[10px] truncate max-w-[140px]" title={link.linkToken}>
                  {link.linkToken}
                </code>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => copyToken(link.linkToken)}
                    className="text-gray-400 hover:text-white text-[10px] px-1.5 py-0.5 bg-gray-700 rounded"
                  >
                    {copiedToken === link.linkToken ? '✓' : 'Kopieren'}
                  </button>
                  <button
                    onClick={() => deleteLink(link.linkToken)}
                    className="text-red-400 hover:text-red-300 text-[10px] px-1.5 py-0.5 bg-gray-700 rounded"
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div className="text-gray-500 text-[10px] space-y-0.5">
                <div>Max. Nutzer: {link.maxUsers}</div>
                <div>Läuft ab: {formatDate(link.expiresAt)}</div>
                <div>Erstellt: {formatDate(link.createdAt)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
