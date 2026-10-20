import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // Demonstração publicada: nomes de arquivo fixos (sem hash), para cada publicação substituir os mesmos caminhos.
  build: process.env.VITE_ROUTER === "memory" ? { rollupOptions: { output: { entryFileNames: "assets/[name].js", chunkFileNames: "assets/[name].js", assetFileNames: "assets/[name][extname]" } } } : undefined,
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
