import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import { useTopologyStore } from '../../stores/topologyStore';
import { simState } from '../../simulation/simState';
import { sendPing } from '../../engine/icmp';
import { scheduleTransmission } from '../../simulation/loop';
import { startDhcp } from '../../engine/dhcp';
import { startDnsQuery } from '../../engine/dns';
import { startHttpGet } from '../../engine/http';
import type { PacketState } from '../../engine/types';

// One terminal instance per device – survive panel switches
const cache = new Map<string, { term: Terminal; fit: FitAddon }>();

function getOrCreate(deviceId: string): { term: Terminal; fit: FitAddon } {
  if (!cache.has(deviceId)) {
    const term = new Terminal({
      theme: { background: '#030712', foreground: '#d1d5db', cursor: '#60a5fa' },
      cursorBlink: true,
      fontFamily: 'Menlo, Consolas, "Courier New", monospace',
      fontSize: 12,
      lineHeight: 1.4,
      scrollback: 1000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    cache.set(deviceId, { term, fit });
  }
  return cache.get(deviceId)!;
}

export default function XtermTerminal() {
  const selectedDeviceId = useSimulationUiStore(s => s.selectedDeviceId);
  const mode = useSimulationUiStore(s => s.mode);
  const nodes = useTopologyStore(s => s.nodes);
  const updateDeviceInterface = useTopologyStore(s => s.updateDeviceInterface);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(true);

  const node = nodes.find(n => n.id === selectedDeviceId);

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  });

  useEffect(() => {
    if (!containerRef.current || !node || mode !== 'simulate') return;

    const deviceId = node.id;
    const { term, fit } = getOrCreate(deviceId);

    term.open(containerRef.current);
    setTimeout(() => fit.fit(), 50);

    const resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(containerRef.current);

    const iface = node.data.interfaces['eth0'];
    const promptStr = () => `\r\n\x1b[32m${node.data.label}\x1b[0m> `;

    // Only write prompt on first open for this device
    if ((term as unknown as { _initialized?: boolean })._initialized === undefined) {
      (term as unknown as { _initialized?: boolean })._initialized = true;
      term.writeln(`\x1b[34mWebFilius Terminal – ${node.data.label}\x1b[0m`);
      term.writeln(`Tippe \x1b[33mhelp\x1b[0m für verfügbare Befehle.`);
      term.write(promptStr());
    }

    let line = '';
    const disposable = term.onData(async (data) => {
      const code = data.charCodeAt(0);
      if (data === '\r') {
        term.write('\r\n');
        const cmd = line.trim();
        line = '';
        if (cmd) await handleCommand(cmd, term, deviceId, iface, updateDeviceInterface, activeRef);
        if (activeRef.current) term.write(promptStr());
      } else if (data === '\x7f' || code === 8) {
        if (line.length > 0) { line = line.slice(0, -1); term.write('\b \b'); }
      } else if (code >= 32 && code < 127) {
        line += data; term.write(data);
      }
    });

    return () => {
      resizeObserver.disconnect();
      disposable.dispose();
    };
  }, [node?.id, mode]);

  if (!node) return <p className="text-xs text-gray-500 text-center mt-8 px-3">Kein Gerät ausgewählt.<br />Klicke im Simulationsmodus auf ein Gerät.</p>;
  if (mode !== 'simulate') return <p className="text-xs text-gray-500 text-center mt-8 px-3">Terminal nur im Simulationsmodus verfügbar.</p>;

  return <div ref={containerRef} className="h-full p-1" style={{ background: '#030712' }} />;
}

// ── Command handling ─────────────────────────────────────────────────────────

type UpdateIface = (nodeId: string, ifaceId: string, ip: string, subnet: string, gateway?: string) => void;

