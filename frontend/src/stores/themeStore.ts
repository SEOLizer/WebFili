import { create } from 'zustand';

type ThemePref = 'dark' | 'light' | 'system';

interface ThemeStore {
  pref: ThemePref;
  effective: 'dark' | 'light';
  setPref: (pref: ThemePref) => void;
}

function systemIsDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolve(pref: ThemePref): 'dark' | 'light' {
  if (pref === 'system') return systemIsDark() ? 'dark' : 'light';
  return pref;
}

function applyTheme(effective: 'dark' | 'light') {
  const root = document.documentElement;
  if (effective === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
  }
}

const saved = (localStorage.getItem('webfili-theme') as ThemePref | null) ?? 'system';
const initialEffective = resolve(saved);
applyTheme(initialEffective);

export const useThemeStore = create<ThemeStore>((set) => ({
  pref: saved,
  effective: initialEffective,

  setPref: (pref) => {
    const effective = resolve(pref);
    applyTheme(effective);
    localStorage.setItem('webfili-theme', pref);
    set({ pref, effective });
  },
}));

// React to OS-level changes when pref is 'system'
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const { pref, setPref } = useThemeStore.getState();
  if (pref === 'system') setPref('system');
});
