import { useState, type Dispatch, type SetStateAction } from "react";
import { Loader2, Sparkles, Wand2, X } from "lucide-react";
import { useAuth } from "../lib/auth-context";
import { apiUrl } from "../lib/api-url";

type Props = {
  images: string[];
  setImages: Dispatch<SetStateAction<string[]>>;
};

export default function ProductImageGenerator({ images, setImages }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [generated, setGenerated] = useState<string | null>(null);
  const { user } = useAuth();

  async function generate() {
    const source = images[0];
    if (!source || busy) return;
    setBusy(true);
    setError("");
    setGenerated(null);
    try {
      const token = await user?.getIdToken();
      if (!token) throw new Error("Tizimga qayta kiring.");
      const response = await fetch(apiUrl("/api/products/generate-image"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ image: source }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.image) throw new Error(payload.error || "AI rasm yaratishda xatolik yuz berdi.");
      setGenerated(payload.image);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI rasm yaratishda xatolik yuz berdi.");
    } finally {
      setBusy(false);
    }
  }

  function useGenerated() {
    if (!generated) return;
    setImages((prev) => [generated, ...prev]);
    setGenerated(null);
  }

  if (!images.length) return null;

  return (
    <div className="mt-3 space-y-2.5">
      <button type="button" onClick={generate} disabled={busy} className="w-full flex items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 hover:bg-violet-500/15 disabled:opacity-50 text-violet-200 py-2.5 text-sm font-medium transition">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {busy ? "Professional rasm tayyorlanmoqda…" : "+ Generate new"}
      </button>
      <p className="text-[11px] text-slate-500 text-center">Birinchi mahsulot rasmi AI uchun reference sifatida ishlatiladi. Oq fonli professional variant yaratiladi.</p>
      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
          <p className="text-xs text-rose-300 flex-1">{error}</p>
          <button type="button" onClick={() => setError("")} className="text-slate-500 hover:text-white"><X className="h-3.5 w-3.5" /></button>
        </div>
      )}
      {generated && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-2.5">
          <div className="relative overflow-hidden rounded-xl bg-white aspect-square">
            <img src={generated} alt="AI generated product" className="w-full h-full object-contain" />
          </div>
          <div className="flex gap-2 mt-2.5">
            <button type="button" onClick={useGenerated} className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-500 to-blue-500 text-white py-2.5 text-sm font-medium transition hover:opacity-90">
              <Wand2 className="h-4 w-4" /> Use this image
            </button>
            <button type="button" onClick={() => setGenerated(null)} className="px-3 rounded-xl border border-white/10 bg-white/5 text-slate-300 hover:text-white transition" aria-label="Close preview"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
