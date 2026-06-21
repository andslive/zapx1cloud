import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
        env.VITE_SUPABASE_URL || "https://rbzekjfufhqjpjmjgwmb.supabase.co"
      ),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
        env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_tSWzJzuhEreifz0MfVZgBQ_CCGcrmwJ"
      ),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(
        env.VITE_SUPABASE_PROJECT_ID || "rbzekjfufhqjpjmjgwmb"
      ),
    },
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      chunkSizeWarningLimit: 1500,
      // IMPORTANT: do NOT manually split React / Radix / etc. into separate chunks.
      // The previous manualChunks config produced a circular dependency
      // (ui-vendor -> react-vendor -> ui-vendor) which, in production builds,
      // caused `ui-vendor` to evaluate before React exports were ready, throwing
      // `Cannot read properties of undefined (reading 'forwardRef')` and leaving
      // the app stuck on the boot loader (black screen + green spinner).
      // Letting Rollup decide chunking is safe and avoids this class of bug.
    },
  };
});
