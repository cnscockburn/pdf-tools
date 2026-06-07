import { useTabContext, type TabType } from "../lib/tabs";
import type { LucideIcon } from "lucide-react";

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  to: TabType;
  color: string;
}

export default function ToolCard({ icon: Icon, title, description, to, color }: Props) {
  const { openTab } = useTabContext();
  return (
    <button
      onClick={() => openTab(to)}
      className="group flex flex-col items-start gap-3 rounded-2xl border border-stone-200 bg-white app-dark:bg-stone-900 app-dark:border-stone-800 p-5 text-left shadow-sm transition-all duration-150 ease-out hover:shadow-md hover:border-stone-300 app-dark:hover:border-stone-700 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-stone-50 app-dark:focus-visible:ring-offset-stone-950"
    >
      <div className={`rounded-xl p-3 ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
      <div>
        <p className="font-semibold text-stone-900 app-dark:text-stone-100 group-hover:text-brand-600 transition-colors">
          {title}
        </p>
        <p className="mt-0.5 text-xs text-stone-500 app-dark:text-stone-400">{description}</p>
      </div>
    </button>
  );
}
