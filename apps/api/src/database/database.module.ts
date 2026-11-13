import { Global, Module } from "@nestjs/common";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type {
  ExtractTablesFromSchema,
  ExtractTablesWithRelations,
} from "drizzle-orm";
import * as schema from "./schemas";
import { createDatabasePool, createDrizzleClient } from "./database.connection";

export const DATABASE_CONNECTION = "DATABASE_CONNECTION";

export type DrizzleDB = NodePgDatabase<
  ExtractTablesWithRelations<
    Record<string, never>,
    ExtractTablesFromSchema<typeof schema>
  >
>;

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (): DrizzleDB => {
        const pool = createDatabasePool();
        return createDrizzleClient(pool);
      },
    },
  ],
  exports: [DATABASE_CONNECTION],
})
export class DatabaseModule {}
