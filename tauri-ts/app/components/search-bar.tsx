import { Search } from "lucide-react";
import { Input } from "~app/components/ui/input";

interface SearchBarProps {
  placeholder?: string;
}

export function SearchBar({ placeholder = "Search..." }: SearchBarProps) {
  return (
    <div className="relative">
      <Search
        size={18}
        className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
      />
      <Input
        type="text"
        placeholder={placeholder}
        className="pl-10"
        disabled
      />
    </div>
  );
}
