import dotenv from "dotenv";
import path from "path";

if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: path.resolve(__dirname, ".env.test"), override: true });
} else if (process.env.NODE_ENV === "development" || process.env.DOTENV_CONFIG_PATH?.includes(".env.development")) {
  dotenv.config({ path: path.resolve(__dirname, ".env.development"), override: true });
} else {
  dotenv.config();
}

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // CLI uses the DIRECT (non-pooled) URL; falls back to DATABASE_URL for local development.
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"] || "",
  },
});
