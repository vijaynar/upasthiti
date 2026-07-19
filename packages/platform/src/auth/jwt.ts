import jwt from 'jsonwebtoken';

// Our own session JWT (Doc 05 §6) — RS256, signed with the keypair from
// `npm run keys:generate`. Supabase's tokens never reach the client;
// this is what actually authenticates every API request. No roles in the
// claims (Doc 04 §10) — only who and which workspace.

export interface AccessTokenClaims {
  sub: string; // user_id
  sid: string; // session id
  org: string | null; // active workspace, Doc 05 §7
  amr: string[]; // auth methods used this session
  mfa: boolean;
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function decodeKey(envVar: 'JWT_PRIVATE_KEY' | 'JWT_PUBLIC_KEY'): string {
  const b64 = process.env[envVar];
  if (!b64) {
    throw new Error(`[platform/auth/jwt] Missing ${envVar}. Run \`npm run keys:generate\`.`);
  }
  return Buffer.from(b64, 'base64').toString('utf8');
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, decodeKey('JWT_PRIVATE_KEY'), {
    algorithm: 'RS256',
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  return jwt.verify(token, decodeKey('JWT_PUBLIC_KEY'), { algorithms: ['RS256'] }) as unknown as AccessTokenClaims;
}
