import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export default function Layout({ title, description, children }: Props) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          All tools
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <div>
          <h1 className="font-semibold text-gray-900">{title}</h1>
          {description && <p className="text-xs text-gray-400">{description}</p>}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
