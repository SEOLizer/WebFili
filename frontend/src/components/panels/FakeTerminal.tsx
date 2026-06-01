import { useState, useRef, useEffect } from 'react';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { simState } from '../../simulation/simState';
import { sendPing } from '../../engine/icmp';
import { scheduleTransmission } from '../../simulation/loop';

interface LogLine {
  text: string;
  type: 'input' | 'output' | 'error' | 'success';
}

export default function FakeTerminal() {
  const selectedDeviceId = useSimulationUiStore((s) => s.selectedDeviceId);
  const mode = useSimulationUiStore((s) => s.mode);
  const nodes = useTopologyStore((s) => s.nodes);

  const [lines, setLines] = useState<LogLine[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const node = nodes.find((n) => n.id === selectedDeviceId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    setLines([]);
  }, [selectedDeviceId]);

  if (!node) {
    return (
      <p className="text-xs text-gray-500 text-center mt-8 px-3">
        Kein Gerät ausgewählt.
        <br />
        Doppelklicke im Simulationsmodus auf ein Gerät.
      </p>
    );
  }

  if (mode !== 'simulate') {
    return (
      <p className="text-xs text-gray-500 text-center mt-8 px-3">
        Terminal nur im Simulationsmodus verfügbar.
      </p>
    );
  }

  const iface = node.data.interfaces['eth0'];
  const prompt = `${node.data.label}> `;

  const print = (text: string, type: LogLine['type'] = 'output') => {
    setLines((prev) => [...prev, { text, type }]);
  };

  const handleCommand = (raw: string) => {
    const cmd = raw.trim();
    print(`${prompt}${cmd}`, 'input');
    setInput('');

    if (!cmd) return;

    const parts = cmd.split(/\s+/);
    const command = parts[0].toLowerCase();

    if (command === 'ping') {
      const targetIp = parts[1];
      if (!targetIp) { print('Verwendung: ping <IP-Adresse>', 'error'); return; }
      if (!iface?.ip) { print('Fehler: Dieses Gerät hat keine IP-Adresse konfiguriert.', 'error'); return; }

      const device = simState.devices[node.id];
      if (!device) { print('Fehler: Gerät nicht in Simulation gefunden.', 'error'); return; }

      print(`Pinge ${targetIp} von ${iface.ip}...`);

      const transmissions = sendPing(device, targetIp, simState);
      if (transmissions.length === 0) {
        print('Fehler: Kein Netzwerk verfügbar oder Gerät nicht verbunden.', 'error');
        return;
      }

      for (const tx of transmissions) scheduleTransmission(tx);

      // Listen for reply (poll simState.packetLog)
      const startTime = Date.now();
      const pollInterval = setInterval(() => {
        const reply = simState.packetLog.find(
          (p) =>
            p.layer4And7?.icmpType === 'echo-reply' &&
            p.layer3?.destIp === iface.ip &&
            p.createdAt >= startTime
        );
        if (reply) {
          clearInterval(pollInterval);
          const rtt = Date.now() - startTime;
          print(`Antwort von ${targetIp}: Bytes=32 Zeit=${rtt}ms TTL=${reply.layer3?.ttl}`, 'success');
          return;
        }
        if (Date.now() - startTime > 5000) {
          clearInterval(pollInterval);
          print(`Zeitüberschreitung für ${targetIp}.`, 'error');
        }
      }, 200);

    } else if (command === 'ipconfig' || command === 'ip') {
      if (!iface) { print('Keine Netzwerkkonfiguration vorhanden.'); return; }
      print(`Interface: eth0`);
      print(`  IP-Adresse:   ${iface.ip ?? '(nicht konfiguriert)'}`);
      print(`  Subnetzmaske: ${iface.subnet ?? '(nicht konfiguriert)'}`);
      print(`  MAC-Adresse:  ${iface.mac}`);

    } else if (command === 'arp') {
      const device = simState.devices[node.id];
      if (!device || device.arpTable.length === 0) { print('ARP-Tabelle ist leer.'); return; }
      print('ARP-Tabelle:');
      for (const entry of device.arpTable) {
        print(`  ${entry.ip.padEnd(16)} → ${entry.mac}`);
      }

    } else if (command === 'clear') {
      setLines([]);

    } else if (command === 'help') {
      print('Verfügbare Befehle:');
      print('  ping <IP>    – Sendet ICMP Echo Requests');
      print('  ipconfig     – Zeigt IP-Konfiguration');
      print('  arp          – Zeigt ARP-Tabelle');
      print('  clear        – Leert das Terminal');

    } else {
      print(`Unbekannter Befehl: ${command}. Tippe 'help' für Hilfe.`, 'error');
    }
  };

  return (
    <div
      className="flex flex-col h-full bg-gray-950 font-mono text-xs cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {lines.length === 0 && (
          <p className="text-gray-600">
            WebFilius Terminal – {node.data.label}
            <br />
            Tippe 'help' für Hilfe.
          </p>
        )}
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'input' ? 'text-gray-300' :
              line.type === 'error' ? 'text-red-400' :
              line.type === 'success' ? 'text-green-400' :
              'text-gray-400'
            }
          >
            {line.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center border-t border-gray-800 px-2 py-1">
        <span className="text-green-500 shrink-0">{prompt}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCommand(input);
          }}
          className="flex-1 bg-transparent text-gray-200 outline-none ml-1"
          autoFocus
          spellCheck={false}
        />
      </div>
    </div>
  );
}
