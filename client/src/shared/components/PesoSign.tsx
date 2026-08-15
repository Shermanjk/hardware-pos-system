import React from "react";

interface PesoSignProps extends React.HTMLAttributes<HTMLSpanElement> {
  className?: string;
  size?: number | string;
}

export function PesoSign({ className = "", size, style, ...props }: PesoSignProps) {
  return (
    <span
      className={`inline-flex items-center justify-center font-bold select-none leading-none ${className}`}
      style={{
        fontSize: size ? (typeof size === "number" ? `${size}px` : size) : undefined,
        fontFamily: "system-ui, -apple-system, sans-serif",
        ...style,
      }}
      aria-hidden="true"
      {...props}
    >
      ₱
    </span>
  );
}

export default PesoSign;
