const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const logDir = path.join(__dirname, 'build17-logs');

for (let i = 0; i < 2; i++) {
  const inFile = path.join(logDir, `log-${i}.raw`);
  const outFile = path.join(logDir, `log-${i}.txt`);
  if (!fs.existsSync(inFile)) {
    console.log(`Skip: ${inFile} doesn't exist`);
    continue;
  }
  const data = fs.readFileSync(inFile);
  console.log(`log-${i}.raw: ${data.length} bytes, first 4 bytes: ${data.slice(0,4).toString('hex')}`);
  try {
    const decompressed = zlib.brotliDecompressSync(data);
    fs.writeFileSync(outFile, decompressed);
    console.log(`  -> brotli decompressed to ${outFile} (${decompressed.length} chars)`);
  } catch (e) {
    console.log(`  brotli failed: ${e.message}`);
    try {
      const decompressed = zlib.gunzipSync(data);
      fs.writeFileSync(outFile, decompressed);
      console.log(`  -> gzip decompressed to ${outFile} (${decompressed.length} chars)`);
    } catch (e2) {
      console.log(`  gzip also failed: ${e2.message}`);
      try {
        const decompressed = zlib.inflateSync(data);
        fs.writeFileSync(outFile, decompressed);
        console.log(`  -> deflate decompressed to ${outFile} (${decompressed.length} chars)`);
      } catch (e3) {
        console.log(`  deflate also failed: ${e3.message}`);
      }
    }
  }
}
