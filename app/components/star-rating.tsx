import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

function StarIcon({ fraction }: { fraction: number }) {
  if (fraction >= 1) {
    return <Star className="size-3.5 fill-yellow-400 text-yellow-400" />;
  } else if (fraction >= 0.5) {
    return <Star className="size-3.5 fill-yellow-400/50 text-yellow-400" />;
  } else {
    return <Star className="size-3.5 text-muted-foreground/40" />;
  }
}

export function StarRating({
  average,
  count,
  className,
}: {
  average: number | null;
  count: number;
  className?: string;
}) {
  if (count === 0 || average === null) return null;

  return (
    <span className={cn("flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((star) => (
        <StarIcon
          key={star}
          fraction={Math.max(0, Math.min(1, average - (star - 1)))}
        />
      ))}
      <span className="ml-1 text-xs text-muted-foreground">
        {average.toFixed(1)}{" "}
        <span className="opacity-60">({count})</span>
      </span>
    </span>
  );
}
