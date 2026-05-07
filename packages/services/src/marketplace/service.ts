/**
 * Agent Marketplace
 *
 * Publish, install, list, and rate Agent_Programs with tenant isolation.
 *
 * Requirements: 17.1, 17.2, 17.3, 17.4
 */

export interface MarketplaceProgram {
  id: string;
  name: string;
  version: string;
  description: string;
  hasTestSuite: boolean;
  hasCompletionContracts: boolean;
  hasDocumentation: boolean;
  rating: number;
  ratingCount: number;
  installCount: number;
  publishedAt: string;
  publishedBy: string;
}

export interface PublishResult {
  success: boolean;
  programId?: string;
  errors: string[];
}

export interface InstallResult {
  success: boolean;
  instanceId?: string;
  error?: string;
}

export class MarketplaceService {
  private programs = new Map<string, MarketplaceProgram>();

  async publishProgram(program: {
    name: string;
    version: string;
    description: string;
    hasTestSuite: boolean;
    hasCompletionContracts: boolean;
    hasDocumentation: boolean;
    publishedBy: string;
  }): Promise<PublishResult> {
    const errors: string[] = [];
    if (!program.hasTestSuite) errors.push('Test suite is required');
    if (!program.hasCompletionContracts) errors.push('Completion contracts are required');
    if (!program.hasDocumentation) errors.push('Documentation is required');

    if (errors.length > 0) return { success: false, errors };

    const id = `mp-${Date.now()}`;
    this.programs.set(id, {
      id,
      ...program,
      rating: 0,
      ratingCount: 0,
      installCount: 0,
      publishedAt: new Date().toISOString(),
    });
    return { success: true, programId: id, errors: [] };
  }

  async installProgram(programId: string, tenantId: string): Promise<InstallResult> {
    const program = this.programs.get(programId);
    if (!program) return { success: false, error: 'Program not found' };
    program.installCount++;
    return { success: true, instanceId: `inst-${tenantId}-${programId}` };
  }

  async listPrograms(query?: string): Promise<MarketplaceProgram[]> {
    const all = Array.from(this.programs.values());
    if (!query) return all;
    return all.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));
  }

  async rateProgram(programId: string, rating: number): Promise<boolean> {
    const program = this.programs.get(programId);
    if (!program || rating < 1 || rating > 5) return false;
    program.rating = (program.rating * program.ratingCount + rating) / (program.ratingCount + 1);
    program.ratingCount++;
    return true;
  }
}
