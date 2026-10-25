import type { HTMLAttributes } from "react";

type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  className?: string;
};

export function Skeleton({ className, ...props }: SkeletonProps) {
  return <span {...props} aria-hidden="true" className={["ui-skeleton", className].filter(Boolean).join(" ")} />;
}
