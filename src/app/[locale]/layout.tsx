import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import Script from "next/script";
import { routing } from "@/i18n/routing";
import "../globals.css";

export const metadata: Metadata = {
  title: "B2B Orders",
  description: "Multi-tenant B2B ordering platform",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Runs before paint (blocking inline script, no external file) so a
// previously-saved manual theme choice applies immediately - avoids a
// flash of the wrong theme. Mirrors src/components/theme-toggle.tsx's
// storage key/values exactly. Absent/invalid storage, or storage access
// blocked (private browsing etc.), leaves data-theme unset - behavior then
// falls through to the plain @media (prefers-color-scheme) rule in
// globals.css, i.e. pure system preference, same as before this existed.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var v = localStorage.getItem("b2b-orders-theme");
    if (v === "light" || v === "dark") {
      document.documentElement.setAttribute("data-theme", v);
    }
  } catch (e) {}
})();
`;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enables static rendering for this request's locale - see next-intl docs.
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* next/script's beforeInteractive strategy is the documented,
            correct way to run a blocking script before hydration/paint -
            a plain <script> element here is only reliably executed on an
            initial hard navigation, not on every client-side render. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
