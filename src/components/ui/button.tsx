import * as React from "react";

type Variant = "default" | "outline" | "ghost";

export function Button({
  className = "",
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const base =
    "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles =
    variant === "outline"
      ? "border bg-white hover:bg-slate-50"
      : variant === "ghost"
      ? "bg-transparent hover:bg-slate-100"
      : "bg-slate-900 text-white hover:bg-slate-800";

  return <button className={`${base} ${styles} ${className}`} {...props} />;
}
