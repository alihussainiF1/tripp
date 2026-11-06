import type { SVGProps } from "react";

/** tripp wordmark. Kept under the upstream file name so every importer keeps working. */
export function T3Wordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 120 40" xmlns="http://www.w3.org/2000/svg">
      <text
        x="0"
        y="32"
        fill="currentColor"
        fontFamily="Inter Variable, Inter, system-ui, sans-serif"
        fontSize="38"
        fontWeight="700"
        letterSpacing="-1.5"
      >
        tripp
      </text>
    </svg>
  );
}
