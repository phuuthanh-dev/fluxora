import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

function joinClasses(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", className, type = "button", ...props },
  ref,
) {
  return <button ref={ref} {...props} type={type} className={joinClasses("ui-button", `ui-button--${variant}`, className)} />;
});

type IconButtonProps = Omit<ButtonProps, "aria-label"> & {
  label: string;
  children: ReactNode;
};

export function IconButton({ label, children, className, variant = "ghost", type = "button", ...props }: IconButtonProps) {
  return (
    <Button {...props} type={type} variant={variant} className={joinClasses("ui-icon-button", className)} aria-label={label}>
      {children}
    </Button>
  );
}
