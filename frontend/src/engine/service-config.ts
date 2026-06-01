export interface DhcpServiceConfig {
  enabled: boolean;
  rangeStart: string;
  rangeEnd: string;
  subnet: string;
  gateway: string;
  dnsServer?: string;
  leaseTime?: number;
}

export interface DnsServiceConfig {
  enabled: boolean;
  records: { hostname: string; ip: string }[];
}

export interface HttpServiceConfig {
  enabled: boolean;
  html: string;
}

export interface ServiceConfig {
  dhcp?: DhcpServiceConfig;
  dns?: DnsServiceConfig;
  http?: HttpServiceConfig;
}
