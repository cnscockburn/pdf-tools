import { ArrowLeft } from "lucide-react";
import { useTabContext } from "../lib/tabs";

interface Props {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function Layout({ title, description, children }: Props) {
  const { openTab } = useTabContext();
  return (
    <div className="min-h-screen bg-stone-50 app-dark:bg-stone-950">
      <header className="bg-white border-b border-stone-200 app-dark:bg-stone-900 app-dark:border-stone-800 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => openTab("home")}
          aria-label="Back to all tools"
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 app-dark:hover:text-white transition-colors rounded-md px-1.5 py-1 -ml-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
        >
          <ArrowLeft className="h-4 w-4" />
          All tools
        </button>
        <div className="w-px h-5 bg-stone-200 app-dark:bg-stone-700" />
        <div>
          <h1 className="text-base font-semibold text-stone-900 app-dark:text-stone-100">{title}</h1>
          {description && <p className="text-xs text-stone-400 app-dark:text-stone-500">{description}</p>}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
