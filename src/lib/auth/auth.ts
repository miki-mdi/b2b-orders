import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prismaBase } from "@/lib/db/prisma";
import { verifyPassword } from "./password";
import { resolveActiveMembership } from "./active-membership";
import "./types";

/**
 * ARCHITECTURAL NOTE - discovered during Phase 0 implementation, documented
 * here and in docs/SECURITY_AND_MULTI_TENANCY.md §5 and docs/ARCHITECTURE.md:
 *
 * docs/ARCHITECTURE.md originally called for "database-backed sessions, not
 * stateless-only JWT" specifically so a deactivated user or suspended tenant
 * could be revoked immediately. Auth.js (both v4 and v5) hard-requires
 * `session.strategy: "jwt"` when a Credentials provider is used - there is no
 * supported way to get database-persisted sessions out of a username/password
 * sign-in, because the adapter's session-creation path is only wired up for
 * provider flows (OAuth) that go through `signIn` with an account to persist.
 *
 * Resolution adopted here: use JWT sessions (required), but re-resolve the
 * user's active membership from the database on the `jwt` callback of EVERY
 * request, not just at sign-in. A deactivated user, a revoked membership, or
 * a suspended tenant is therefore reflected on the very next request, which
 * delivers the same practical guarantee the original design wanted
 * (near-immediate revocation) even though the transport is a signed JWT
 * rather than a session row that gets deleted. The `Session`/`Account` Prisma
 * models stay in the schema, unused for now, for when an OAuth/SSO provider
 * is added (see docs/OPEN_QUESTIONS.md) - that flow WOULD use true database
 * sessions via @auth/prisma-adapter.
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === "string" ? credentials.email : undefined;
        const password = typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        const user = await prismaBase.user.findUnique({ where: { email } });
        if (!user || !user.isActive) return null;

        const validPassword = await verifyPassword(password, user.passwordHash);
        if (!validPassword) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const userId = user?.id ?? token.userId;
      if (!userId) return token;

      const identity = await resolveActiveMembership(userId);
      if (!identity.isActive) {
        // Deactivated since the last request - drop everything from the
        // token so the session callback below treats this as signed out.
        return {};
      }

      token.userId = userId;
      token.isPlatformAdmin = identity.isPlatformAdmin;
      token.activeMembership = identity.activeMembership;
      return token;
    },
    async session({ session, token }) {
      if (!token.userId) {
        // Revoked mid-session (see jwt callback above). Returning the
        // session without a usable id causes consumers that check
        // session.user.id to correctly treat this as unauthenticated.
        return { ...session, user: undefined } as unknown as typeof session;
      }

      session.user.id = token.userId;
      session.user.isPlatformAdmin = token.isPlatformAdmin ?? false;
      session.user.activeMembership = token.activeMembership ?? null;
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
  },
});
