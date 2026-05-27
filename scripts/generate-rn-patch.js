const fs = require('fs');
const path = require('path');
const os = require('os');

const origPath = path.join(os.tmpdir(), 'RCTTurboModule.original.mm');
const modPath = path.join(__dirname, '..', 'workspaces', 'proj-1779820658954-0bc986e3',
  'node_modules', 'react-native', 'ReactCommon', 'react', 'nativemodule',
  'core', 'platform', 'ios', 'ReactCommon', 'RCTTurboModule.mm');

const origContent = fs.readFileSync(origPath, 'utf8');
const modContent = fs.readFileSync(modPath, 'utf8');

console.log(`Original: ${origContent.length} chars, ${origContent.split('\n').length} lines`);
console.log(`Modified: ${modContent.length} chars, ${modContent.split('\n').length} lines`);

// Simple unified diff generator
function generateUnifiedDiff(originalLines, modifiedLines, contextLines = 3) {
  const result = [];
  let i = 0, j = 0;

  // Find divergent regions
  const hunks = [];
  let hunkStart = -1;

  while (i < originalLines.length && j < modifiedLines.length) {
    if (originalLines[i] === modifiedLines[j]) {
      i++;
      j++;
    } else {
      // Find end of this divergent region
      // Simple approach: scan forward to find next matching line in both
      const startI = i;
      const startJ = j;
      // Find resync point
      let foundResync = false;
      for (let len = 1; len < 50 && !foundResync; len++) {
        for (let di = 0; di <= len; di++) {
          const dj = len - di;
          if (i + di < originalLines.length && j + dj < modifiedLines.length &&
              originalLines[i + di] === modifiedLines[j + dj] &&
              i + di + 1 < originalLines.length && j + dj + 1 < modifiedLines.length &&
              originalLines[i + di + 1] === modifiedLines[j + dj + 1] &&
              i + di + 2 < originalLines.length && j + dj + 2 < modifiedLines.length &&
              originalLines[i + di + 2] === modifiedLines[j + dj + 2]) {
            hunks.push({ origStart: startI, origEnd: i + di, modStart: startJ, modEnd: j + dj });
            i += di;
            j += dj;
            foundResync = true;
            break;
          }
        }
      }
      if (!foundResync) {
        // No more matches - take remaining
        hunks.push({ origStart: startI, origEnd: originalLines.length, modStart: startJ, modEnd: modifiedLines.length });
        i = originalLines.length;
        j = modifiedLines.length;
      }
    }
  }

  // Generate hunk patches with context
  const patchLines = [];
  for (const h of hunks) {
    const ctxBefore = Math.max(0, h.origStart - contextLines);
    const ctxAfter = Math.min(originalLines.length, h.origEnd + contextLines);
    const ctxBeforeMod = Math.max(0, h.modStart - contextLines);
    const ctxAfterMod = Math.min(modifiedLines.length, h.modEnd + contextLines);

    const origCount = ctxAfter - ctxBefore;
    const modCount = ctxAfterMod - ctxBeforeMod;

    patchLines.push(`@@ -${ctxBefore + 1},${origCount} +${ctxBeforeMod + 1},${modCount} @@`);

    // Context before
    for (let k = ctxBefore; k < h.origStart; k++) {
      patchLines.push(' ' + originalLines[k]);
    }
    // Removed lines
    for (let k = h.origStart; k < h.origEnd; k++) {
      patchLines.push('-' + originalLines[k]);
    }
    // Added lines
    for (let k = h.modStart; k < h.modEnd; k++) {
      patchLines.push('+' + modifiedLines[k]);
    }
    // Context after
    for (let k = h.origEnd; k < ctxAfter; k++) {
      patchLines.push(' ' + originalLines[k]);
    }
  }

  return patchLines.join('\n');
}

const origLines = origContent.split('\n');
const modLines = modContent.split('\n');

const relPath = 'node_modules/react-native/ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModule.mm';
const header = `diff --git a/${relPath} b/${relPath}\nindex 0000000..1111111 100644\n--- a/${relPath}\n+++ b/${relPath}\n`;

const diff = generateUnifiedDiff(origLines, modLines, 3);

const outPath = path.join(__dirname, '..', 'workspaces', 'proj-1779820658954-0bc986e3', 'patches', 'react-native+0.81.5.patch');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + diff + '\n');

console.log(`\nPatch written to: ${outPath}`);
console.log(`Patch size: ${(header + diff).length} chars`);
console.log('\n=== Patch content ===');
console.log(header + diff);
