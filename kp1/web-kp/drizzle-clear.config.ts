import type { Config } from "drizzle-kit";

export default {
  schema: "./node_modules/@keypears/api-server/src/db/clear-schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://keypears:keypears_dev@localhost:5432/keypears_main",
  },
} satisfies Config;
