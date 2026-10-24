// Adapted from the official shadcn/ui new-york registry (MIT).
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { buttonVariants } from "./button-variants";
import { cn } from "../../lib/utils";

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp
      data-ui="button" data-variant={variant || (/save|primary|create|--success/.test(className || '') ? 'default' : /delete|danger/.test(className || '') ? 'destructive' : 'outline')}
      className={cn(buttonVariants({ variant: variant || (/save|primary|create|--success/.test(className || '') ? 'default' : /delete|danger/.test(className || '') ? 'destructive' : 'outline'), size, className }))}
      ref={ref}
      {...props}
    />;
  }
);
Button.displayName = "Button";
export {
  Button
};
