import { createClient } from "@supabase/supabase-js";

import { settings } from "./config.js";

/**
 * The indexer reaches Postgres as the service role, which is the only role
 * allowed to write a derived table.
 *
 * It holds no Stellar key and signs nothing. That is the line the whole product
 * rests on: this process can write what the chain said, and it cannot make the
 * chain say anything.
 */
export const db = createClient(settings.supabaseUrl, settings.serviceRoleKey, {
  auth: { persistSession: false },
});
