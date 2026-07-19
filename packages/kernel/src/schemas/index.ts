// Zod schema barrel (Doc 09/API §14 — request/response shapes shared by
// server validation, client SDK types, and the generated OpenAPI spec).
// Populated module-by-module starting Phase 2; re-exported here so
// consumers only ever import from '@abhyas/kernel/schemas'.
export { z } from 'zod';
