/**
 * Observability — System Health
 *
 * System health endpoint returning operational status of every core service,
 * driver, and active agent.
 *
 * Requirements: 18.4, 18.5
 */

// ---------------------------------------------------------------------------
// Health types
// ---------------------------------------------------------------------------

export type ServiceStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ServiceHealth {
  name: string;
  status: ServiceStatus;
  lastChecked: string;
  details?: string;
}

export interface SystemHealthReport {
  overall: ServiceStatus;
  services: ServiceHealth[];
  drivers: ServiceHealth[];
  agents: ServiceHealth[];
  timestamp: string;
}

export interface HealthCheckerConfig {
  /** Timeout in milliseconds for individual health checks (default: 5000) */
  checkTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// HealthChecker
// ---------------------------------------------------------------------------

export class HealthChecker {
  private serviceChecks = new Map<string, () => Promise<ServiceStatus>>();
  private driverChecks = new Map<string, () => Promise<ServiceStatus>>();
  private agentChecks = new Map<string, { name: string; check: () => Promise<ServiceStatus> }>();
  private readonly checkTimeoutMs: number;

  constructor(config?: HealthCheckerConfig) {
    this.checkTimeoutMs = config?.checkTimeoutMs ?? 5_000;
  }

  registerService(name: string, check: () => Promise<ServiceStatus>): void {
    this.serviceChecks.set(name, check);
  }

  registerDriver(name: string, check: () => Promise<ServiceStatus>): void {
    this.driverChecks.set(name, check);
  }

  registerAgent(id: string, name: string, check: () => Promise<ServiceStatus>): void {
    this.agentChecks.set(id, { name, check });
  }

  async checkHealth(): Promise<SystemHealthReport> {
    const [services, drivers, agents] = await Promise.all([
      this.runChecks(this.serviceChecks),
      this.runChecks(this.driverChecks),
      this.runAgentChecks(),
    ]);

    const allStatuses = [...services, ...drivers, ...agents];
    const overall = this.computeOverallStatus(allStatuses);

    return {
      overall,
      services,
      drivers,
      agents,
      timestamp: new Date().toISOString(),
    };
  }

  getServiceStatus(name: string): ServiceHealth | undefined {
    // Synchronous lookup — returns last-known status by running the check
    // For a quick lookup without re-running, callers should cache checkHealth() results.
    // This method is provided for individual service queries.
    const check = this.serviceChecks.get(name) ?? this.driverChecks.get(name);
    if (!check) return undefined;
    // Return a placeholder; callers should use the async version via checkHealth()
    return { name, status: 'unknown', lastChecked: new Date().toISOString() };
  }

  // ---- Internal helpers ----

  private async runChecks(checks: Map<string, () => Promise<ServiceStatus>>): Promise<ServiceHealth[]> {
    const results: ServiceHealth[] = [];
    for (const [name, check] of checks) {
      results.push(await this.executeCheck(name, check));
    }
    return results;
  }

  private async runAgentChecks(): Promise<ServiceHealth[]> {
    const results: ServiceHealth[] = [];
    for (const [id, { name, check }] of this.agentChecks) {
      const result = await this.executeCheck(name, check);
      result.details = result.details ? `${id}: ${result.details}` : id;
      results.push(result);
    }
    return results;
  }

  private async executeCheck(name: string, check: () => Promise<ServiceStatus>): Promise<ServiceHealth> {
    try {
      const status = await this.withTimeout(check(), this.checkTimeoutMs);
      return { name, status, lastChecked: new Date().toISOString() };
    } catch (err) {
      const isTimeout = err instanceof Error && err.message === 'Health check timed out';
      return {
        name,
        status: isTimeout ? 'degraded' : 'down',
        lastChecked: new Date().toISOString(),
        details: isTimeout ? 'Health check timed out' : 'Health check failed',
      };
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Health check timed out')), ms);
      promise.then(
        (val) => { clearTimeout(timer); resolve(val); },
        (err) => { clearTimeout(timer); reject(err); },
      );
    });
  }

  private computeOverallStatus(statuses: ServiceHealth[]): ServiceStatus {
    if (statuses.length === 0) return 'healthy';
    if (statuses.every((s) => s.status === 'healthy')) return 'healthy';
    if (statuses.some((s) => s.status === 'down')) return 'down';
    return 'degraded';
  }
}
