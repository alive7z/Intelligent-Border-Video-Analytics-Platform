import React from "react";

/**
 * Text input layer with label, optional error, and optional right element
 * (e.g. the password show/hide toggle).
 */
const Input = React.forwardRef(function Input(
  {
    label,
    id,
    type = "text",
    error,
    rightElement,
    className = "",
    containerClassName = "",
    hint,
    ...props
  },
  ref
) {
  return (
    <div className={containerClassName}>
      {label && (
        <label
          htmlFor={id}
          className="text-secondary mb-1.5 block text-sm font-medium"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={type}
          className={`input-field ${error ? "border-danger focus:border-danger focus:ring-danger/20" : ""} ${rightElement ? "pr-10" : ""} ${className}`}
          {...props}
        />
        {rightElement && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            {rightElement}
          </div>
        )}
      </div>
      {error ? (
        <p className="mt-1 text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-muted mt-1 text-xs">{hint}</p>
      ) : null}
    </div>
  );
});

export default Input;
