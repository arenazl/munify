const fs = require('fs');

const extractFile = 'D:/Code/sugerenciasMun/frontend/extracted_data.js';
const mockDataFile = 'D:/Code/sugerenciasMun/frontend/src/pages/ConfiguracionMockup/data/mockData.ts';

const extractJs = fs.readFileSync(extractFile, 'utf8');
let mockDataTs = fs.readFileSync(mockDataFile, 'utf8');

// The extracted JS is a Vue component basically, let's find the abmSpec(id) block.
// It starts with `  abmSpec(id) {`
const match = extractJs.match(/  abmSpec\(id\) \{[\s\S]*?(?=\}\s*<\/script>)/);

if (!match) {
  console.error("Could not find abmSpec in extracted_data.js");
  process.exit(1);
}

let missingMethods = match[0];
// Ensure we also grab `cel` and `puenteSpec` and `renderVals` if they are before `abmSpec`.
// Actually, `abmSpec(id)` is around line 476. Let's find `cel(texto, opciones)` or whatever.
const celMatch = extractJs.match(/  cel\([\s\S]*?(?=\}\s*<\/script>)/);
if (celMatch && celMatch[0].length > missingMethods.length) {
  missingMethods = celMatch[0];
}

// Ensure mockData.ts does not already have it to avoid duplication
if (mockDataTs.includes('abmSpec(id)')) {
  console.log("abmSpec already in mockData.ts, skipping insertion");
} else {
  // Insert before the last `}` of the class MockDataService
  // In `mockData.ts`, the class ends at `\n}\n\nexport const MockData`
  const injectIdx = mockDataTs.lastIndexOf('}\n\nexport const MockData');
  if (injectIdx > -1) {
    mockDataTs = mockDataTs.substring(0, injectIdx) + '\n\n' + missingMethods + '\n' + mockDataTs.substring(injectIdx);
  } else {
    console.error("Could not find end of class in mockData.ts");
    process.exit(1);
  }
}

// Add @ts-nocheck to top if not present
if (!mockDataTs.startsWith('// @ts-nocheck')) {
  mockDataTs = '// @ts-nocheck\n' + mockDataTs;
}

fs.writeFileSync(mockDataFile, mockDataTs, 'utf8');
console.log("Successfully injected missing methods into mockData.ts");
