import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { api } from '../../lib/api';
import { useTopologyStore } from '../../stores/topologyStore';

interface ProjectMeta {
  id: number;
  name: string;
  updatedAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function ProjectListDialog({ open, onClose }: Props) {
  const loadProjectFromCloud = useTopologyStore((s) => s.loadProjectFromCloud);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [opening, setOpening] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    api.get<ProjectMeta[]>('/api/projects')
      .then(setProjects)
      .catch(() => setError('Projekte konnten nicht geladen werden'))
      .finally(() => setLoading(false));
  }, [open]);

  const handleOpen = async (id: number) => {
    setOpening(id);
    try {
      await loadProjectFromCloud(id);
      onClose();
    } catch {
      setError('Projekt konnte nicht geöffnet werden');
    } finally {
      setOpening(null);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-50 w-full max-w-md p-6">
          <Dialog.Title className="text-lg font-semibold text-white mb-4">Gespeicherte Projekte</Dialog.Title>

          {loading && <p className="text-gray-400 text-sm text-center py-4">Laden…</p>}

          {error && (
            <p className="text-red-400 text-xs bg-red-900/20 border border-red-700/30 rounded p-2 mb-3">{error}</p>
          )}

          {!loading && projects.length === 0 && !error && (
            <p className="text-gray-500 text-sm text-center py-4">Noch keine gespeicherten Projekte</p>
          )}

          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => handleOpen(p.id)}
                  disabled={opening === p.id}
                  className="w-full text-left px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 disabled:opacity-50 transition-colors group"
                >
                  <div className="text-sm text-white group-hover:text-blue-300 transition-colors">{p.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">Zuletzt gespeichert: {formatDate(p.updatedAt)}</div>
                </button>
              </li>
            ))}
          </ul>

          <button
            onClick={onClose}
            className="mt-4 w-full text-gray-500 hover:text-gray-300 text-xs py-1"
          >
            Abbrechen
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
