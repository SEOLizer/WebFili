import { toPng } from 'html-to-image';
import { useTopologyStore } from '../stores/topologyStore';

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportJSON(projectName: string) {
  const { nodes, edges } = useTopologyStore.getState();
  const data = JSON.stringify({ version: 1, name: projectName, nodes, edges }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  download(blob, `${projectName.replace(/\s+/g, '_')}.json`);
}

export async function exportPNG(projectName: string) {
  const canvas = document.querySelector('.react-flow') as HTMLElement | null;
  if (!canvas) return;
  try {
    const dataUrl = await toPng(canvas, { backgroundColor: '#030712', pixelRatio: 2 });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    download(blob, `${projectName.replace(/\s+/g, '_')}.png`);
  } catch (e) {
    console.error('PNG-Export fehlgeschlagen:', e);
  }
}

export function importJSON(file: File) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target?.result as string);
      if (!data.nodes || !data.edges) throw new Error('Ungültiges Format');
      const store = useTopologyStore.getState();
      store.newProject();
      // Directly set nodes/edges via store setters (use internal Zustand setter)
      useTopologyStore.setState({
        nodes: data.nodes,
        edges: data.edges,
        projectName: data.name ?? 'Importiertes Projekt',
        cloudProjectId: null,
        isDirty: true,
      });
      store.saveToLocalStorage();
    } catch {
      alert('Fehler: Ungültige JSON-Datei');
    }
  };
  reader.readAsText(file);
}
