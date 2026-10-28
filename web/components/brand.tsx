import { productName } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function Brand({ className }: { className?: string }) {
  return productName === "Senda" ? (
    <img src="/brand/logo.svg" width="274" height="72" alt={productName}
      className={cn("h-9 w-auto shrink-0", className)} />
  ) : <span className={cn("font-semibold", className)}>{productName}</span>;
}

export function BrandMark({ className }: { className?: string }) {
  return <img src="/brand/mark.svg" width="32" height="24" alt="" aria-hidden="true"
    className={cn("h-6 w-8 shrink-0", className)} />;
}
