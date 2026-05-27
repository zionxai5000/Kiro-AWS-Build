const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'build17-logs');
const mainLog = fs.readFileSync(path.join(logDir, 'log-1.txt'), 'utf8');
const xcodeLog = fs.readFileSync(path.join(logDir, 'log-0.txt'), 'utf8');

console.log('================================================================');
console.log('BUILD #17 LOG ANALYSIS');
console.log('================================================================\n');

// Parse main log as NDJSON
const mainLines = mainLog.split('\n').filter(l => l.trim().length > 0);
console.log(`Main log: ${mainLines.length} JSON lines`);

let parsed = [];
for (const line of mainLines) {
  try { parsed.push(JSON.parse(line)); } catch {}
}
console.log(`Parsed: ${parsed.length} entries\n`);

// List all distinct phases
const phases = [...new Set(parsed.map(e => e.phase).filter(Boolean))];
console.log('=== PHASES ENCOUNTERED ===');
for (const p of phases) {
  const entries = parsed.filter(e => e.phase === p);
  console.log(`  ${p}: ${entries.length} log entries`);
}
console.log();

// Show key entries per phase
console.log('=== KEY EVENTS / ERRORS / WARNINGS BY PHASE ===');
for (const p of phases) {
  const entries = parsed.filter(e => e.phase === p);
  const interesting = entries.filter(e => {
    const m = e.msg || '';
    if (!m.trim()) return false;
    // skip generic spam
    if (/^\s*$/.test(m)) return false;
    return e.level >= 40 || // warn or error
      /\b(error|Error|ERROR|fail|Fail|FAIL|missing|Missing|skip|warn|Warn|cannot|Cannot|unable|Unable|undefined|Undefined)\b/.test(m) ||
      /\b(autolinking|expo-modules|ExpoModules|EXConstants|Pods|pod install|CocoaPods|precompiled|TurboModule|fabric|new architecture|RCT_NEW_ARCH|hermes|Podfile)\b/i.test(m);
  });
  if (interesting.length > 0) {
    console.log(`\n--- Phase: ${p} (${interesting.length} interesting / ${entries.length} total) ---`);
    for (const e of interesting.slice(0, 50)) {
      let m = e.msg.replace(/\n/g, ' ').replace(/\s+/g, ' ');
      if (m.length > 250) m = m.substring(0, 250) + '...';
      console.log(`  [${e.level || '??'}] ${m}`);
    }
    if (interesting.length > 50) console.log(`  ... and ${interesting.length - 50} more`);
  }
}

console.log('\n\n=== XCODE LOG ANALYSIS ===');
console.log(`xcode log: ${xcodeLog.length} chars`);

// Xcode log might also be NDJSON or plain text - sample first
const xcodeFirst200 = xcodeLog.substring(0, 500);
console.log('First 500 chars:');
console.log(xcodeFirst200);
console.log('\n');

// Try to parse as NDJSON
const xcodeLines = xcodeLog.split('\n').filter(l => l.trim().length > 0);
console.log(`xcode log: ${xcodeLines.length} lines`);
let xcParsed = [];
let xcParsedSuccess = 0;
for (const line of xcodeLines) {
  try { xcParsed.push(JSON.parse(line)); xcParsedSuccess++; } catch {}
}
console.log(`xcode parsed as JSON: ${xcParsedSuccess}/${xcodeLines.length}`);

if (xcParsedSuccess > xcodeLines.length / 2) {
  // Mostly JSON
  const xcPhases = [...new Set(xcParsed.map(e => e.phase).filter(Boolean))];
  console.log('Xcode phases:');
  for (const p of xcPhases) {
    const ents = xcParsed.filter(e => e.phase === p);
    console.log(`  ${p}: ${ents.length}`);
  }
  // Save as easy-readable text version
  const cleaned = xcParsed.map(e => `[${e.phase || ''}] [${e.level || ''}] ${(e.msg || '').replace(/\n/g, ' ')}`).join('\n');
  fs.writeFileSync(path.join(logDir, 'log-0-readable.txt'), cleaned);
  console.log(`\nReadable xcode log saved to log-0-readable.txt (${cleaned.length} chars)`);
} else {
  // Plain text - save as is for grepping
  console.log('xcode log appears to be plain text - searching for keywords');
}
