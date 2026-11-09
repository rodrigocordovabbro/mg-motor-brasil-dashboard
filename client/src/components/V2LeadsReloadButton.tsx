import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  describeLeadsReload,
  LEADS_RELOAD_VERSION_NOT_CONFIRMED,
  type LeadsReloadHandler,
  type LeadsReloadStage,
} from "@shared/leadsReload";
import {
  V2LeadsReloadDialog,
  type LeadsReloadDialogOutcome,
} from "./V2LeadsReloadDialog";

export function V2LeadsReloadButton({
  competence,
  onReload,
  syncExternal = false,
  showFeedback = true,
}: {
  competence: string;
  onReload: LeadsReloadHandler;
  syncExternal?: boolean;
  showFeedback?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState<LeadsReloadStage>(
    syncExternal ? "syncing" : "refreshing"
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [outcome, setOutcome] = useState<LeadsReloadDialogOutcome | null>(null);
  const locked = useRef(false);
  const sequence = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    sequence.current += 1;
    setBusy(false);
    setMessage(null);
    setFailed(false);
    setStage(syncExternal ? "syncing" : "refreshing");
    setDialogOpen(false);
    setOutcome(null);
    return () => {
      mounted.current = false;
      sequence.current += 1;
      locked.current = false;
    };
  }, [competence, syncExternal]);

  const closeDialog = () => {
    if (busy) return;
    setDialogOpen(false);
    setOutcome(null);
  };

  const reload = async () => {
    if (locked.current || !mounted.current) return;
    locked.current = true;
    const request = sequence.current;
    const isCurrent = () => mounted.current && request === sequence.current;
    setBusy(true);
    setDialogOpen(true);
    setOutcome(null);
    setStage(syncExternal ? "syncing" : "refreshing");
    setMessage(
      syncExternal
        ? "Lendo planilha-base e importando. Aguarde a confirmação; a base anterior permanece disponível."
        : "Consultando dados armazenados. Aguarde a confirmação; a base anterior permanece disponível."
    );
    setFailed(false);
    try {
      const result = await onReload(nextStage => {
        if (isCurrent()) setStage(nextStage);
      });
      if (!isCurrent()) return;
      if (result.competence !== competence) {
        const mismatchMessage =
          "A atualização retornou outra competência e não foi confirmada no painel. Tente novamente.";
        setFailed(true);
        setMessage(mismatchMessage);
        setOutcome({ type: "error", message: mismatchMessage });
        return;
      }
      const description = describeLeadsReload(result);
      setMessage(description);
      setOutcome({ type: "success", result, description });
    } catch (error) {
      if (!isCurrent()) return;
      const authError = error as { data?: { code?: string }; code?: string };
      const code = authError?.data?.code ?? authError?.code;
      const failureMessage =
        code === "FORBIDDEN"
          ? "Apenas administradores podem importar a planilha-base. Nenhuma permissão foi alterada; os dados anteriores foram mantidos."
          : code === "UNAUTHORIZED"
            ? "Sua sessão expirou. Faça login novamente para atualizar os dados."
            : code === "PRECONDITION_FAILED"
              ? "Conexão Google pendente. Configure a conta de serviço no cartão seguro e dê acesso de Leitor à planilha-base. Nenhum dado foi alterado."
              : code === LEADS_RELOAD_VERSION_NOT_CONFIRMED
                ? "A planilha foi importada, mas o painel ainda não confirmou a nova versão. Atualize os indicadores."
                : "Não foi possível atualizar a base. Os dados anteriores foram mantidos; tente novamente.";
      setFailed(true);
      setMessage(failureMessage);
      setOutcome({ type: "error", message: failureMessage, code });
    } finally {
      if (!isCurrent()) return;
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
      <V2LeadsReloadDialog
        open={dialogOpen}
        busy={busy}
        stage={stage}
        outcome={outcome}
        onClose={closeDialog}
      />
    </div>
  );
}
