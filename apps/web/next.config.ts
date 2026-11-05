import type { NextConfig } from "next";

try {
  process.loadEnvFile("../../.env");
} catch {
  // production passes env directly
}

const config: NextConfig = {};
export default config;
