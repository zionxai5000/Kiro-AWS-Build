/**
 * Auto-Scaling Configuration
 *
 * ECS auto-scaling policies and Aurora auto-scaling configuration.
 * Scale out when CPU > 70% or memory > 80%, scale in when CPU < 30%.
 *
 * Requirements: 15.3, 15.4, 15.5
 */

export interface AutoScalingConfig {
  minCapacity: number;
  maxCapacity: number;
  cpuScaleOutThreshold: number;
  cpuScaleInThreshold: number;
  memoryScaleOutThreshold: number;
  cooldownSeconds: number;
}

export const DEFAULT_ECS_SCALING: AutoScalingConfig = {
  minCapacity: 2,
  maxCapacity: 10,
  cpuScaleOutThreshold: 70,
  cpuScaleInThreshold: 30,
  memoryScaleOutThreshold: 80,
  cooldownSeconds: 300,
};

export const DEFAULT_AURORA_SCALING = {
  minReaderInstances: 1,
  maxReaderInstances: 5,
  targetConnectionCount: 100,
  scaleOutCooldownSeconds: 300,
  scaleInCooldownSeconds: 600,
};

/**
 * Determine if scale-out is needed based on current metrics.
 */
export function shouldScaleOut(
  cpuPercent: number,
  memoryPercent: number,
  config: AutoScalingConfig = DEFAULT_ECS_SCALING,
): boolean {
  return cpuPercent > config.cpuScaleOutThreshold || memoryPercent > config.memoryScaleOutThreshold;
}

/**
 * Determine if scale-in is needed based on current metrics.
 */
export function shouldScaleIn(
  cpuPercent: number,
  config: AutoScalingConfig = DEFAULT_ECS_SCALING,
): boolean {
  return cpuPercent < config.cpuScaleInThreshold;
}

/**
 * Calculate desired task count based on metrics.
 */
export function calculateDesiredCount(
  currentCount: number,
  cpuPercent: number,
  memoryPercent: number,
  config: AutoScalingConfig = DEFAULT_ECS_SCALING,
): number {
  if (shouldScaleOut(cpuPercent, memoryPercent, config)) {
    return Math.min(currentCount + 1, config.maxCapacity);
  }
  if (shouldScaleIn(cpuPercent, config)) {
    return Math.max(currentCount - 1, config.minCapacity);
  }
  return currentCount;
}
