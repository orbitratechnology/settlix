import { randomBytes } from "node:crypto"

/**
 * The customer's status link token: 32 random bytes as 64 hex characters. It is
 * the only thing that opens a request's status page, so it is never derived
 * from anything guessable.
 */
export function newStatusToken(): string {
  return randomBytes(32).toString("hex")
}

const TOKEN = /^[a-f0-9]{64}$/

export function isStatusToken(value: string): boolean {
  return TOKEN.test(value)
}
