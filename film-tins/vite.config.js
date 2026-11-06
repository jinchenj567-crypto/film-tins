import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { defineConfig } from 'vite';

// Lists every file of the finished site, so the page can pack a copy of itself for 「导出成网站」.
// Photos are left out: the export adds only the ones its tins use.
function siteFiles() {
  let outDir;
  return {
    name: 'site-files',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const files = [];
      const walk = (dir) => {
        for (const name of readdirSync(dir)) {
          const full = join(dir, name);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(relative(outDir, full).split(sep).join('/'));
        }
      };
      walk(outDir);
      const kept = files.filter((f) => !f.startsWith('photos/') && f !== 'site-files.json' && f !== 'content.json' && !f.endsWith('.woff'));
      writeFileSync(join(outDir, 'site-files.json'), JSON.stringify(kept));
    },
  };
}

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 900 },
  plugins: [siteFiles()],
});
