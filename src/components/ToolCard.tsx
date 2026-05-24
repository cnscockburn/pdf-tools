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
      className="group flex flex-col items-start gap-3 rounded-2xl border border-gray-200 bg-white p-5 text-left shadow-sm transition hover:shadow-md hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <div className={`rounded-xl p-3 ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="font-semibold text-gray-900 group-hover:text-brand-600 transition-colors">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
    </button>
  );
}
