import { createRemoteJWKSet, jwtVerify } from 'jose'

export interface AuthContext {
  userId: string
}

export type TokenVerifier = (token: string) => Promise<AuthContext>

/** Verifies JWTs against the Better Auth JWKS endpoint (cached by jose). */
export function makeJwksVerifier(jwksUrl: string): TokenVerifier {
  const jwks = createRemoteJWKSet(new URL(jwksUrl))
  return async (token) => {
    const { payload } = await jwtVerify(token, jwks)
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('token has no subject')
    }
    return { userId: payload.sub }
  }
}
