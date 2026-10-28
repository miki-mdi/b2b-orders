/**
 * Core decision logic for prisma/reset-local-seller-password.ts: update
 * exactly one existing user's passwordHash, never create or delete
 * anything. Takes a narrow, structurally mockable client interface (same
 * style as pilot-buyer-service.ts's PilotBuyerTxClient) so this logic can
 * be unit-tested with plain mocks and no real database connection.
 */
export class ResetSellerPasswordError extends Error {}

export type ResetSellerPasswordClient = {
  user: {
    findUnique: (args: { where: { email: string } }) => Promise<{ id: string } | null>;
    update: (args: {
      where: { id: string };
      data: { passwordHash: string };
    }) => Promise<{ id: string; email: string }>;
  };
};

export type ResetSellerPasswordResult = { userId: string; email: string };

export async function resetSellerPassword(
  db: ResetSellerPasswordClient,
  email: string,
  passwordHash: string
): Promise<ResetSellerPasswordResult> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    throw new ResetSellerPasswordError(
      `No user found with email "${email}". Refusing to create one - this script only resets an existing ` +
        'account\'s password (run "npm run db:seed" first if this is a fresh local database).'
    );
  }

  const updated = await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  return { userId: updated.id, email: updated.email };
}
