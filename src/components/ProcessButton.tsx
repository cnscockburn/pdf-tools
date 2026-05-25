import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

interface Props {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  label: string;
}

export default function ProcessButton({ onClick, loading, disabled, label }: Props) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors duration-150 ease-out",
        "bg-brand-500 hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/60 focus:ring-offset-2 focus:ring-offset-stone-50",
        (disabled || loading) && "opacity-50 cursor-not-allowed"
      )}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {label}
    </button>
  );
}
