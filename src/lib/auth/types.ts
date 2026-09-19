import type { ActiveMembership } from "./active-membership";

// Module augmentation for next-auth's Session/JWT shapes. Kept separate from
// auth.ts so it can be imported purely for its types without pulling in the
// NextAuth config itself.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isPlatformAdmin: boolean;
      activeMembership: ActiveMembership;
    };
  }
}

// next-auth/jwt.d.ts just re-exports from @auth/core/jwt with no local
// declarations of its own, which TypeScript's module augmentation can't
// resolve through - augmenting the underlying @auth/core/jwt module (which
// next-auth's own JWT callback type ultimately comes from) is what actually
// takes effect.
declare module "@auth/core/jwt" {
  interface JWT {
    userId?: string;
    isPlatformAdmin?: boolean;
    activeMembership?: ActiveMembership;
  }
}
