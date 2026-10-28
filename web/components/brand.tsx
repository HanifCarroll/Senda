import { productName } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { brandAssetVersion, brandLogoWidth, brandLogoHeight } from "../../src/brand.js";

export function Brand({ className }: { className?: string }) {
  return productName === "Senda" ? (
    <img src={`/brand/logo.svg?v=${brandAssetVersion}`} width={brandLogoWidth} height={brandLogoHeight} alt={productName}
      className={cn("h-9 w-auto shrink-0", className)} />
  ) : <span className={cn("font-semibold", className)}>{productName}</span>;
}

export function BrandMark({ className }: { className?: string }) {
  return <img src={`/brand/mark.svg?v=${brandAssetVersion}`} width="35" height="24" alt="" aria-hidden="true"
    className={cn("h-6 w-auto shrink-0", className)} />;
}
