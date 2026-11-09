import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  describeLeadsReload,
  LEADS_RELOAD_VERSION_NOT_CONFIRMED,
  type LeadsReloadHandler,
  type LeadsReloadStage,
  type LeadsLocale,
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
  locale = "pt-BR",
}: {
  competence: string;
  onReload: LeadsReloadHandler;
  syncExternal?: boolean;
  showFeedback?: boolean;
  locale?: LeadsLocale;
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
        ? locale === "en"
          ? "Reading and importing the base spreadsheet. Wait for confirmation; the previous source remains available."
          : "Lendo planilha-base e importando. Aguarde a confirmação; a base anterior permanece disponível."
        : locale === "en"
          ? "Reading stored data. Wait for confirmation; the previous source remains available."
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
          locale === "en"
            ? "The refresh returned another period and was not confirmed in the dashboard. Try again."
            : "A atualização retornou outra competência e não foi confirmada no painel. Tente novamente.";
        setFailed(true);
        setMessage(mismatchMessage);
        setOutcome({ type: "error", message: mismatchMessage });
        return;
      }
      const description = describeLeadsReload(result, locale);
      setMessage(description);
      setOutcome({ type: "success", result, description });
    } catch (error) {
      if (!isCurrent()) return;
      const authError = error as { data?: { code?: string }; code?: string };
      const code = authError?.data?.code ?? authError?.code;
      const failureMessage =
        code === "FORBIDDEN"
          ? locale === "en"
            ? "Only administrators can import the base spreadsheet. No permission was changed; previous data was kept."
            : "Apenas administradores podem importar a planilha-base. Nenhuma permissão foi alterada; os dados anteriores foram mantidos."
          : code === "UNAUTHORIZED"
            ? locale === "en"
              ? "Your session expired. Sign in again to refresh the data."
              : "Sua sessão expirou. Faça login novamente para atualizar os dados."
            : code === "PRECONDITION_FAILED"
              ? locale === "en"
                ? "Google connection pending. Configure the service account in the secure card and grant Reader access to the base spreadsheet. No data was changed."
                : "Conexão Google pendente. Configure a conta de serviço no cartão seguro e dê acesso de Leitor à planilha-base. Nenhum dado foi alterado."
              : code === LEADS_RELOAD_VERSION_NOT_CONFIRMED
                ? locale === "en"
                  ? "The spreadsheet was imported, but the dashboard has not confirmed the new version. Refresh the indicators."
                  : "A planilha foi importada, mas o painel ainda não confirmou a nova versão. Atualize os indicadores."
                : locale === "en"
                  ? "Unable to refresh the source. Previous data was kept; try again."
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
            ? locale === "en"
              ? "Import the base spreadsheet through the server's Google connection and refresh the dashboard."
              : "Importar a planilha-base com conexão Google própria do servidor e atualizar as telas."
            : locale === "en"
              ? "Read the stored source again."
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
            ? locale === "en"
              ? "Synchronizing source…"
              : "Sincronizando base…"
            : locale === "en"
              ? "Reading source…"
              : "Consultando base…"
          : syncExternal
            ? locale === "en"
              ? "Refresh Leads source"
              : "Atualizar base de Leads"
            : locale === "en"
              ? "Refresh indicators"
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
        locale={locale}
      />
    </div>
  );
}
