"use server";

import { AuthError } from "next-auth";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { signIn } from "@/lib/auth/auth";
import { signInSchema } from "@/lib/validation/auth";

export async function signInAction(formData: FormData) {
  const locale = await getLocale();

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect({ href: "/sign-in?error=1", locale });
    return;
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      redirect({ href: "/sign-in?error=1", locale });
      return;
    }
    throw error;
  }

  redirect({ href: "/", locale });
}
