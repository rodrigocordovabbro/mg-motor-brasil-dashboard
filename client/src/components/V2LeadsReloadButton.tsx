import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  describeLeadsReload,
  type LeadsReloadResult,
} from "@shared/leadsReload";

export function V2LeadsReloadButton({
  competence,
  onReload,
  syncExternal = false,
  showFeedback = true,
}: {
  competence: string;
  onReload: () => Promise<LeadsReloadResult>;
  syncExternal?: boolean;
  showFeedback?: boolean;
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
    setMessage(
      syncExternal
        ? "Lendo planilha-base e importando. Aguarde a confirmação; a base anterior permanece disponível."
        : "Consultando dados armazenados. Aguarde a confirmação; a base anterior permanece disponível."
    );
    setFailed(false);
    try {
      const result = await onReload();
      if (request !== sequence.current || result.competence !== competence)
        return;
      setMessage(describeLeadsReload(result));
    } catch (error) {
      if (request !== sequence.current) return;
      const authError = error as { data?: { code?: string }; code?: string };
      const code = authError?.data?.code ?? authError?.code;
      setFailed(true);
      setMessage(
        code === "FORBIDDEN"
          ? "Apenas administradores podem importar a planilha-base. Nenhuma permissão foi alterada; os dados anteriores foram mantidos."
          : code === "UNAUTHORIZED"
            ? "Sua sessão expirou. Faça login novamente para atualizar os dados."
            : code === "PRECONDITION_FAILED"
              ? "Conexão Google pendente. Configure a conta de serviço no cartão seguro e dê acesso de Leitor à planilha-base. Nenhum dado foi alterado."
              : "Não foi possível atualizar a base. Os dados anteriores foram mantidos; tente novamente."
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => void reload()}
        disabled={busy}
        aria-busy={busy}
        title={
          syncExternal
            ? "Importar a planilha-base com conexão Google própria do servidor e atualizar as telas."
            : "Consultar novamente a base armazenada."
        }
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-[#b41b26] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-wait disabled:opacity-60"
      >
        <RefreshCw
          className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        {busy
          ? syncExternal
            ? "Sincronizando base…"
            : "Consultando base…"
          : syncExternal
            ? "Atualizar base de Leads"
            : "Atualizar indicadores"}
      </button>
      {(showFeedback || busy) && message ? (
        <p
          role={failed ? "alert" : "status"}
          aria-live="polite"
          className={`pacing-reload-feedback mt-2 text-[11px] leading-4 ${failed ? "text-red-700" : "text-slate-600"}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
