// Adapted from shadcn/ui: Radix supplies keyboard and checked-state semantics.
import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '../../lib/utils'

const Switch = React.forwardRef(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root ref={ref} data-ui="switch" className={cn('workspace-switch', className)} {...props}>
    <SwitchPrimitive.Thumb className="workspace-switch-thumb" />
  </SwitchPrimitive.Root>
))
Switch.displayName = 'Switch'
export { Switch }
