/**
 * Driver Registry — validates, manages lifecycle, and provides access to drivers.
 *
 * Responsibilities:
 * - Validate that each driver implements the uniform Driver interface
 * - Track driver status (registered, connected, ready, error)
 * - Run optional integration test suites before activation
 * - Manage driver lifecycle (connect/disconnect)
 * - Provide health checks across all registered drivers
 *
 * Requirements: 10.1, 10.5
 */
import type { Driver } from '@seraphim/core/interfaces/driver.js';
import type { HealthStatus } from '@seraphim/core/types/driver.js';
/** Lifecycle status of a driver within the registry. */
export type RegistryDriverStatus = 'registered' | 'connected' | 'ready' | 'error';
/** Information about a registered driver. */
export interface RegisteredDriverInfo {
    name: string;
    version: string;
    status: RegistryDriverStatus;
    health: HealthStatus | null;
    registeredAt: Date;
}
/** Options for registering a driver. */
export interface RegisterDriverOptions<TConfig = unknown> {
    /** Configuration to use when connecting the driver. */
    config?: TConfig;
    /** Optional integration test suite. If provided, the driver is activated only if all tests pass. */
    integrationTests?: () => Promise<void>;
}
export declare class DriverRegistry {
    private readonly drivers;
    /**
     * Register a driver in the registry.
     *
     * Validates that the driver implements all required methods from the
     * uniform Driver interface. If an integration test suite is provided,
     * the driver is activated only if all tests pass.
     *
     * @throws Error if the driver is invalid or a driver with the same name is already registered.
     */
    registerDriver<TConfig = unknown>(driver: Driver<TConfig>, options?: RegisterDriverOptions<TConfig>): Promise<void>;
    /**
     * Return a connected, ready driver instance by name.
     *
     * @throws Error if the driver is not found or not in a ready state.
     */
    getDriver<TConfig = unknown>(name: string): Driver<TConfig>;
    /**
     * Return all registered drivers with their status and health.
     */
    listDrivers(): RegisteredDriverInfo[];
    /**
     * Disconnect and remove a driver from the registry.
     *
     * @throws Error if the driver is not registered.
     */
    unregisterDriver(name: string): Promise<void>;
    /**
     * Connect all registered drivers that have not yet been connected.
     * Requires a config map keyed by driver name.
     */
    connectAll(configs: Record<string, unknown>): Promise<Record<string, boolean>>;
    /**
     * Disconnect all registered drivers.
     */
    disconnectAll(): Promise<void>;
    /**
     * Run health checks across all registered drivers.
     */
    healthCheckAll(): Promise<Record<string, HealthStatus>>;
    /** Number of registered drivers. */
    get size(): number;
    /** Check if a driver is registered by name. */
    has(name: string): boolean;
    /**
     * Validate that a driver implements all required methods and properties
     * from the uniform Driver interface.
     *
     * @throws Error with details about missing methods/properties.
     */
    private validateDriver;
}
//# sourceMappingURL=registry.d.ts.map