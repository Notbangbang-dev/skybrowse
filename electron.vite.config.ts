import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
    main: {},
    preload: {
        build: {
            rollupOptions: {
                input: {
                    index: path.resolve(__dirname, "src/preload/index.ts"),
                    builtin: path.resolve(__dirname, "src/preload/builtin.ts")
                }
            }
        }
    },
    renderer: {
        plugins: [react()]
    }
});
