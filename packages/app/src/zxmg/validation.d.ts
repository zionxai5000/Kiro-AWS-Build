/**
 * ZXMG Media Production — Content Validation
 *
 * Validates content against platform-specific requirements (video format,
 * duration limits, metadata character limits, thumbnail specs) before upload.
 *
 * Requirements: 12.1, 12.2
 */
import type { ContentMetadata, AssembledVideo, ContentPlatform } from './pipeline.js';
export interface PlatformConstraints {
    platform: ContentPlatform;
    maxDurationSeconds: number;
    minDurationSeconds: number;
    maxTitleLength: number;
    maxDescriptionLength: number;
    maxTags: number;
    supportedFormats: string[];
    supportedResolutions: string[];
    maxFileSizeMb: number;
    thumbnailRequired: boolean;
}
export declare const PLATFORM_CONSTRAINTS: Record<ContentPlatform, PlatformConstraints>;
export interface ValidationIssue {
    field: string;
    message: string;
    severity: 'error' | 'warning';
}
export interface ValidationResult {
    valid: boolean;
    platform: ContentPlatform;
    issues: ValidationIssue[];
    validatedAt: string;
}
/**
 * Validate video against platform constraints.
 */
export declare function validateVideo(video: AssembledVideo, platform: ContentPlatform): ValidationIssue[];
/**
 * Validate metadata against platform constraints.
 */
export declare function validateMetadata(metadata: ContentMetadata, platform: ContentPlatform): ValidationIssue[];
/**
 * Run full validation for content before upload.
 */
export declare function validateContent(video: AssembledVideo, metadata: ContentMetadata, platform: ContentPlatform): ValidationResult;
//# sourceMappingURL=validation.d.ts.map