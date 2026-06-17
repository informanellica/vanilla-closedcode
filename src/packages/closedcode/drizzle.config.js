/** @file Drizzle Kit configuration: points the SQLite migration generator at the *.sql.ts schema files and the local closedcode.db database. */
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/**/*.sql.ts",
  out: "./migration",
  dbCredentials: {
    url: "/home/thdxr/.local/share/closedcode/closedcode.db"
  }
});