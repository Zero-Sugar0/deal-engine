function label(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly durations = new Map<
    string,
    { count: number; sum: number }
  >();

  increment(
    name: string,
    labels: Record<string, string> = {},
    amount = 1,
  ): void {
    const key = `${name}${this.key(labels)}`;
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
  }

  observe(
    name: string,
    seconds: number,
    labels: Record<string, string> = {},
  ): void {
    const key = `${name}${this.key(labels)}`;
    const current = this.durations.get(key) ?? { count: 0, sum: 0 };
    current.count += 1;
    current.sum += seconds;
    this.durations.set(key, current);
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP deal_http_requests_total Total HTTP requests handled by DEAL.',
      '# TYPE deal_http_requests_total counter',
    ];
    for (const [key, value] of this.counters) lines.push(`${key} ${value}`);
    for (const [key, value] of this.durations) {
      lines.push(`${key}_count ${value.count}`);
      lines.push(`${key}_sum ${value.sum}`);
    }
    return `${lines.join('\n')}\n`;
  }

  private key(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    return entries.length
      ? `{${entries.map(([key, value]) => `${key}="${label(value)}"`).join(',')}}`
      : '';
  }
}
