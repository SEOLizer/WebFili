import { useRef, useState } from 'react';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { useAuthStore } from '../../stores/authStore';
import { useThemeStore } from '../../stores/themeStore';
import { startSimulation, stopSimulation } from '../../simulation/loop';
import { exportJSON, exportPNG, importJSON } from '../../lib/export';
import AuthDialog from '../auth/AuthDialog';
import ProjectListDialog from '../auth/ProjectListDialog';

const THEME_ICONS = { dark: '🌙', light: '☀️', system: '💻' } as const;

export default function Toolbar() {
  const { mode, setMode, clearLog } = useSimulationUiStore();
  const { undo, redo, saveToCloud, isDirty, projectName, setProjectName, newProject } = useTopologyStore();
  const { user, logout } = useAuthStore();
  const { pref, setPref } = useThemeStore();
  const [authOpen, setAuthOpen] = useState(false);
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [exporting, setExporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const toggleMode = () => {
    if (mode === 'construct') { setMode('simulate'); startSimulation(); }
    else { stopSimulation(); setMode('construct'); clearLog(); }
  };

  const handleSave = async () => {
    if (!user) { setAuthOpen(true); return; }
    setSaving(true);
    try { await saveToCloud(); }
    catch (e) { console.error('Speichern fehlgeschlagen:', e); }
    finally { setSaving(false); }
  };

  const handleOpenProjects = () => {
    if (!user) { setAuthOpen(true); return; }
    setProjectListOpen(true);
  };

  const startEditName = () => { setNameInput(projectName); setEditingName(true); };
  const commitName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) setProjectName(trimmed);
    setEditingName(false);
  };

  const handleExportJSON = () => exportJSON(projectName);
  const handleExportPNG = async () => {
    setExporting(true);
    await exportPNG(projectName);
    setExporting(false);
  };
  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importJSON(file);
    e.target.value = '';
  };

  const cycleTheme = () => {
    const next: Record<string, typeof pref> = { dark: 'light', light: 'system', system: 'dark' };
    setPref(next[pref]);
  };

  const headerClass = 'h-10 border-b flex items-center px-3 gap-3 shrink-0 ' +
    'bg-gray-900 border-gray-700 dark:bg-gray-900 dark:border-gray-700 ' +
    'light:bg-white light:border-gray-200';

  return (
    <>
      <header className="h-10 bg-gray-900 dark:bg-gray-900 border-b border-gray-700 dark:border-gray-700 flex items-center px-3 gap-3 shrink-0" aria-label="Hauptnavigation">
        <span className="text-white dark:text-white font-semibold text-sm tracking-tight">WebFilius</span>
        <div className="h-4 w-px bg-gray-700" />

        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-0.5 text-sm outline-none focus:border-blue-400 w-40"
            aria-label="Projektname"
          />
        ) : (
          <button
            onClick={startEditName}
            title="Projektname bearbeiten"
            aria-label={`Projektname: ${projectName}. Klicken zum Bearbeiten`}
            className="text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded px-2 py-0.5 transition-colors max-w-48 truncate"
          >
            {projectName}
          </button>
        )}

        {mode === 'construct' && (
          <div className="flex items-center gap-1" role="group" aria-label="Bearbeiten">
            <button onClick={undo} title="Rückgängig (Strg+Z)" aria-label="Rückgängig" className="px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors">↩</button>
            <button onClick={redo} title="Wiederholen (Strg+Y)" aria-label="Wiederholen" className="px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors">↪</button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {mode === 'construct' && (
            <>
              <button onClick={() => newProject()} title="Neues Projekt" aria-label="Neues Projekt" className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 transition-colors">+ Neu</button>
              <button onClick={handleOpenProjects} title="Projekt öffnen" aria-label="Projekt öffnen" className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 transition-colors">Öffnen</button>
              <button
                onClick={handleSave}
                disabled={saving}
                title={user ? 'In Cloud speichern (Strg+S)' : 'Anmelden zum Speichern'}
                aria-label={isDirty ? 'Ungespeicherte Änderungen – Speichern' : 'Alles gespeichert'}
                className={`px-2 py-1 rounded text-xs transition-colors ${isDirty ? 'text-amber-300 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-700'} disabled:opacity-50`}
              >
                {saving ? 'Speichert…' : isDirty ? 'Speichern*' : 'Gespeichert'}
              </button>

              {/* Export / Import */}
              <div className="h-4 w-px bg-gray-700" />
              <button onClick={handleExportJSON} title="Als JSON exportieren" aria-label="Topologie als JSON exportieren" className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 transition-colors">↓ JSON</button>
              <button onClick={handleExportPNG} disabled={exporting} title="Als PNG exportieren" aria-label="Canvas als PNG exportieren" className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 transition-colors disabled:opacity-50">
                {exporting ? '…' : '↓ PNG'}
              </button>
              <button onClick={() => importRef.current?.click()} title="JSON importieren" aria-label="Topologie aus JSON importieren" className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 transition-colors">↑ Import</button>
              <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} aria-hidden="true" />
            </>
          )}

          <button
            onClick={toggleMode}
            aria-label={mode === 'construct' ? 'Simulation starten' : 'Simulation stoppen'}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${mode === 'construct' ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-700 hover:bg-red-600 text-white'}`}
          >
            {mode === 'construct' ? '▶ Simulation starten' : '⏹ Stoppen'}
          </button>

          <div className="h-4 w-px bg-gray-700" />

          {/* Theme toggle */}
          <button
            onClick={cycleTheme}
            title={`Farbschema: ${pref === 'dark' ? 'Dunkel' : pref === 'light' ? 'Hell' : 'System'}. Klicken zum Wechseln`}
            aria-label={`Farbschema wechseln (aktuell: ${pref})`}
            className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 transition-colors"
          >
            {THEME_ICONS[pref]}
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-300" aria-label={`Eingeloggt als ${user.username}`}>{user.username}</span>
              <button onClick={() => logout()} aria-label="Abmelden" className="text-xs text-gray-500 hover:text-red-400 transition-colors">Abmelden</button>
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              aria-label="Anmelden oder registrieren"
              className="px-2 py-1 rounded text-xs text-gray-300 hover:bg-gray-700 border border-gray-600 transition-colors"
            >
              Anmelden
            </button>
          )}
        </div>
      </header>

      <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} />
      <ProjectListDialog open={projectListOpen} onClose={() => setProjectListOpen(false)} />
    </>
  );
}
