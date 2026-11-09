import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  leadsExportFilterKey,
  type LeadsExportInput,
  type LeadsExportResult,
  type LeadsExportLocale,
} from "@shared/leadsExport";
import type { V2Filters } from "@shared/v2Types";

type Props = {
  filters: V2Filters;
  count: number;
  clientMode: boolean;
  disabled?: boolean;
  locale?: LeadsExportLocale;
};

export function V2LeadsExportButton({
  filters,
  count,
  clientMode,
  disabled = false,
  locale = "pt-BR",
}: Props) {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const input: LeadsExportInput = {
    ...filters,
    page: undefined,
    clientMode,
    ...(locale === "en" ? { locale } : {}),
  };
  const filterKey = leadsExportFilterKey(input);
  const currentKey = useRef(filterKey);
  currentKey.current = filterKey;
  const downloads = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const [url, timer] of downloads.current) {
        clearTimeout(timer);
        URL.revokeObjectURL(url);
      }
      downloads.current.clear();
    };
  }, []);
  useEffect(() => {
    setFeedback(null);
    setFailed(false);
  }, [filterKey]);

  async function exportLeads() {
    if (locked.current || disabled || count < 1) return;
    const snapshot = { ...input };
    const requestedKey = leadsExportFilterKey(snapshot);
    locked.current = true;
    setBusy(true);
    setFeedback(null);
    setFailed(false);
    try {
      const result: LeadsExportResult =
        await utils.client.leads.exportCSV.mutate(snapshot);
      if (!mounted.current) return;
      if (currentKey.current !== requestedKey) {
        setFailed(true);
        setFeedback(locale === "en" ? "Filters changed. Export the current view again." : "Os filtros mudaram. Exporte novamente o recorte atual.");
        return;
      }
      if (!result.count) {
        setFeedback(locale === "en" ? "No Lead found to export with these filters." : "Nenhum Lead encontrado para exportar com esses filtros.");
        return;
      }
      if (
        result.period.dateFrom !== snapshot.dateFrom ||
        result.period.dateTo !== snapshot.dateTo ||
        (snapshot.clientMode && !result.nameMasked)
      ) {
        throw new Error(locale === "en" ? "The file does not match the authorized view." : "O arquivo não corresponde ao recorte autorizado.");
      }
      const blob = new Blob([result.csv], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      let link: HTMLAnchorElement | undefined;
      try {
        link = document.createElement("a");
        link.href = url;
        link.download = result.fileName;
        document.body.appendChild(link);
        link.click();
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      } finally {
        link?.remove();
      }
      const timer = setTimeout(() => {
        URL.revokeObjectURL(url);
        downloads.current.delete(url);
      }, 1000);
      downloads.current.set(url, timer);
      setFeedback(
        `${new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR").format(result.count)} Leads ${locale === "en" ? "exported with the applied filters." : "exportados com os filtros aplicados."}`
      );
    } catch {
      if (!mounted.current || currentKey.current !== requestedKey) return;
      setFailed(true);
      setFeedback(
        locale === "en"
          ? "Unable to export. Check access and try again; for very large views, reduce the period."
          : "Não foi possível exportar. Confira o acesso e tente novamente; para recortes muito grandes, reduza o período."
      );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={exportLeads}
        disabled={disabled || busy || count < 1}
        aria-busy={busy}
        title={locale === "en" ? "Export all Leads from the applied filters, not just the current page" : "Exportar todos os Leads dos filtros aplicados, não apenas a página atual"}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {busy ? (locale === "en" ? "Exporting…" : "Exportando…") : locale === "en" ? "Download CSV" : "Exportar CSV"}
      </button>
      <p className="text-right text-[11px] text-slate-500">
        {locale === "en" ? "All records in the applied view" : "Todos os registros do recorte aplicado"}
      </p>
      {feedback ? (
        <p
          role={failed ? "alert" : "status"}
          aria-live="polite"
          className={`max-w-sm text-right text-xs ${failed ? "text-red-700" : "text-emerald-700"}`}
        >
          {feedback}
        </p>
      ) : null}
    </div>
  );
}
