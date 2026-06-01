import { useState, useRef, useEffect } from 'react';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { simState } from '../../simulation/simState';
import { sendPing } from '../../engine/icmp';
import { scheduleTransmission } from '../../simulation/loop';
import type { PacketState } from '../../engine/types';

interface LogLine { text: string; type: 'input' | 'output' | 'error' | 'success' }

export default function FakeTerminal() {
  const selectedDeviceId = useSimulationUiStore(s => s.selectedDeviceId);
  const mode = useSimulationUiStore(s => s.mode);
  const nodes = useTopologyStore(s => s.nodes);

  const [lines, setLines] = useState<LogLine[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const node = nodes.find(n => n.id === selectedDeviceId);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [lines]);
  useEffect(() => { setLines([]); }, [selectedDeviceId]);

  if (!node) return <p className="text-xs text-gray-500 text-center mt-8 px-3">Kein Gerät ausgewählt.<br />Klicke im Simulationsmodus auf ein Gerät.</p>;
  if (mode !== 'simulate') return <p className="text-xs text-gray-500 text-center mt-8 px-3">Terminal nur im Simulationsmodus verfügbar.</p>;

  const iface = node.data.interfaces['eth0'];
  const prompt = `${node.data.label}> `;

  const print = (text: string, type: LogLine['type'] = 'output') =>
    setLines(prev => [...prev, { text, type }]);

  const waitForPacket = (
    check: (p: PacketState) => boolean,
    since: number,
    timeoutMs = 8000
  ): Promise<PacketState | null> => new Promise(resolve => {
    const start = Date.now();
    const interval = setInterval(() => {
      const found = simState.packetLog.find(p => p.createdAt >= since && check(p));
      if (found) { clearInterval(interval); resolve(found); return; }
      if (Date.now() - start > timeoutMs) { clearInterval(interval); resolve(null); }
    }, 100);
  });

  const handlePing = async (targetIp: string) => {
    if (!iface?.ip) { print('Fehler: Keine IP-Adresse konfiguriert.', 'error'); return; }
    const device = simState.devices[node.id];
    if (!device) { print('Fehler: Gerät nicht in Simulation gefunden.', 'error'); return; }

    print(`Pinge ${targetIp} von ${iface.ip}...`);
    const since = Date.now();
    const txs = sendPing(device, targetIp, simState);
    if (!txs.length) { print('Fehler: Kein Netzwerk oder kein Gateway konfiguriert.', 'error'); return; }
    txs.forEach(tx => scheduleTransmission(tx));

    const reply = await waitForPacket(
      p => p.layer4And7?.icmpType === 'echo-reply' && p.layer3?.destIp === iface.ip,
      since
    );
    if (reply) {
      const rtt = Date.now() - since;
      print(`Antwort von ${targetIp}: Bytes=32 Zeit=${rtt}ms TTL=${reply.layer3?.ttl}`, 'success');
    } else {
      print(`Zeitüberschreitung für ${targetIp}.`, 'error');
    }
  };

  const handleTraceroute = async (targetIp: string) => {
    if (!iface?.ip) { print('Fehler: Keine IP-Adresse konfiguriert.', 'error'); return; }
    const device = simState.devices[node.id];
    if (!device) { print('Fehler: Gerät nicht in Simulation.', 'error'); return; }

    print(`traceroute nach ${targetIp}, maximal 30 Hops:`);

    for (let ttl = 1; ttl <= 30; ttl++) {
      const since = Date.now();
      const txs = sendPing(device, targetIp, simState, ttl);
      if (!txs.length) { print(' *  Kein Netzwerk.', 'error'); break; }
      txs.forEach(tx => scheduleTransmission(tx));

      const reply = await waitForPacket(
        p => p.layer3?.destIp === iface.ip &&
             (p.layer4And7?.icmpType === 'ttl-exceeded' || p.layer4And7?.icmpType === 'echo-reply'),
        since,
        6000
      );

      if (!reply) {
        print(` ${ttl}  *  Zeitüberschreitung`);
        continue;
      }

      const rtt = Date.now() - since;
      const hopIp = reply.layer3?.srcIp ?? '*';
      if (reply.layer4And7?.icmpType === 'echo-reply') {
        print(` ${ttl}  ${hopIp}  ${rtt}ms`, 'success');
        print('Traceroute abgeschlossen.');
        break;
      }
      print(` ${ttl}  ${hopIp}  ${rtt}ms`);
    }
  };

  const handleCommand = async (raw: string) => {
    const cmd = raw.trim();
    print(`${prompt}${cmd}`, 'input');
    setInput('');
    if (!cmd) return;

    const [command, ...args] = cmd.split(/\s+/);

    switch (command.toLowerCase()) {
      case 'ping': {
        if (!args[0]) { print('Verwendung: ping <IP>', 'error'); break; }
        await handlePing(args[0]);
        break;
      }
      case 'traceroute':
      case 'tracert': {
        if (!args[0]) { print('Verwendung: traceroute <IP>', 'error'); break; }
        await handleTraceroute(args[0]);
        break;
      }
      case 'ipconfig':
      case 'ip': {
        print(`Interface: eth0`);
        print(`  IP-Adresse:      ${iface?.ip ?? '(nicht konfiguriert)'}`);
        print(`  Subnetzmaske:    ${iface?.subnet ?? '(nicht konfiguriert)'}`);
        print(`  Standard-Gateway:${iface?.gateway ? ' ' + iface.gateway : ' (nicht konfiguriert)'}`);
        print(`  MAC-Adresse:     ${iface?.mac}`);
        break;
      }
      case 'arp': {
        const device = simState.devices[node.id];
        if (!device?.arpTable.length) { print('ARP-Tabelle ist leer.'); break; }
        print('ARP-Tabelle:');
        device.arpTable.forEach(e => print(`  ${e.ip.padEnd(16)} → ${e.mac}`));
        break;
      }
      case 'route': {
        const device = simState.devices[node.id];
        if (!device?.routingTable.length) { print('Routing-Tabelle ist leer.'); break; }
        print('Routing-Tabelle:');
        device.routingTable.forEach(r =>
          print(`  ${r.network}/${r.subnet}${r.nextHop ? ` via ${r.nextHop}` : ' direkt'}  ${r.interfaceId}`)
        );
        break;
      }
      case 'clear':
        setLines([]);
        break;
      case 'help':
        print('Befehle: ping <IP>  traceroute <IP>  ipconfig  arp  route  clear');
        break;
      default:
        print(`Unbekannter Befehl: ${command}. Tippe 'help'.`, 'error');
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-950 font-mono text-xs cursor-text" onClick={() => inputRef.current?.focus()}>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {lines.length === 0 && <p className="text-gray-600">WebFilius Terminal – {node.data.label}{'\n'}Tippe 'help'.</p>}
        {lines.map((line, i) => (
          <div key={i} className={
            line.type === 'input' ? 'text-gray-300' :
            line.type === 'error' ? 'text-red-400' :
            line.type === 'success' ? 'text-green-400' : 'text-gray-400'
          }>{line.text}</div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center border-t border-gray-800 px-2 py-1">
        <span className="text-green-500 shrink-0">{prompt}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCommand(input); }}
          className="flex-1 bg-transparent text-gray-200 outline-none ml-1"
          autoFocus spellCheck={false}
        />
      </div>
    </div>
  );
}
