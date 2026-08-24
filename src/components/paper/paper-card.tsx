import type * as React from "react";
import { cn } from "@/lib/utils";

type PaperCardProps = React.HTMLAttributes<HTMLElement> & {
  as?: "article" | "div" | "section";
};

export function PaperCard({
  as: Component = "section",
  className,
  ...props
}: PaperCardProps) {
  const cardProps = {
    ...props,
    className: cn("paper-card rounded-[3px]", className),
  };

  if (Component === "article") return <article {...cardProps} />;
  if (Component === "div") return <div {...cardProps} />;
  return <section {...cardProps} />;
}
