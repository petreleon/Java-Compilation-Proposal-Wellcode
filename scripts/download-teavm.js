const fs = require('fs');
const path = require('path');
const https = require('https');

const VENDOR_DIR = path.resolve(__dirname, '..', 'vendor');
const BASE_URL = 'https://repo1.maven.org/maven2/org/teavm';

const TEA_VERSION = '0.12.3';
const JARS = [
  'teavm-cli',
  'teavm-core',
  'teavm-classlib',
  'teavm-tooling',
  'teavm-platform',
  'teavm-interop',
  'teavm-jso',
  'teavm-jso-impl',
  'teavm-jso-apis',
  'teavm-metaprogramming-api',
  'teavm-metaprogramming-impl',
  'teavm-relocated-libs-asm',
  'teavm-relocated-libs-asm-analysis',
  'teavm-relocated-libs-asm-commons',
  'teavm-relocated-libs-asm-tree',
  'teavm-relocated-libs-asm-util',
  'teavm-relocated-libs-commons-cli',
  'teavm-relocated-libs-commons-io',
  'teavm-relocated-libs-hppc',
  'teavm-relocated-libs-rhino',
];

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${url}`));
          return;
        }
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      })
      .on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(VENDOR_DIR)) {
    fs.mkdirSync(VENDOR_DIR, { recursive: true });
  }

  const missing = [];
  for (const jar of JARS) {
    const filename = `${jar}-${TEA_VERSION}.jar`;
    const dest = path.join(VENDOR_DIR, filename);
    if (!fs.existsSync(dest)) {
      missing.push({ jar, filename, dest });
    }
  }

  if (missing.length === 0) {
    console.log('All TeaVM jars already present.');
    return;
  }

  console.log(`Downloading ${missing.length} TeaVM ${TEA_VERSION} jars...`);
  for (const { jar, filename, dest } of missing) {
    const url = `${BASE_URL}/${jar}/${TEA_VERSION}/${filename}`;
    process.stdout.write(`  ${filename} ... `);
    try {
      await download(url, dest);
      console.log('OK');
    } catch (e) {
      console.log(`FAIL: ${e.message}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log('Done.');
}

main();
