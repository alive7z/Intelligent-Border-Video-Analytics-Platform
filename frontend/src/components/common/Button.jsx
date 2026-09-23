import React from "react";

const variants = {
  primary:
    "bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 dark:hover:bg-blue-500",
  secondary:
    "bg-white text-secondary border border-slate-300 shadow-sm hover:bg-slate-50 hover:text-slate-900 dark:bg-[#1F1F23] dark:border-white/15 dark:hover:bg-white/10 dark:hover:text-white",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
  ghost:
    "bg-transparent text-secondary hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white",
  success:
    "bg-blue-600 text-white hover:bg-blue-500",
  info: "bg-blue-500 text-white hover:bg-blue-600",
};

const sizes = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-11 px-5 py-2.5 text-base",
};

/**
 * Shared button. "as" lets consumers render an anchor or router Link
 * while keeping the same visual/behavioral contract.
 */
function Button({
  children,
  variant = "primary",
  size = "md",
  type = "button",
  loading = false,
  disabled = false,
  fullWidth = false,
  className = "",
  as: Tag = "button",
  ...props
}) {
  const isDisabled = disabled || loading;
  return (
    <Tag
      type={type}
      disabled={isDisabled}
      className={`btn-focus inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading && (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
          aria-hidden="true"
        />
      )}
      {children}
    </Tag>
  );
}

export default Button;
