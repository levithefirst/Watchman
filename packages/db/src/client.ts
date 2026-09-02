import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { watchmanPrisma?: PrismaClient };
export const db = globalForPrisma.watchmanPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.watchmanPrisma = db;
export default db;
