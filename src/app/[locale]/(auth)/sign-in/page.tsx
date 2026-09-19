import { getTranslations } from "next-intl/server";
import { signInAction } from "./actions";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("signIn");
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <form action={signInAction} className="flex w-full max-w-sm flex-col gap-4">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {error ? <p className="text-sm text-red-600">{t("error")}</p> : null}
        <label className="flex flex-col gap-1 text-sm">
          {t("email")}
          <input name="email" type="email" required className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("password")}
          <input
            name="password"
            type="password"
            required
            className="rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700"
          />
        </label>
        <button type="submit" className="rounded bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
          {t("submit")}
        </button>
      </form>
    </div>
  );
}
