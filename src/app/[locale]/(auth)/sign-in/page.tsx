import { getTranslations } from "next-intl/server";
import { signInAction } from "./actions";
import { PasswordField } from "./password-field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { FormField, inputStyles } from "@/components/ui/form-field";
import { AppLogo } from "@/components/brand/app-logo";
import { CompactLocaleSwitcher } from "@/components/compact-locale-switcher";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const t = await getTranslations("signIn");
  const { error } = await searchParams;

  return (
    <div className="flex flex-1 items-center justify-center bg-muted p-4 sm:p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex w-full justify-end">
          <CompactLocaleSwitcher />
        </div>

        <AppLogo />

        <Card className="w-full p-6 sm:p-8">
          <form action={signInAction} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1 text-center">
              <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
              <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
            </div>

            {error ? <Alert tone="danger">{t("error")}</Alert> : null}

            <FormField label={t("email")} htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className={inputStyles}
              />
            </FormField>

            <PasswordField />

            <Button type="submit" className="mt-1 w-full">
              {t("submit")}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