async function handleCommand(
  raw: string,
  term: Terminal,
  deviceId: string,
  _ifaceSnapshot: { ip?: string; subnet?: string; mac: string; gateway?: string } | undefined,
  updateIface: UpdateIface,
  activeRef: React.MutableRefObject<boolean>
) {
  const [cmd, ...args] = raw.split(/\s+/);
  const device = simState.devices[deviceId];
  if (!device) { term.writeln('\x1b[31mFehler: Gerät nicht in Simulation.\x1b[0m'); return; }
  // Always read from simState so DHCP-assigned IPs are visible immediately
  const iface = Object.values(device.interfaces)[0];

  const waitFor = (check: (p: PacketState) => boolean, since: number, ms = 8000) =>
    new Promise<PacketState | null>(resolve => {
      const s = Date.now();
      const t = setInterval(() => {
        const found = simState.packetLog.find(p => p.createdAt >= since && check(p));
        if (found) { clearInterval(t); resolve(found); return; }
        if (Date.now() - s > ms) { clearInterval(t); resolve(null); }
      }, 100);
    });

  switch (cmd.toLowerCase()) {
    case 'ping': {
      const target = args[0];
      if (!target) { term.writeln('Verwendung: ping <IP>'); break; }
      if (!iface?.ip) { term.writeln('\x1b[31mKeine IP konfiguriert. Nutze erst dhcp.\x1b[0m'); break; }
      term.writeln(`Pinge ${target} von ${iface.ip}...`);
      const since = Date.now();
      const txs = sendPing(device, target, simState);
      if (!txs.length) { term.writeln('\x1b[31mFehler: Kein Gateway oder Netzwerk.\x1b[0m'); break; }
      txs.forEach(t => scheduleTransmission(t));
      const reply = await waitFor(p => p.layer4And7?.icmpType === 'echo-reply' && p.layer3?.destIp === iface.ip, since);
      if (!activeRef.current) break;
      if (reply) term.writeln(`\x1b[32mAntwort von ${target}: Zeit=${Date.now()-since}ms TTL=${reply.layer3?.ttl}\x1b[0m`);
      else term.writeln(`\x1b[31mZeitüberschreitung für ${target}.\x1b[0m`);
      break;
    }

    case 'traceroute':
    case 'tracert': {
      const target = args[0];
      if (!target) { term.writeln('Verwendung: traceroute <IP>'); break; }
      if (!iface?.ip) { term.writeln('\x1b[31mKeine IP konfiguriert.\x1b[0m'); break; }
      term.writeln(`traceroute nach ${target}:`);
      for (let ttl = 1; ttl <= 30; ttl++) {
        const since = Date.now();
        const txs = sendPing(device, target, simState, ttl);
        txs.forEach(t => scheduleTransmission(t));
        const reply = await waitFor(
          p => p.layer3?.destIp === iface.ip && (p.layer4And7?.icmpType === 'ttl-exceeded' || p.layer4And7?.icmpType === 'echo-reply'),
          since, 6000
        );
        if (!activeRef.current) return;
        if (!reply) { term.writeln(` ${ttl}  *  Zeitüberschreitung`); continue; }
        const rtt = Date.now() - since;
        const hopIp = reply.layer3?.srcIp ?? '*';
        if (reply.layer4And7?.icmpType === 'echo-reply') { term.writeln(` ${ttl}  \x1b[32m${hopIp}  ${rtt}ms\x1b[0m`); term.writeln('Traceroute abgeschlossen.'); break; }
        term.writeln(` ${ttl}  ${hopIp}  ${rtt}ms`);
      }
      break;
    }

    case 'dhcp': {
      term.writeln('Sende DHCP Discover...');
      const since = Date.now();
      const txs = startDhcp(device, simState);
      if (!txs.length) { term.writeln('\x1b[31mKein Netzwerk verfügbar.\x1b[0m'); break; }
      txs.forEach(t => scheduleTransmission(t));
      const ack = await waitFor(p => p.layer4And7?.dhcp?.messageType === 'ack' && p.layer4And7?.dhcp?.clientMac === device.interfaces.eth0?.mac, since);
      if (!activeRef.current) break;
      if (!ack?.layer4And7?.dhcp) { term.writeln('\x1b[31mKeine DHCP-Antwort erhalten.\x1b[0m'); break; }
      const d = ack.layer4And7.dhcp;
      device.interfaces.eth0.ip = d.offeredIp;
      device.interfaces.eth0.subnet = d.subnetMask;
      device.interfaces.eth0.gateway = d.gateway;
      updateIface(deviceId, 'eth0', d.offeredIp!, d.subnetMask!, d.gateway);
      term.writeln(`\x1b[32mIP-Adresse erhalten: ${d.offeredIp}\x1b[0m`);
      term.writeln(`  Subnetzmaske:     ${d.subnetMask}`);
      term.writeln(`  Gateway:          ${d.gateway}`);
      if (d.dnsServer) term.writeln(`  DNS-Server:       ${d.dnsServer}`);
      term.writeln(`  Lease-Zeit:       ${d.leaseTime}s`);
      break;
    }

    case 'nslookup': {
      const hostname = args[0];
      const dnsIp = args[1] ?? iface?.gateway;
      if (!hostname) { term.writeln('Verwendung: nslookup <hostname> [dns-ip]'); break; }
      if (!iface?.ip) { term.writeln('\x1b[31mKeine IP konfiguriert.\x1b[0m'); break; }
      if (!dnsIp) { term.writeln('\x1b[31mKein DNS-Server bekannt. Angabe: nslookup <host> <dns-ip>\x1b[0m'); break; }
      term.writeln(`Server: ${dnsIp}`);
      term.writeln(`Frage nach: ${hostname}`);
      const since = Date.now();
      const txs = startDnsQuery(device, dnsIp, hostname, simState);
      if (!txs.length) { term.writeln('\x1b[31mFehler beim Senden.\x1b[0m'); break; }
      txs.forEach(t => scheduleTransmission(t));
      const resp = await waitFor(p => p.layer4And7?.dns?.messageType === 'response' && p.layer4And7?.dns?.hostname === hostname, since);
      if (!activeRef.current) break;
      if (!resp?.layer4And7?.dns) { term.writeln('\x1b[31mKeine Antwort vom DNS-Server.\x1b[0m'); break; }
      const resolvedIp = resp.layer4And7.dns.resolvedIp;
      if (resolvedIp) term.writeln(`\x1b[32mAntwort: ${hostname} → ${resolvedIp}\x1b[0m`);
      else term.writeln(`\x1b[31mHost "${hostname}" nicht gefunden.\x1b[0m`);
      break;
    }

    case 'curl': {
      const url = args[0] ?? '';
      const match = url.match(/^(?:http:\/\/)?([^/]+)(\/.*)?$/);
      if (!match) { term.writeln('Verwendung: curl http://<host-oder-ip>[/pfad]'); break; }
      const [, hostOrIp, path = '/'] = match;
      if (!iface?.ip) { term.writeln('\x1b[31mKeine IP konfiguriert.\x1b[0m'); break; }
      // Resolve hostname if needed (simple: assume IP or pre-resolved)
      const targetIp = hostOrIp.match(/^\d+\.\d+\.\d+\.\d+$/) ? hostOrIp : null;
      if (!targetIp) { term.writeln(`\x1b[33mHinweis: Nutze nslookup ${hostOrIp} um die IP zu ermitteln.\x1b[0m`); break; }
      term.writeln(`GET ${path} HTTP/1.1`);
      term.writeln(`Host: ${hostOrIp}`);
      term.writeln('');
      const since = Date.now();
      const txs = startHttpGet(device, targetIp, hostOrIp, path, simState);
      if (!txs.length) { term.writeln('\x1b[31mVerbindung fehlgeschlagen.\x1b[0m'); break; }
      txs.forEach(t => scheduleTransmission(t));
      const resp = await waitFor(p => p.layer4And7?.http?.statusCode !== undefined && p.layer3?.destIp === iface.ip, since);
      if (!activeRef.current) break;
      if (!resp?.layer4And7?.http) { term.writeln('\x1b[31mKeine Antwort.\x1b[0m'); break; }
      const h = resp.layer4And7.http;
      term.writeln(`\x1b[32mHTTP/1.1 ${h.statusCode} ${h.statusText}\x1b[0m`);
      term.writeln(`Content-Type: ${h.contentType}`);
      term.writeln('');
      term.writeln(h.body ?? '');
      break;
    }

    case 'ipconfig':
    case 'ip': {
      term.writeln(`Interface: eth0`);
      term.writeln(`  IP-Adresse:      ${iface?.ip ?? '(nicht konfiguriert)'}`);
      term.writeln(`  Subnetzmaske:    ${iface?.subnet ?? '(nicht konfiguriert)'}`);
      term.writeln(`  Standard-Gateway:${iface?.gateway ? ' ' + iface.gateway : ' (nicht konfiguriert)'}`);
      term.writeln(`  MAC-Adresse:     ${iface?.mac}`);
      break;
    }

    case 'arp':
      if (!device.arpTable.length) { term.writeln('ARP-Tabelle ist leer.'); break; }
      term.writeln('ARP-Tabelle:');
      device.arpTable.forEach(e => term.writeln(`  ${e.ip.padEnd(16)} → ${e.mac}`));
      break;

    case 'clear':
      term.clear();
      break;

    case 'help':
      term.writeln('Befehle:');
      term.writeln('  ping <IP>                  ICMP Echo Request');
      term.writeln('  traceroute <IP>            Route verfolgen');
      term.writeln('  dhcp                       IP per DHCP beziehen');
      term.writeln('  nslookup <host> [dns-ip]   DNS-Auflösung');
      term.writeln('  curl http://<ip>[/pfad]    HTTP GET');
      term.writeln('  ipconfig                   IP-Konfiguration anzeigen');
      term.writeln('  arp                        ARP-Tabelle anzeigen');
      term.writeln('  clear                      Terminal leeren');
      break;

    default:
      term.writeln(`\x1b[31mUnbekannter Befehl: ${cmd}. Tippe help.\x1b[0m`);
  }
}
