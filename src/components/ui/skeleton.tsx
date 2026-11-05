import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-gradient-to-r from-white/5 via-white/[0.12] to-white/5 bg-[length:200%_100%] animate-[shimmer_1.6s_linear_infinite] rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
