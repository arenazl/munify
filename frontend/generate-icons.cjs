const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [16, 32, 72, 96, 128, 144, 152, 192, 384, 512];
const inputImage = path.join(__dirname, 'src/assets/munify_logo.png');
const outputDir = path.join(__dirname, 'public/icons');

async function generateIcons() {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
    await sharp(inputImage)
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(outputPath);
    console.log(`Generated: icon-${size}x${size}.png`);
  }

  // Also generate favicon.ico (32x32)
  await sharp(inputImage)
    .resize(32, 32)
    .png()
    .toFile(path.join(__dirname, 'public/favicon.png'));
  console.log('Generated: favicon.png');

  // Generate apple-touch-icon (180x180)
  await sharp(inputImage)
    .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(path.join(__dirname, 'public/apple-touch-icon.png'));
  console.log('Generated: apple-touch-icon.png');

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
