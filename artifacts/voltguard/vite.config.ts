import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';

const rawPort = process.env.PORT ?? '5000';

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const rawApiPort = process.env.API_PORT ?? '8080';
const apiPort = Number(rawApiPort);

if (Number.isNaN(apiPort) || apiPort <= 0) {
  throw new Error(`Invalid API_PORT value: "${rawApiPort}"`);
}

const apiServerUrl =
  process.env.API_SERVER_URL ?? `http://127.0.0.1:${apiPort}`;

function normalizeBasePath(value: string | undefined): string {
  const trimmed = value?.trim() ?? "";

  if (trimmed === "" || trimmed === "." || trimmed === "./") {
    return "/";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${withLeadingSlash.replace(/\/+$/, "")}/`;
}

const basePath = normalizeBasePath(process.env.BASE_PATH);
const isProductionBuild =
  process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

function manualChunks(id: string): string | undefined {
  const normalizedId = id.replace(/\\/g, '/');

  if (!normalizedId.includes('/node_modules/')) return undefined;
  if (
    normalizedId.includes('/node_modules/react/') ||
    normalizedId.includes('/node_modules/react-dom/') ||
    normalizedId.includes('/node_modules/scheduler/')
  ) {
    return 'vendor-react';
  }
  if (normalizedId.includes('/node_modules/@radix-ui/')) {
    return 'vendor-radix';
  }
  if (normalizedId.includes('/node_modules/recharts/')) {
    return 'vendor-charts';
  }
  if (normalizedId.includes('/node_modules/framer-motion/')) {
    return 'vendor-motion';
  }
  if (
    normalizedId.includes('/node_modules/lucide-react/') ||
    normalizedId.includes('/node_modules/react-icons/')
  ) {
    return 'vendor-icons';
  }
  if (
    normalizedId.includes('/node_modules/@tanstack/react-query/') ||
    normalizedId.includes('/node_modules/date-fns/') ||
    normalizedId.includes('/node_modules/zod/')
  ) {
    return 'vendor-data';
  }
  if (normalizedId.includes('/node_modules/firebase/')) {
    return 'vendor-firebase';
  }

  return undefined;
}

export default defineConfig({
  base: basePath,
  define: {
    // Vite natively loads VITE_* variables from the active environment.
    // Do not redefine the API variables here: an empty process.env fallback
    // would overwrite a value loaded by Vite and make the client appear
    // unconfigured even when the secret exists in Replit Secrets.
    'import.meta.env.VITE_FIREBASE_WEB_API_KEY': JSON.stringify(
      process.env.FIREBASE_WEB_API_KEY ?? '',
    ),
    'import.meta.env.VITE_FIREBASE_PROJECT_ID': JSON.stringify(
      process.env.FIREBASE_PROJECT_ID ?? '',
    ),
    'import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID': JSON.stringify(
      process.env.FIREBASE_MESSAGING_SENDER_ID ?? '',
    ),
    'import.meta.env.VITE_FIREBASE_APP_ID': JSON.stringify(
      process.env.FIREBASE_APP_ID ?? '',
    ),
    'import.meta.env.VITE_FIREBASE_VAPID_KEY': JSON.stringify(
      process.env.FIREBASE_VAPID_KEY ?? '',
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(isProductionBuild ? [] : [runtimeErrorOverlay()]),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist'),
    emptyOutDir: true,
    // Production source maps are not needed for the static Vercel bundle and
    // can produce misleading original-location warnings for transformed
    // Radix/Shadcn components.
    sourcemap: false,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Vite/Rollup can report source-map locations from transformed
        // Radix/Shadcn modules even when production sourcemaps are disabled.
        // There is no browser sourcemap to consume in this build, so ignore
        // only this non-actionable diagnostic and keep all other warnings.
        if (warning.code === 'SOURCEMAP_ERROR') return;
        defaultHandler(warning);
      },
      output: {
        manualChunks,
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': {
        target: apiServerUrl,
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
});
