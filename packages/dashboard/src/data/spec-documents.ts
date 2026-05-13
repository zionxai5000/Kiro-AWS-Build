/**
 * Shaar Dashboard — Static Spec Document Imports
 *
 * Imports the SeraphimOS spec documents as raw markdown strings
 * using Vite's ?raw import feature. These are bundled directly
 * into the dashboard build, eliminating the need for a backend API.
 *
 * Requirements: 47e.19, 47f.22, 47g.25
 */

import requirementsContent from '../../../../.kiro/specs/seraphim-os-core/requirements.md?raw';
import designContent from '../../../../.kiro/specs/seraphim-os-core/design.md?raw';
import capabilitiesContent from '../../../../.kiro/specs/seraphim-os-core/capabilities.md?raw';

export { requirementsContent, designContent, capabilitiesContent };
