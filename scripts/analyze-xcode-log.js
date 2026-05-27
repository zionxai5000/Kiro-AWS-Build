const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'build17-logs');
const xc = fs.readFileSync(path.join(logDir, 'log-0.txt'), 'utf8');
const lines = xc.split('\n');

console.log(`Total xcode log lines: ${lines.length}`);
console.log('');

function findLines(pattern, label, limit = 30) {
  const matches = [];
  const re = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) {
      matches.push({ idx: i, line: lines[i] });
      if (matches.length >= limit) break;
    }
  }
  console.log(`=== ${label} (${matches.length} found, showing first ${Math.min(limit, matches.length)}) ===`);
  for (const m of matches) {
    let l = m.line;
    if (l.length > 280) l = l.substring(0, 280) + '...';
    console.log(`  [${m.idx}] ${l}`);
  }
  console.log('');
  return matches;
}

// Linker errors
findLines(/Undefined symbols|ld:.*error|ld:.*warning|framework not found|library not found|duplicate symbol|cannot find|module .* not found/, 'LINKER ERRORS / WARNINGS');

// Linking phase - what frameworks are being linked
findLines(/Ld .*\.app\/.*\s/, 'LD COMMANDS (final binary linking)');
findLines(/-framework /, 'FRAMEWORK FLAGS', 50);
findLines(/-l(Expo|EX|ReactNative|Pods)/, 'LIBRARY FLAGS (Expo/RN/Pods)', 50);

// Final code signing
findLines(/CodeSign /, 'CODE SIGN STEPS');

// Embed frameworks phase
findLines(/Embed Frameworks|Copy Files Phase|PBXCopyFilesBuildPhase/, 'EMBED FRAMEWORKS PHASES');
findLines(/Codesign .*\.framework|EmbedAppExtensions|CopyPNG|CopyEmbedded|CompileSwift|CompileObjC/, 'BINARY OPS', 20);

// Errors in general
findLines(/^.*error:/, 'COMPILATION ERRORS', 30);
findLines(/warning:.*main\.\w+/, 'WARNINGS IN MAIN', 20);

// Specific Expo module compilation
findLines(/Compile.*ExpoModulesCore|Compile.*EXConstants|Compile.*ExpoConstants|Compile.*ExpoFont|Compile.*ExpoAsset/, 'EXPO MODULE COMPILE STEPS', 30);

// Embedding/linking specifically
findLines(/PBXNative|XCFramework|EmbeddingProvisioningProfile|Embedded\.mobileprovision/, 'EMBEDDING ARTIFACTS', 20);

// Final archive
findLines(/CopySwiftLibs|GenerateAssetSymbols|CompileXIB|CompileStoryboard|GenerateInfoPlistFile/, 'FINAL ARCHIVE STEPS', 20);

// Expo autolinking output
findLines(/expo-modules-autolinking|Expo Autolinking|autolinking|AutolinkedModules/, 'AUTOLINKING REFERENCES', 30);

// Look for "modules" listings
findLines(/Detected expo|Adding.*to ReactCodegen|module map|defines_module/, 'MODULE DETECTION', 20);

// Check Podfile output
findLines(/installing|Installing/, 'INSTALL LINES', 50);
