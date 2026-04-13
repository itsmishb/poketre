/**
 * shadcn/ui Button + 旧 API との後方互換ラッパー
 *
 * 新 API（shadcn/ui 標準）:
 *   variant: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
 *   size:    "default" | "sm" | "lg" | "icon"
 *
 * 旧 API（後方互換のため継続サポート）:
 *   variant: "primary" → "default"
 *            "danger"  → "destructive"
 *   isLoading: boolean → disabled + "処理中…" テキスト
 *   fullWidth: boolean → className="w-full"
 */
"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:     "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:     "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:   "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:       "hover:bg-accent hover:text-accent-foreground",
        link:        "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm:      "h-9 rounded-md px-3",
        lg:      "h-11 rounded-md px-8",
        icon:    "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

/** 旧 variant 名を新 variant 名にマップ */
type LegacyVariant = "primary" | "danger";
type NewVariant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
const legacyVariantMap: Record<LegacyVariant, NewVariant> = {
  primary: "default",
  danger:  "destructive",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?:   boolean;
  /** @deprecated variant="primary" を使用。新コードでは variant="default" を使うこと */
  isLoading?: boolean;
  /** @deprecated className="w-full" を直接指定してください */
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      isLoading = false,
      fullWidth = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // 旧 variant 名を新しい名前に変換
    const resolvedVariant =
      variant && variant in legacyVariantMap
        ? legacyVariantMap[variant as LegacyVariant]
        : (variant as NewVariant | null | undefined);

    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({ variant: resolvedVariant, size }),
          fullWidth && "w-full",
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? "処理中…" : children}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
