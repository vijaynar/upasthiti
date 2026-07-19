// @abhyas/platform — the ONLY package allowed to import provider SDKs
// (@supabase/*, pg, razorpay, ...). Business modules and apps import these
// adapter interfaces, never the providers behind them (Doc 14 §7, lint-enforced).

export * as db from './db';
export * as queue from './queue';
export * as auth from './auth';
export * as storage from './storage';
export * as notify from './notify';
export * as payments from './payments';
export * as kms from './kms';
