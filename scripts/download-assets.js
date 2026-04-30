const fs = require('fs');
const path = require('path');
const https = require('https');

const ASSETS = [
  {
    url: 'https://repo1.maven.org/maven2/org/eclipse/jdt/ecj/3.42.0/ecj-3.42.0.jar',
    dest: path.join(__dirname, '..', 'vendor', 'ecj-3.42.0.jar'),
  },
  {
    url: 'https://github.com/plasma-umass/doppio-demo/raw/gh-pages/doppio_home.zip',
    dest: path.join(__dirname, '..', 'public', 'doppio', 'doppio_home.zip'),
  },
  {
    url: 'https://raw.githubusercontent.com/plasma-umass/doppio-demo/gh-pages/js/doppio.js',
    dest: path.join(__dirname, '..', 'public', 'doppio', 'doppio.js'),
  },
  {
    url: 'https://raw.githubusercontent.com/plasma-umass/doppio-demo/gh-pages/js/browserfs.min.js',
    dest: path.join(__dirname, '..', 'public', 'doppio', 'browserfs.min.js'),
  },
];

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'node' } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(undefined);
      });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  let downloaded = 0;
  let skipped = 0;

  for (const asset of ASSETS) {
    const dir = path.dirname(asset.dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (fs.existsSync(asset.dest)) {
      console.log(`[skip] ${path.basename(asset.dest)} already exists`);
      skipped++;
      continue;
    }

    console.log(`[downloading] ${path.basename(asset.dest)} from ${asset.url}`);
    try {
      await downloadFile(asset.url, asset.dest);
      console.log(`[done] ${path.basename(asset.dest)}`);
      downloaded++;
    } catch (err) {
      console.error(`[error] Failed to download ${path.basename(asset.dest)}:`, err.message);
      process.exit(1);
    }
  }

  console.log(`\nAssets ready: ${downloaded} downloaded, ${skipped} skipped.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
