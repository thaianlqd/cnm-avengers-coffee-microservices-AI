// Adapted from the official shadcn/ui new-york registry (MIT).
import { badgeVariants } from "./badge-variants";
import { cn } from "../../lib/utils";

function Badge({ className, variant, ...props }) {
  return <span data-ui="badge" data-variant={variant || "default"} className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export {
  Badge
};
