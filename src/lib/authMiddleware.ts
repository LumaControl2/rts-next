// ============================================================
// RT NEXT — Auth Middleware Helper
// ============================================================

import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth';

/**
 * Extract and verify the JWT from the Authorization header.
 * Returns { userId } if valid, null otherwise.
 */
export async function getUserFromRequest(
  request: NextRequest
): Promise<{ userId: string } | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  return verifyToken(token);
}
