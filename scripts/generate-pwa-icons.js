/**
 * Generate PWA icons programmatically
 * Run with: node scripts/generate-pwa-icons.js
 * Requires: npm install sharp
 */

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, 'client/public');

const sizes = [
  { size: 192, name: 'icon-192x192.png' },
  { size: 512, name: 'icon-512x512.png' },
  { size: 512, name: 'icon-maskable-512x512.png', maskable: true }
];

async function generateIcons() {
  try {
    console.log('Generating PWA icons with Isra Hardware branding...');

    for (const { size, name, maskable } of sizes) {
      const outputPath = path.join(outputDir, name);
      
      // Create blue background with rounded corners
      const iconSize = maskable ? Math.floor(size * 0.8) : size;
      const padding = maskable ? Math.floor(size * 0.1) : 0;
      
      // Create the main icon (blue rounded rectangle with IH text)
      const svgIcon = `
        <svg width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${iconSize}" height="${iconSize}" rx="${iconSize * 0.25}" fill="#2563eb"/>
          <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" 
                font-family="Arial, sans-serif" font-weight="bold" 
                font-size="${iconSize * 0.4}" fill="white">IH</text>
        </svg>
      `;

      if (maskable) {
        // For maskable icons, create a full blue background with the icon centered
        const svgMaskable = `
          <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
            <rect width="${size}" height="${size}" fill="#2563eb"/>
            <foreignObject x="${padding}" y="${padding}" width="${iconSize}" height="${iconSize}">
              <div xmlns="http://www.w3.org/1999/xhtml">
                ${svgIcon}
              </div>
            </foreignObject>
          </svg>
        `;
        await sharp(Buffer.from(svgMaskable)).png().toFile(outputPath);
      } else {
        await sharp(Buffer.from(svgIcon)).png().toFile(outputPath);
      }

      console.log(`✓ Generated ${name} (${size}x${size})`);
    }

    console.log('\n✓ All PWA icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    process.exit(1);
  }
}

generateIcons();
