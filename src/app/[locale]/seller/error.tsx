"use client";

import { RouteErrorBoundary } from "@/components/route-error-boundary";

export default function SellerError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <RouteErrorBoundary error={error} retry={retry} />;
}
