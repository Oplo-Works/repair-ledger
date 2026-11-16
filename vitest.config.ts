import { defineConfig } from "vitest/config";
// Unit tests only (src/**). Firestore Rules tests live in tests/ and require the emulator (npm run test:rules).
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
