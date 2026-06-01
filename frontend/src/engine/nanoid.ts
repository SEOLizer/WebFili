let counter = 0;
export function nanoid(): string {
  return `pkt-${Date.now()}-${++counter}`;
}
