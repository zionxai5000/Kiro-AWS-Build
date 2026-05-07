"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverRegistry = void 0;
/** Required methods that every driver must implement. */
const REQUIRED_DRIVER_METHODS = [
    'connect',
    'execute',
    'verify',
    'disconnect',
    'healthCheck',
];
/** Required readonly properties that every driver must have. */
const REQUIRED_DRIVER_PROPERTIES = ['name', 'version'];
// ---------------------------------------------------------------------------
// DriverRegistry
// ---------------------------------------------------------------------------
class DriverRegistry {
    drivers = new Map();
    // =====================================================================
    // Registration
    // =====================================================================
    /**
     * Register a driver in the registry.
     *
     * Validates that the driver implements all required methods from the
     * uniform Driver interface. If an integration test suite is provided,
     * the driver is activated only if all tests pass.
     *
     * @throws Error if the driver is invalid or a driver with the same name is already registered.
     */
    async registerDriver(driver, options = {}) {
        // Validate the driver implements the uniform interface
        this.validateDriver(driver);
        const name = driver.name;
        if (this.drivers.has(name)) {
            throw new Error(`Driver "${name}" is already registered`);
        }
        const entry = {
            driver,
            status: 'registered',
            health: null,
            registeredAt: new Date(),
        };
        this.drivers.set(name, entry);
        // Run integration tests if provided
        if (options.integrationTests) {
            try {
                await options.integrationTests();
            }
            catch (err) {
                // Tests failed — mark as error and keep registered but not activated
                entry.status = 'error';
                const message = err instanceof Error ? err.message : String(err);
                entry.health = {
                    healthy: false,
                    status: driver.status,
                    errorCount: 1,
                    message: `Integration tests failed: ${message}`,
                };
                throw new Error(`Integration tests failed for driver "${name}": ${message}`);
            }
        }
        // Connect if config is provided
        if (options.config !== undefined) {
            const result = await driver.connect(options.config);
            if (result.success) {
                entry.status = 'ready';
                entry.health = await driver.healthCheck();
            }
            else {
                entry.status = 'error';
                entry.health = {
                    healthy: false,
                    status: result.status,
                    errorCount: 1,
                    message: result.message ?? 'Connection failed',
                };
            }
        }
    }
    // =====================================================================
    // Retrieval
    // =====================================================================
    /**
     * Return a connected, ready driver instance by name.
     *
     * @throws Error if the driver is not found or not in a ready state.
     */
    getDriver(name) {
        const entry = this.drivers.get(name);
        if (!entry) {
            throw new Error(`Driver "${name}" is not registered`);
        }
        if (entry.status !== 'ready') {
            throw new Error(`Driver "${name}" is not ready (current status: ${entry.status})`);
        }
        return entry.driver;
    }
    /**
     * Return all registered drivers with their status and health.
     */
    listDrivers() {
        const result = [];
        for (const [, entry] of this.drivers) {
            result.push({
                name: entry.driver.name,
                version: entry.driver.version,
                status: entry.status,
                health: entry.health,
                registeredAt: entry.registeredAt,
            });
        }
        return result;
    }
    // =====================================================================
    // Unregistration
    // =====================================================================
    /**
     * Disconnect and remove a driver from the registry.
     *
     * @throws Error if the driver is not registered.
     */
    async unregisterDriver(name) {
        const entry = this.drivers.get(name);
        if (!entry) {
            throw new Error(`Driver "${name}" is not registered`);
        }
        // Disconnect if the driver is in a connected/ready state
        if (entry.status === 'ready' || entry.status === 'connected') {
            try {
                await entry.driver.disconnect();
            }
            catch {
                // Best-effort disconnect — proceed with removal regardless
            }
        }
        this.drivers.delete(name);
    }
    // =====================================================================
    // Bulk lifecycle
    // =====================================================================
    /**
     * Connect all registered drivers that have not yet been connected.
     * Requires a config map keyed by driver name.
     */
    async connectAll(configs) {
        const results = {};
        for (const [name, entry] of this.drivers) {
            if (entry.status === 'ready') {
                results[name] = true;
                continue;
            }
            const config = configs[name];
            if (config === undefined) {
                results[name] = false;
                continue;
            }
            try {
                const result = await entry.driver.connect(config);
                if (result.success) {
                    entry.status = 'ready';
                    entry.health = await entry.driver.healthCheck();
                    results[name] = true;
                }
                else {
                    entry.status = 'error';
                    entry.health = {
                        healthy: false,
                        status: result.status,
                        errorCount: 1,
                        message: result.message ?? 'Connection failed',
                    };
                    results[name] = false;
                }
            }
            catch {
                entry.status = 'error';
                results[name] = false;
            }
        }
        return results;
    }
    /**
     * Disconnect all registered drivers.
     */
    async disconnectAll() {
        for (const [, entry] of this.drivers) {
            if (entry.status === 'ready' || entry.status === 'connected') {
                try {
                    await entry.driver.disconnect();
                    entry.status = 'registered';
                    entry.health = null;
                }
                catch {
                    entry.status = 'error';
                }
            }
        }
    }
    /**
     * Run health checks across all registered drivers.
     */
    async healthCheckAll() {
        const results = {};
        for (const [name, entry] of this.drivers) {
            try {
                const health = await entry.driver.healthCheck();
                entry.health = health;
                // Update registry status based on health
                if (health.healthy && entry.status !== 'error') {
                    entry.status = 'ready';
                }
                else if (!health.healthy && entry.status === 'ready') {
                    entry.status = 'error';
                }
                results[name] = health;
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const errorHealth = {
                    healthy: false,
                    status: entry.driver.status,
                    errorCount: 1,
                    message: `Health check failed: ${message}`,
                };
                entry.health = errorHealth;
                entry.status = 'error';
                results[name] = errorHealth;
            }
        }
        return results;
    }
    // =====================================================================
    // Helpers
    // =====================================================================
    /** Number of registered drivers. */
    get size() {
        return this.drivers.size;
    }
    /** Check if a driver is registered by name. */
    has(name) {
        return this.drivers.has(name);
    }
    // =====================================================================
    // Validation
    // =====================================================================
    /**
     * Validate that a driver implements all required methods and properties
     * from the uniform Driver interface.
     *
     * @throws Error with details about missing methods/properties.
     */
    validateDriver(driver) {
        if (!driver || typeof driver !== 'object') {
            throw new Error('Driver must be a non-null object');
        }
        const missing = [];
        // Check required properties
        for (const prop of REQUIRED_DRIVER_PROPERTIES) {
            if (!(prop in driver)) {
                missing.push(`property "${prop}"`);
            }
        }
        // Check required methods
        for (const method of REQUIRED_DRIVER_METHODS) {
            if (!(method in driver) ||
                typeof driver[method] !== 'function') {
                missing.push(`method "${method}"`);
            }
        }
        if (missing.length > 0) {
            throw new Error(`Driver is missing required members: ${missing.join(', ')}`);
        }
    }
}
exports.DriverRegistry = DriverRegistry;
//# sourceMappingURL=registry.js.map