import { ReactNode } from "react";

export interface FieldProps {
  label?: ReactNode;
  error?: string | null;
  help?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  error,
  help,
  required = false,
  htmlFor,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={`field ${className}`.trim()}>
      {label ? (
        <label htmlFor={htmlFor} className="field-label">
          {label}
          {required ? <span className="field-required">*</span> : null}
        </label>
      ) : null}
      {children}
      {error ? <p className="field-error">{error}</p> : help ? <p className="field-help">{help}</p> : null}
    </div>
  );
}
