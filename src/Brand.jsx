import { useId } from "react";

export function BrandMark({ className }) {
  const gradientId = `silver${useId().replace(/:/g, "")}`;
  return (
    <svg className={className} viewBox="0 0 120 156" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f7f7f7" />
          <stop offset="42%" stopColor="#b0b0b0" />
          <stop offset="100%" stopColor="#3c3c3c" />
        </linearGradient>
      </defs>
      <circle
        cx="60"
        cy="48"
        r="30"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="16"
      />
      <circle
        cx="60"
        cy="108"
        r="32"
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="16"
      />
      <g transform="translate(60 78)">
        <polygon points="0,0 -5,-40 0,-52" fill="#111" />
        <polygon points="0,0 5,-40 0,-52" fill="#4c4c4c" />
        <polygon points="0,0 -5,40 0,52" fill="#111" />
        <polygon points="0,0 5,40 0,52" fill="#4c4c4c" />
        <polygon points="0,0 -40,-5 -52,0" fill="#111" />
        <polygon points="0,0 -40,5 -52,0" fill="#4c4c4c" />
        <polygon points="0,0 40,-5 52,0" fill="#111" />
        <polygon points="0,0 40,5 52,0" fill="#4c4c4c" />
      </g>
    </svg>
  );
}
