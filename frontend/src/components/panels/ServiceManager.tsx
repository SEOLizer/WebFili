import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html } from '@codemirror/lang-html';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import { useTopologyStore } from '../../stores/topologyStore';
import type { ServiceConfig } from '../../engine/service-config';

export default function ServiceManager() {
  const selectedDeviceId = useSimulationUiStore(s => s.selectedDeviceId);
  const mode = useSimulationUiStore(s => s.mode);
  const { nodes, updateServices } = useTopologyStore();

  const node = nodes.find(n => n.id === selectedDeviceId);
  if (!node) return <p className="text-xs text-gray-500 text-center mt-8 px-3">Kein Gerät ausgewählt.</p>;
  if (node.data.deviceType !== 'server' && node.data.deviceType !== 'pc') {
    return <p className="text-xs text-gray-500 text-center mt-8 px-3">Dienste nur für Server und PCs verfügbar.</p>;
  }

  const services: ServiceConfig = node.data.services ?? {};
  const save = (updated: ServiceConfig) => updateServices(node.id, updated);
  const disabled = mode === 'simulate';

  return (
    <div className="p-3 space-y-4 text-xs overflow-y-auto">
      <h3 className="font-semibold text-gray-200">{node.data.label} – Dienste</h3>
      {disabled && <p className="text-amber-500 text-[10px]">Dienste im Simulationsmodus nicht änderbar.</p>}

      <DhcpServicePanel services={services} onSave={save} disabled={disabled} />
      <DnsServicePanel services={services} onSave={save} disabled={disabled} />
      <HttpServicePanel services={services} onSave={save} disabled={disabled} />
    </div>
  );
}

function SectionHeader({ title, enabled, onToggle, disabled }: {
  title: string; enabled: boolean; onToggle: () => void; disabled: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-gray-700 pb-1 mb-2">
      <span className="font-medium text-gray-300">{title}</span>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`text-[10px] px-2 py-0.5 rounded ${enabled ? 'bg-green-700 text-green-100' : 'bg-gray-700 text-gray-400'} disabled:opacity-50`}
      >
        {enabled ? 'Aktiv' : 'Inaktiv'}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, disabled, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; disabled: boolean; placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-500 w-24 shrink-0 text-[10px]">{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
        className="flex-1 bg-gray-800 text-gray-200 border border-gray-600 rounded px-1.5 py-0.5 font-mono text-[10px] outline-none focus:border-blue-400 disabled:opacity-50" />
    </div>
  );
}

function DhcpServicePanel({ services, onSave, disabled }: { services: ServiceConfig; onSave: (s: ServiceConfig) => void; disabled: boolean }) {
  const cfg = services.dhcp ?? { enabled: false, rangeStart: '192.168.1.100', rangeEnd: '192.168.1.200', subnet: '255.255.255.0', gateway: '', leaseTime: 86400 };
  const [draft, setDraft] = useState(cfg);
  const update = (patch: Partial<typeof draft>) => { const next = { ...draft, ...patch }; setDraft(next); onSave({ ...services, dhcp: next }); };

  return (
    <div>
      <SectionHeader title="DHCP-Server" enabled={draft.enabled} onToggle={() => update({ enabled: !draft.enabled })} disabled={disabled} />
      {draft.enabled && (
        <div className="space-y-1.5">
          <Field label="Pool Start" value={draft.rangeStart} onChange={v => update({ rangeStart: v })} disabled={disabled} placeholder="192.168.1.100" />
          <Field label="Pool Ende" value={draft.rangeEnd} onChange={v => update({ rangeEnd: v })} disabled={disabled} placeholder="192.168.1.200" />
          <Field label="Subnetzmaske" value={draft.subnet} onChange={v => update({ subnet: v })} disabled={disabled} placeholder="255.255.255.0" />
          <Field label="Gateway" value={draft.gateway} onChange={v => update({ gateway: v })} disabled={disabled} placeholder="192.168.1.254" />
          <Field label="DNS-Server" value={draft.dnsServer ?? ''} onChange={v => update({ dnsServer: v })} disabled={disabled} placeholder="optional" />
          <Field label="Lease-Zeit (s)" value={String(draft.leaseTime ?? 86400)} onChange={v => update({ leaseTime: parseInt(v) || 86400 })} disabled={disabled} />
        </div>
      )}
    </div>
  );
}

