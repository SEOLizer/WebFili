import { useState } from 'react';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { useAuthStore } from '../../stores/authStore';
import { startSimulation, stopSimulation } from '../../simulation/loop';
import AuthDialog from '../auth/AuthDialog';
import ProjectListDialog from '../auth/ProjectListDialog';

export default function Toolbar() {
  const { mode, setMode, clearLog } = useSimulationUiStore();
  const { undo, redo, saveToCloud, isDirty, projectName, setProjectName, newProject } = useTopologyStore();
  const { user, logout } = useAuthStore();
  const [authOpen, setAuthOpen] = useState(false);
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

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

  const startEditName = () => {
    setNameInput(projectName);
    setEditingName(true);
  };

  const commitName = () => {
    const trimmed = nameInput.trim();
    if (trimmed) setProjectName(trimmed);
    setEditingName(false);
  };

  return (
    <>
      <header className="h-10 bg-gray-900 border-b border-gray-700 flex items-center px-3 gap-3 shrink-0">
        <span className="text-white font-semibold text-sm tracking-tight">WebFilius</span>
        <div className="h-4 w-px bg-gray-700" />

        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setEditingName(false); }}
            className="bg-gray-800 text-white border border-gray-600 rounded px-2 py-0.5 text-sm outline-none focus:border-blue-400 w-40"
          />
        ) : (
          <button
            onClick={startEditName}
            title="Projektname bearbeiten"
            className="text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded px-2 py-0.5 transition-colors max-w-48 truncate"
          >
            {projectName}
          </button>
        )}

        {mode === 'construct' && (
          <div className="flex items-center gap-1">
            <button onClick={undo} title="Strg+Z" className="px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors">↩</button>
            <button onClick={redo} title="Strg+Y" className="px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 rounded transition-colors">↪</button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {mode === 'construct' && (
            <>
              <button
                onClick={() => newProject()}
                title="Neues Projekt"
                className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 transition-colors"
              >
                + Neu
              </button>
              <button
                onClick={handleOpenProjects}
                title="Gespeicherte Projekte öffnen"
                className="px-2 py-1 rounded text-xs text-gray-400 hover:bg-gray-700 transition-colors"
              >
                Öffnen
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                title={user ? 'In Cloud speichern' : 'Anmelden zum Speichern'}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  isDirty ? 'text-amber-300 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-700'
                } disabled:opacity-50`}
              >
                {saving ? 'Speichert…' : isDirty ? 'Speichern*' : 'Gespeichert'}
              </button>
            </>
          )}

          <button
            onClick={toggleMode}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              mode === 'construct' ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-700 hover:bg-red-600 text-white'
            }`}
          >
            {mode === 'construct' ? '▶ Simulation starten' : '⏹ Stoppen'}
          </button>

          <div className="h-4 w-px bg-gray-700" />

          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-300">{user.username}</span>
              <button onClick={() => logout()} className="text-xs text-gray-500 hover:text-red-400 transition-colors">Abmelden</button>
            </div>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
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
