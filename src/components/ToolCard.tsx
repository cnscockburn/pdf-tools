import { useNavigate } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  to: string;
  color: string;
}

export default function ToolCard({ icon: Icon, title, description, to, color }: Props) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to)}
      className="group flex flex-col items-start gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-left shadow-sm transition-all duration-150 ease-out hover:shadow-md hover:border-stone-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50"
    >
      <div className={`rounded-xl p-3 ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="font-semibold text-stone-900 group-hover:text-brand-600 transition-colors">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-stone-500">{description}</p>
      </div>
    </button>
  );
}
