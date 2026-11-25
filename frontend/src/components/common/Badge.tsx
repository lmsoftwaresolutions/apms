import { HTMLAttributes, ReactNode } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "danger" | "warning" | "info" | "neutral";
  size?: "sm" | "md";
  children: ReactNode;
}

export function Badge({
  variant = "neutral",
  size = "md",
  children,
  className = "",
  ...props
}: BadgeProps) {
  const sizeStyle = size === "sm" ? { fontSize: "0.7rem", padding: "0.1rem 0.45rem" } : {};

  return (
    <span
      className={`badge badge-${variant} ${className}`.trim()}
      style={sizeStyle}
      {...props}
    >
      {children}
    </span>
  );
}
