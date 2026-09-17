import { NextResponse } from 'next/server'

import { adminUserId } from '@/lib/admin'

/**
 * Whether the caller is an admin, for the Admin link on Profile. The role is
 * never synced to the device, so Profile has to ask; it is a hint for that one
 * link, and `/admin` checks the database again on every read.
 */
export async function GET() {
  return NextResponse.json(
    { admin: (await adminUserId()) !== null },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
