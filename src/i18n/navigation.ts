import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Locale-aware equivalents of next/navigation's Link/redirect/usePathname/useRouter -
// use these instead of the plain next/navigation versions anywhere a URL needs
// to carry the current locale prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
