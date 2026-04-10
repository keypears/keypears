import { Cpu } from "lucide-react";
import { formatNumber } from "~/lib/format";

export function PowBadge({
  difficulty,
  label,
}: {
  difficulty: bigint | number;
  label?: string;
}) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
      <Cpu className="h-4 w-4" />
      <span>
        {formatNumber(difficulty)}
        {label ? ` ${label}` : ""}
      </span>
    </span>
  );
}
