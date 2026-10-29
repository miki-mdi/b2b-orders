import Image from "next/image";

const SIZE_MAP = {
  sm: "w-44 sm:w-56",
  md: "w-64 sm:w-80",
  lg: "w-64 sm:w-96",
} as const;

export type AppLogoSize = keyof typeof SIZE_MAP;

export function AppLogo({
  size = "md",
  className = "",
}: {
  size?: AppLogoSize;
  className?: string;
}) {
  return (
    <div className={`relative aspect-[5/1] shrink-0 overflow-hidden rounded-md ${SIZE_MAP[size]} ${className}`}>
      <Image
        src="/brand/venordo-logo-transparent.png"
        alt="Venordo — B2B Ordering Platform"
        fill
        sizes="(max-width: 640px) 256px, 384px"
        className="venordo-logo object-cover"
      />
    </div>
  );
}
