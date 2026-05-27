const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const logDir = path.join(__dirname, 'build18-logs');
const inFile = path.join(logDir, 'log-0.raw');
const outFile = path.join(logDir, 'log-0.txt');

const data = fs.readFileSync(inFile);
console.log(`Input: ${data.length} bytes`);
try {
  const dec = zlib.brotliDecompressSync(data);
  fs.writeFileSync(outFile, dec);
  console.log(`Brotli decompressed: ${dec.length} chars`);
} catch (e) {
  // Maybe plain text
  fs.writeFileSync(outFile, data);
  console.log('Plain (or unknown) - copied as-is');
}

const content = fs.readFileSync(outFile, 'utf8');
console.log('\n=== LOG CONTENT ===');
const lines = content.split('\n').filter(l => l.trim().length > 0);
console.log(`Total lines: ${lines.length}`);
for (const line of lines) {
  try {
    const o = JSON.parse(line);
    if (o.msg && o.msg.trim().length > 0) {
      let m = o.msg.replace(/\n/g, ' ');
      if (m.length > 300) m = m.substring(0, 300) + '...';
      console.log(`[${o.phase || ''}] [${o.level || ''}] ${m}`);
    }
  } catch {
    if (line.length > 300) {
      console.log(line.substring(0, 300) + '...');
    } else {
      console.log(line);
    }
  }
}
