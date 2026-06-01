import { useState } from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import { useSimulationUiStore } from '../../stores/simulationUiStore';
import type { PacketState } from '../../engine/types';

export default function OsiInspector() {
  const { packetLog, activePacketId, setActivePacket } = useSimulationUiStore();
  const activePacket = packetLog.find((p) => p.id === activePacketId) ?? packetLog[packetLog.length - 1] ?? null;

  const [filter, setFilter] = useState('');

  const filtered = filter
    ? packetLog.filter(
        (p) =>
          p.layer2.etherType === filter ||
          p.layer4And7?.icmpType === filter ||
          p.layer2.arp?.operation === filter
      )
    : packetLog;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-gray-700">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full text-xs bg-gray-800 text-gray-300 border border-gray-600 rounded px-1 py-0.5 outline-none"
        >
          <option value="">Alle Pakete</option>
          <option value="arp">ARP</option>
          <option value="ipv4">IPv4</option>
          <option value="echo-request">ICMP Echo Request</option>
          <option value="echo-reply">ICMP Echo Reply</option>
          <option value="ttl-exceeded">ICMP TTL Exceeded</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-500 text-center mt-6 px-3">
            Kein Paket ausgewählt.
            <br />
            Starte die Simulation und klicke ein Paket an.
          </p>
        ) : (
          <div className="divide-y divide-gray-800">
            {[...filtered].reverse().slice(0, 100).map((p) => (
              <PacketRow
                key={p.id}
                packet={p}
                active={p.id === activePacket?.id}
                onClick={() => setActivePacket(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      {activePacket && (
        <div className="border-t border-gray-700 overflow-y-auto max-h-64">
          <PacketDetail packet={activePacket} />
        </div>
      )}
    </div>
  );
}

function PacketRow({ packet, active, onClick }: { packet: PacketState; active: boolean; onClick: () => void }) {
  const label = getPacketLabel(packet);
  const color = getStatusColor(packet);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2 py-1.5 text-xs hover:bg-gray-800 transition-colors ${active ? 'bg-gray-800 border-l-2 border-blue-400' : ''}`}
    >
      <span className={`font-mono ${color}`}>{label}</span>
      <span className="text-gray-500 ml-1 text-[10px]">
        {packet.status === 'dropped' ? '✗ dropped' : ''}
      </span>
    </button>
  );
}

function PacketDetail({ packet }: { packet: PacketState }) {
  return (
    <Accordion.Root type="multiple" defaultValue={['l2', 'l3', 'l4']} className="text-xs">
      <AccordionItem value="l2" title="Layer 2 – Ethernet">
        <Field label="Ziel-MAC" value={packet.layer2.destMac} />
        <Field label="Quell-MAC" value={packet.layer2.srcMac} />
        <Field
          label="Typ"
          value={packet.layer2.etherType === 'arp' ? '0x0806 (ARP)' : '0x0800 (IPv4)'}
        />
        {packet.layer2.arp && (
          <>
            <div className="mt-1 p-1.5 bg-amber-900/20 rounded border border-amber-700/30 text-amber-200">
              <strong>ARP {packet.layer2.arp.operation === 'request' ? 'Anfrage' : 'Antwort'}:</strong>{' '}
              {packet.layer2.arp.operation === 'request'
                ? `Wer hat ${packet.layer2.arp.targetIp}? Bitte antworte an ${packet.layer2.arp.senderIp}.`
                : `${packet.layer2.arp.senderIp} ist unter ${packet.layer2.arp.senderMac} erreichbar.`}
            </div>
            <Field label="Absender-MAC" value={packet.layer2.arp.senderMac} />
            <Field label="Absender-IP" value={packet.layer2.arp.senderIp} />
            <Field label="Ziel-IP" value={packet.layer2.arp.targetIp} />
          </>
        )}
        {packet.layer2.etherType === 'arp' && (
          <Hint>
            {packet.layer2.arp?.operation === 'request'
              ? 'Das Gerät kennt die MAC-Adresse des Ziels noch nicht und fragt im Netz nach. Alle Geräte im selben Subnetz erhalten diese Anfrage (Broadcast).'
              : 'Das Zielgerät antwortet direkt (Unicast) mit seiner MAC-Adresse. Der Absender speichert diese in seiner ARP-Tabelle.'}
          </Hint>
        )}
      </AccordionItem>

      {packet.layer3 && (
        <AccordionItem value="l3" title="Layer 3 – IPv4">
          <Field label="Quell-IP" value={packet.layer3.srcIp} />
          <Field label="Ziel-IP" value={packet.layer3.destIp} />
          <Field label="Protokoll" value={packet.layer3.protocol.toUpperCase()} />
          <Field label="TTL" value={String(packet.layer3.ttl)} />
          <Hint>
            {packet.layer3.ttl < 64
              ? `TTL wurde von einem Router dekrementiert. Aktueller Wert: ${packet.layer3.ttl}. Jeder Router verringert den TTL-Wert um 1 – erreicht er 0, wird das Paket verworfen und ein ICMP Time Exceeded zurückgesendet. Das verhindert Routing-Schleifen.`
              : 'Das IPv4-Paket enthält die logischen (Software-)Adressen. Der Router nutzt die Ziel-IP für das Routing. Das TTL-Feld (Time to Live) verhindert, dass Pakete endlos im Netz kreisen.'}
          </Hint>
        </AccordionItem>
      )}

      {packet.layer4And7 && (
        <Layer4Item packet={packet} />
      )}
    </Accordion.Root>
  );
}

function Layer4Item({ packet }: { packet: PacketState }) {
  const l4 = packet.layer4And7!;
  if (l4.protocol === 'icmp') {
    const label = l4.icmpType === 'echo-request' ? 'Echo Request (Ping-Anfrage)'
      : l4.icmpType === 'echo-reply' ? 'Echo Reply (Ping-Antwort)'
      : l4.icmpType === 'ttl-exceeded' ? 'Time Exceeded (TTL = 0)'
      : l4.icmpType ?? 'ICMP';
    return (
      <AccordionItem value="l4" title="Layer 4+7 – ICMP">
        <Field label="Typ" value={label} />
        {l4.icmpSeq !== undefined && <Field label="Sequenz-Nr." value={String(l4.icmpSeq)} />}
        <Hint>
          {l4.icmpType === 'echo-request' ? 'Ein ICMP Echo Request testet, ob ein Gerät erreichbar ist.'
          : l4.icmpType === 'echo-reply' ? 'Der Echo Reply bestätigt Erreichbarkeit. Ping erfolgreich.'
          : l4.icmpType === 'ttl-exceeded' ? 'Ein Router verwarf das Paket wegen TTL=0. Traceroute nutzt diese Meldung, um Router auf dem Pfad zu identifizieren.'
          : 'ICMP-Meldung.'}
        </Hint>
      </AccordionItem>
    );
  }
  if (l4.protocol === 'dhcp') {
    const d = l4.dhcp!;
    return (
      <AccordionItem value="l4" title={`Layer 4+7 – UDP/DHCP (Port ${l4.srcPort}→${l4.destPort})`}>
        <Field label="Nachrichtentyp" value={d.messageType.toUpperCase()} />
        <Field label="Client-MAC" value={d.clientMac} />
        {d.offeredIp && <Field label="Angebotene IP" value={d.offeredIp} />}
        {d.serverIp && <Field label="DHCP-Server" value={d.serverIp} />}
        {d.subnetMask && <Field label="Subnetzmaske" value={d.subnetMask} />}
        {d.gateway && <Field label="Gateway" value={d.gateway} />}
        {d.dnsServer && <Field label="DNS-Server" value={d.dnsServer} />}
        <Hint>
          {d.messageType === 'discover' ? 'Das Gerät sucht per Broadcast nach einem DHCP-Server im Netz (Discover). Es hat noch keine IP-Adresse.'
          : d.messageType === 'offer' ? `Der DHCP-Server bietet dem Client die IP ${d.offeredIp} an (Offer). Lease-Zeit: ${d.leaseTime}s.`
          : d.messageType === 'request' ? `Der Client fordert die angebotene IP ${d.requestedIp} offiziell an (Request).`
          : d.messageType === 'ack' ? `Der Server bestätigt die IP-Vergabe (Ack). Der Client konfiguriert nun seine Netzwerkschnittstelle.`
          : 'DHCP-Nachricht.'}
        </Hint>
      </AccordionItem>
    );
  }
  if (l4.protocol === 'dns') {
    const d = l4.dns!;
    return (
      <AccordionItem value="l4" title={`Layer 4+7 – UDP/DNS (Port ${l4.srcPort}→${l4.destPort})`}>
        <Field label="Typ" value={d.messageType === 'query' ? 'Anfrage (Query)' : 'Antwort (Response)'} />
        <Field label="Hostname" value={d.hostname} />
        {d.resolvedIp && <Field label="Aufgelöste IP" value={d.resolvedIp} />}
        <Hint>
          {d.messageType === 'query'
            ? `Das Gerät fragt den DNS-Server nach der IP-Adresse von "${d.hostname}". DNS läuft über UDP auf Port 53.`
            : d.resolvedIp
            ? `Der DNS-Server antwortet: ${d.hostname} → ${d.resolvedIp}. Das Gerät kann nun eine Verbindung aufbauen.`
            : `Hostname "${d.hostname}" ist dem DNS-Server nicht bekannt (NXDOMAIN).`}
        </Hint>
      </AccordionItem>
    );
  }
  if (l4.protocol === 'http') {
    const h = l4.http!;
    return (
      <AccordionItem value="l4" title={`Layer 4+7 – TCP/HTTP (Port ${l4.srcPort}→${l4.destPort})`}>
        {h.method && <Field label="Methode" value={`${h.method} ${h.path}`} />}
        {h.host && <Field label="Host" value={h.host} />}
        {h.statusCode && <Field label="Status" value={`${h.statusCode} ${h.statusText}`} />}
        {h.contentType && <Field label="Content-Type" value={h.contentType} />}
        {h.body && (
          <div className="mt-1 p-1.5 bg-gray-900 rounded border border-gray-700 font-mono text-[10px] text-gray-300 max-h-24 overflow-y-auto">
            {h.body.slice(0, 300)}
          </div>
        )}
        <Hint>
          {h.method === 'GET'
            ? `HTTP GET-Anfrage an den Webserver. TCP-Port 80 ist der Standard-HTTP-Port. Der Server verarbeitet die Anfrage und sendet eine HTTP-Antwort zurück.`
            : h.statusCode
            ? `HTTP-Antwort vom Server: ${h.statusCode} ${h.statusText}. Der Inhalt wird in der Antwort-Body übertragen (Applikationsschicht, Layer 7).`
            : 'HTTP-Paket.'}
        </Hint>
      </AccordionItem>
    );
  }
  return null;
}

function AccordionItem({ value, title, children }: { value: string; title: string; children: React.ReactNode }) {
  return (
    <Accordion.Item value={value} className="border-b border-gray-700">
      <Accordion.Header>
        <Accordion.Trigger className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-gray-200 hover:bg-gray-800 data-[state=open]:text-blue-300 transition-colors">
          {title}
          <span className="text-gray-500 data-[state=open]:rotate-180 transition-transform">▾</span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="px-3 pb-2 space-y-1">
        {children}
      </Accordion.Content>
    </Accordion.Item>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 py-0.5">
      <span className="text-gray-500 shrink-0">{label}:</span>
      <span className="text-gray-200 font-mono text-right break-all">{value}</span>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 p-2 bg-blue-900/20 rounded border border-blue-700/30 text-blue-200 leading-relaxed">
      {children}
    </div>
  );
}

function getPacketLabel(p: PacketState): string {
  if (p.layer2.etherType === 'arp') {
    const op = p.layer2.arp?.operation === 'request' ? 'ARP Req' : 'ARP Reply';
    return `${op} ${p.layer2.arp?.targetIp ?? p.layer2.arp?.senderIp ?? ''}`;
  }
  const l4 = p.layer4And7;
  if (!l4) return `Paket ${p.id.slice(-6)}`;
  if (l4.protocol === 'icmp') {
    if (l4.icmpType === 'echo-request') return `ICMP Echo → ${p.layer3?.destIp}`;
    if (l4.icmpType === 'echo-reply') return `ICMP Reply ← ${p.layer3?.srcIp}`;
    if (l4.icmpType === 'ttl-exceeded') return `TTL Exceeded von ${p.layer3?.srcIp}`;
  }
  if (l4.protocol === 'dhcp') return `DHCP ${l4.dhcp?.messageType?.toUpperCase()} ${l4.dhcp?.offeredIp ?? ''}`;
  if (l4.protocol === 'dns') {
    if (l4.dns?.messageType === 'query') return `DNS Query ${l4.dns.hostname}`;
    return `DNS Response ${l4.dns?.hostname} → ${l4.dns?.resolvedIp ?? 'NXDOMAIN'}`;
  }
  if (l4.protocol === 'http') {
    if (l4.http?.method) return `HTTP ${l4.http.method} ${l4.http.path}`;
    return `HTTP ${l4.http?.statusCode} ${l4.http?.statusText}`;
  }
  return `Paket ${p.id.slice(-6)}`;
}

function getStatusColor(p: PacketState): string {
  if (p.status === 'dropped') return 'text-red-400';
  if (p.layer2.etherType === 'arp') return p.layer2.arp?.operation === 'reply' ? 'text-green-400' : 'text-amber-400';
  const proto = p.layer4And7?.protocol;
  if (proto === 'icmp') return p.layer4And7?.icmpType === 'echo-reply' ? 'text-blue-400' : 'text-orange-400';
  if (proto === 'dhcp') return 'text-purple-400';
  if (proto === 'dns') return 'text-cyan-400';
  if (proto === 'http') return 'text-pink-400';
  return 'text-gray-400';
}
