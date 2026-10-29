// Shared with facility-client/src/components/Icon.tsx. Keep the two files identical.

import { ICON_PATHS, type IconName } from './icon-paths';

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}

/** The logo mark (assets/brand/emergency-tracka-mark.svg). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="216 108.3 180 180" aria-hidden="true" focusable="false">
      <path
        fill="var(--brand)"
        d="M306 113.09c-40.09 0-70.15 30.07-70.15 67.65C235.85 225.83 306 283.45 306 283.45s70.15-57.62 70.15-102.71c0-37.58-30.06-67.65-70.15-67.65Z"
      />
      <circle cx="306" cy="180.74" r="42.59" fill="var(--logo-hole)" />
      <rect x="295.98" y="153.18" width="20.04" height="55.11" rx="3.76" fill="var(--brand)" />
      <rect x="278.44" y="170.71" width="55.12" height="20.05" rx="3.76" fill="var(--brand)" />
    </svg>
  );
}

export type { IconName };