function DnsServicePanel({ services, onSave, disabled }: { services: ServiceConfig; onSave: (s: ServiceConfig) => void; disabled: boolean }) {
  const cfg = services.dns ?? { enabled: false, records: [] };
  const [draft, setDraft] = useState(cfg);
  const [newHost, setNewHost] = useState('');
  const [newIp, setNewIp] = useState('');

  const update = (patch: Partial<typeof draft>) => { const next = { ...draft, ...patch }; setDraft(next); onSave({ ...services, dns: next }); };

  const addRecord = () => {
    if (!newHost || !newIp) return;
    update({ records: [...draft.records, { hostname: newHost, ip: newIp }] });
    setNewHost(''); setNewIp('');
  };

  const removeRecord = (i: number) => update({ records: draft.records.filter((_, idx) => idx !== i) });

  return (
    <div>
      <SectionHeader title="DNS-Server" enabled={draft.enabled} onToggle={() => update({ enabled: !draft.enabled })} disabled={disabled} />
      {draft.enabled && (
        <div className="space-y-1.5">
          <p className="text-gray-500 text-[10px]">A-Records:</p>
          {draft.records.map((r, i) => (
            <div key={i} className="flex gap-1 items-center font-mono text-[10px]">
              <span className="text-gray-300 flex-1">{r.hostname}</span>
              <span className="text-gray-500">→</span>
              <span className="text-gray-300 w-28">{r.ip}</span>
              {!disabled && <button onClick={() => removeRecord(i)} className="text-red-400 hover:text-red-300">✕</button>}
            </div>
          ))}
          {!disabled && (
            <div className="flex gap-1">
              <input value={newHost} onChange={e => setNewHost(e.target.value)} placeholder="hostname"
                className="flex-1 bg-gray-800 text-gray-200 border border-gray-600 rounded px-1.5 py-0.5 font-mono text-[10px] outline-none focus:border-blue-400" />
              <input value={newIp} onChange={e => setNewIp(e.target.value)} placeholder="IP"
                className="w-28 bg-gray-800 text-gray-200 border border-gray-600 rounded px-1.5 py-0.5 font-mono text-[10px] outline-none focus:border-blue-400" />
              <button onClick={addRecord} className="bg-blue-600 hover:bg-blue-500 text-white rounded px-2 text-[10px]">+</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HttpServicePanel({ services, onSave, disabled }: { services: ServiceConfig; onSave: (s: ServiceConfig) => void; disabled: boolean }) {
  const cfg = services.http ?? { enabled: false, html: '<h1>Willkommen bei WebFilius!</h1>\n<p>Dieser Server wird von WebFilius simuliert.</p>' };
  const [draft, setDraft] = useState(cfg);

  const update = (patch: Partial<typeof draft>) => { const next = { ...draft, ...patch }; setDraft(next); onSave({ ...services, http: next }); };

  return (
    <div>
      <SectionHeader title="HTTP-Server (Port 80)" enabled={draft.enabled} onToggle={() => update({ enabled: !draft.enabled })} disabled={disabled} />
      {draft.enabled && (
        <div className="space-y-1.5">
          <p className="text-gray-500 text-[10px]">HTML-Inhalt:</p>
          <div className="border border-gray-600 rounded overflow-hidden" style={{ maxHeight: 200 }}>
            <CodeMirror
              value={draft.html}
              extensions={[html()]}
              onChange={(v: string) => update({ html: v })}
              readOnly={disabled}
              theme="dark"
              basicSetup={{ lineNumbers: false, foldGutter: false }}
              style={{ fontSize: 11 }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
