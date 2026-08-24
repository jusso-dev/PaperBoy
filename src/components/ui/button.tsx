import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border font-mono text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-postal-blue disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        postal:
          "border-postal-blue-dark bg-postal-blue text-paper-light shadow-paper-button hover:bg-postal-blue-dark hover:text-paper-light active:translate-x-px active:translate-y-px active:shadow-none",
        paper:
          "border-postal-blue bg-paper-light text-postal-blue-dark shadow-paper-button hover:bg-paper-dark active:translate-x-px active:translate-y-px active:shadow-none",
        "ghost-paper":
          "border-transparent bg-transparent text-ink hover:border-line hover:bg-paper-dark",
        "danger-paper":
          "border-error bg-paper-light text-error shadow-paper-button hover:bg-error hover:text-paper-light active:translate-x-px active:translate-y-px active:shadow-none",
      },
      size: {
        default: "h-10 rounded-[3px] px-4",
        sm: "h-8 rounded-[3px] px-3 text-xs",
        lg: "h-11 rounded-[3px] px-5",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: {
      variant: "postal",
      size: "default",
    },
  },
);

function Button({
  asChild = false,
  className,
  size,
  variant,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ className, size, variant }))}
      data-slot="button"
      data-variant={variant ?? "postal"}
      {...props}
    />
  );
}

export { Button, buttonVariants };
