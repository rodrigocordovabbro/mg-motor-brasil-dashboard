import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  describeLeadsReload,
  type LeadsReloadResult,
} from "@shared/leadsReload";

export function V2LeadsReloadButton({
  competence,
  onReload,
}: {
  competence: string;
  onReload: () => Promise<LeadsReloadResult>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const sequence = useRef(0);
  useEffect(() => {
    sequence.current += 1;
    setMessage(null);
    setFailed(false);
    return () => {
      sequence.current += 1;
    };
  }, [competence]);
  const reload = async () => {
    if (locked.current) return;
    locked.current = true;
    const request = sequence.current;
    setBusy(true);
    setMessage(null);
    setFailed(false);
    try {
      const result = await onReload();
      if (request !== sequence.current || result.competence !== competence)
        return;
      setMessage(describeLeadsReload(result));
    } catch (error) {
      if (request !== sequence.current) return;
      const authError = error as { data?: { code?: string }; code?: string };
      setFailed(true);
      setMessage(
        authError?.data?.code === "UNAUTHORIZED" ||
          authError?.code === "UNAUTHORIZED"
          ? "Sua sessão expirou. Faça login novamente para atualizar os dados."
          : "Não foi possível consultar a base. Os dados anteriores foram mantidos; tente novamente."
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="flex max-w-md flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={() => void reload()}
        disabled={busy}
        aria-busy={busy}
        title="Consultar novamente o banco autenticado e atualizar as telas. Não importa a fonte externa."
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-[#b41b26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-wait disabled:opacity-60"
      >
        <RefreshCw
          className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {busy ? "Consultando base…" : "Atualizar base de Leads"}
      </button>
      <p className="text-right text-[10px] text-slate-500">
        Consulta a base já importada; não sincroniza a fonte externa.
      </p>
      {message ? (
        <p
          role={failed ? "alert" : "status"}
          className={`text-right text-[11px] leading-4 ${failed ? "text-red-700" : "text-slate-600"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
