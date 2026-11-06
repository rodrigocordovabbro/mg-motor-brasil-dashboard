import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function V2LeadsReloadButton({
  competence,
  onReload,
}: {
  competence: string;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setMessage(null);
  }, [competence]);
  const reload = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      await onReload();
      setMessage(
        `Base de ${competence.split("-").reverse().join("/")} recarregada dos dados já importados.`
      );
    } catch {
      setFailed(true);
      setMessage("Não foi possível recarregar a base. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex max-w-xs flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => void reload()}
        disabled={busy}
        aria-busy={busy}
        title="Reler os Leads e o acumulado mensal do banco já importado; não importa novamente a planilha externa."
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-[#b41b26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-wait disabled:opacity-60"
      >
        <RefreshCw
          className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {busy ? "Recarregando base…" : "Atualizar base de Leads"}
      </button>
      {message ? (
        <p
          role={failed ? "alert" : "status"}
          className={`text-right text-[11px] leading-4 ${failed ? "text-red-700" : "text-emerald-700"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
