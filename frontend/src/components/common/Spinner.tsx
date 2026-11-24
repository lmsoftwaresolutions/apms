export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  color?: string;
}

export function Spinner({ size = "md", className = "", color = "currentColor" }: SpinnerProps) {
  const dimension = size === "sm" ? 16 : size === "lg" ? 32 : 20;

  return (
    <svg
      className={`spinner ${className}`.trim()}
      width={dimension}
      height={dimension}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        animation: "spin 0.75s linear infinite",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    >
      <style>
        {`@keyframes spin { 100% { transform: rotate(360deg); } }`}
      </style>
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export interface LoadingRowProps {
  cols: number;
  rows?: number;
}

export function LoadingRow({ cols, rows = 3 }: LoadingRowProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr key={rIdx}>
          {Array.from({ length: cols }).map((_, cIdx) => (
            <td key={cIdx} style={{ padding: "1rem" }}>
              <div
                className="skeleton"
                style={{
                  height: "1rem",
                  width: cIdx === 0 ? "40%" : cIdx === 1 ? "75%" : "60%",
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
