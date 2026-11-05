// fix-png-format.js
// The z-ai image API returns JPEG-encoded bytes even when saved with a .png
// extension. This re-encodes every crab image to a genuine PNG so the file
// format matches the .png extension (valid for game engines and preserves
// the soft rounded-square background the prompts requested).

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const DIR = '/home/z/my-project/download/art/crabs';

(async () => {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png'));
  console.log(`Re-encoding ${files.length} images to genuine PNG...\n`);
  for (const f of files) {
    const p = path.join(DIR, f);
    const before = fs.statSync(p).size;
    const buf = fs.readFileSync(p);
    // sharp auto-detects input format (JPEG here) and outputs PNG.
    const out = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(p, out);
    console.log(`  ${f}: ${before} -> ${out.length} bytes (PNG)`);
  }
  console.log('\nDone.');
})().catch((e) => { console.error(e); process.exit(1); });
