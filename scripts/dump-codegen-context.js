const fs = require('fs');
const path = require('path');

const xc = fs.readFileSync(path.join(__dirname, 'build17-logs', 'log-0.txt'), 'utf8');
const lines = xc.split('\n');

// Find all lines that mention "autolinking" or "Codegen" within +/- 50 lines around interesting items
console.log('=== ALL LINES WITH Codegen / autolinking ===');
const interesting = [];
for (let i = 0; i < lines.length; i++) {
  if (/codegen|autolinking|RCTAppDependencyProvider|ReactCodegen|moduleProvider|TurboModule|RCTAppModuleProvider|generateProvider|module map|defines_module/i.test(lines[i])) {
    interesting.push(i);
  }
}
console.log(`Found ${interesting.length} interesting lines\n`);

// Show with context
const seen = new Set();
for (const idx of interesting) {
  if (seen.has(idx)) continue;
  console.log(`\n--- Around line ${idx} ---`);
  for (let j = Math.max(0, idx - 2); j <= Math.min(lines.length - 1, idx + 5); j++) {
    let l = lines[j];
    if (l.length > 350) l = l.substring(0, 350) + '...';
    const marker = j === idx ? '>>' : '  ';
    console.log(`${marker} [${j}] ${l}`);
    seen.add(j);
  }
}
