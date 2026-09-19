import React from "react";

interface FlowFuelLogoProps {
  size?: number;
  showWordmark?: boolean;
}

export function FlowFuelLogo({ size = 28, showWordmark = true }: FlowFuelLogoProps) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", flexShrink: 0 }}
      >
        {/* Charcoal Squircle Backdrop */}
        <rect width="32" height="32" rx="7.5" fill="#201515" />

        {/* Vertical Non-Custodial Spine (Pure White) */}
        <rect x="6.5" y="6.5" width="4.5" height="19" rx="2.25" fill="#FFFFFF" />

        {/* Top Automation Workflow Rail (Zapier Brand Orange #FF4F00) */}
        <path
          d="M11 7.5H22C23.933 7.5 25.5 9.067 25.5 11C25.5 12.933 23.933 14.5 22 14.5H11V7.5Z"
          fill="#FF4F00"
        />

        {/* Isolated Client Fuel Rail (Electric Lime #D6FF55) */}
        <path
          d="M11 16H18C19.933 16 21.5 17.567 21.5 19.5C21.5 21.433 19.933 23 18 23H11V16Z"
          fill="#D6FF55"
        />
      </svg>

      {showWordmark && (
        <span
          style={{
            fontSize: "1.125rem",
            fontWeight: 700,
            letterSpacing: "-0.035em",
            color: "var(--ink)",
            lineHeight: 1,
          }}
        >
          FLOWFUEL
        </span>
      )}
    </div>
  );
}
