import { build } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');

async function runBuild() {
  console.log('🚀 Starting AutoFlow Extension Build...');

  // 1. Build HTML UI pages (Editor, Sidepanel, Popup)
  console.log('📦 Building UI pages (Editor, Side Panel, Popup)...');
  await build({
    root: rootDir,
    plugins: [react()],
    base: '',
    build: {
      outDir: distDir,
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: path.resolve(rootDir, 'index.html'),
          sidepanel: path.resolve(rootDir, 'sidepanel.html'),
          popup: path.resolve(rootDir, 'popup.html'),
          sandbox: path.resolve(rootDir, 'sandbox.html'),
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
  });

  // 2. Build Background Service Worker (ES module)
  console.log('⚙️ Building Background Service Worker...');
  await build({
    root: rootDir,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      lib: {
        entry: path.resolve(rootDir, 'src/background/index.ts'),
        name: 'background',
        formats: ['es'],
        fileName: () => 'background.js',
      },
      rollupOptions: {
        output: {
          entryFileNames: 'background.js',
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
  });

  // 3. Build Content Script (IIFE for in-page isolation)
  console.log('🔍 Building Content Script & Picker...');
  await build({
    root: rootDir,
    build: {
      outDir: distDir,
      emptyOutDir: false,
      lib: {
        entry: path.resolve(rootDir, 'src/content/index.ts'),
        name: 'AutoFlowContent',
        formats: ['iife'],
        fileName: () => 'content.js',
      },
      rollupOptions: {
        output: {
          entryFileNames: 'content.js',
          assetFileNames: (chunkInfo) => {
            if (chunkInfo.name && chunkInfo.name.endsWith('.css')) {
              return 'content.css';
            }
            return '[name].[ext]';
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, 'src'),
      },
    },
  });

  // 4. Copy Manifest and Icons
  console.log('📋 Copying manifest.json, sandbox.html and icons...');
  fs.copyFileSync(path.resolve(rootDir, 'manifest.json'), path.resolve(distDir, 'manifest.json'));
  fs.copyFileSync(path.resolve(rootDir, 'sandbox.html'), path.resolve(distDir, 'sandbox.html'));

  const iconsSrcDir = path.resolve(rootDir, 'public/icons');
  const iconsDistDir = path.resolve(distDir, 'icons');
  if (fs.existsSync(iconsSrcDir)) {
    fs.mkdirSync(iconsDistDir, { recursive: true });
    for (const file of fs.readdirSync(iconsSrcDir)) {
      fs.copyFileSync(path.resolve(iconsSrcDir, file), path.resolve(iconsDistDir, file));
    }
  }

  console.log('✅ Extension build completed successfully! Unpacked extension ready at dist/');
}

runBuild().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
