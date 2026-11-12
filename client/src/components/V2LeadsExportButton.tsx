import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  leadsExportFilterKey,
  type LeadsExportInput,
  type LeadsExportResult,
  type LeadsExcelExportResult,
  type LeadsExportLocale,
} from "@shared/leadsExport";
import type { V2Filters } from "@shared/v2Types";

type ExportFormat = "xlsx" | "csv";

type Props = {
  filters: V2Filters;
  count: number;
  clientMode: boolean;
  disabled?: boolean;
  locale?: LeadsExportLocale;
};

const EXCEL_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function excelBytes(base64: string): ArrayBuffer {
  const decoded = atob(base64);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1)
    bytes[index] = decoded.charCodeAt(index);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b)
    throw new Error("INVALID_EXCEL_FILE");
  return bytes.buffer;
}

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
  const activeFormat = useRef<ExportFormat | null>(null);
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

  async function exportLeads(format: ExportFormat) {
    if (locked.current || disabled || count < 1) return;
    const snapshot = { ...input };
    const requestedKey = leadsExportFilterKey(snapshot);
    locked.current = true;
    activeFormat.current = format;
    setBusy(true);
    setFeedback(null);
    setFailed(false);
    try {
      const result: LeadsExportResult | LeadsExcelExportResult =
        format === "xlsx"
          ? await utils.client.leads.exportExcel.mutate(snapshot)
          : await utils.client.leads.exportCSV.mutate(snapshot);
      if (!mounted.current) return;
      if (currentKey.current !== requestedKey) {
        setFailed(true);
        setFeedback(
          locale === "en"
            ? "Filters changed. Export the current view again."
            : "Os filtros mudaram. Exporte novamente o recorte atual."
        );
        return;
      }
      if (!result.count) {
        setFeedback(
          locale === "en"
            ? "No opportunity found to export with these filters."
            : "Nenhuma oportunidade encontrada para exportar com esses filtros."
        );
        return;
      }
      if (
        result.period.dateFrom !== snapshot.dateFrom ||
        result.period.dateTo !== snapshot.dateTo ||
        result.nameMasked !== Boolean(snapshot.clientMode)
      ) {
        throw new Error("EXPORT_VIEW_MISMATCH");
      }
      let blob: Blob;
      if (format === "xlsx") {
        if (
          !("xlsxBase64" in result) ||
          result.mimeType !== EXCEL_MIME ||
          !result.fileName.endsWith(".xlsx")
        )
          throw new Error("INVALID_EXCEL_RESPONSE");
        blob = new Blob([excelBytes(result.xlsxBase64)], { type: EXCEL_MIME });
      } else {
        if (
          !("csv" in result) ||
          result.mimeType !== "text/csv;charset=utf-8" ||
          !result.fileName.endsWith(".csv")
        )
          throw new Error("INVALID_CSV_RESPONSE");
        blob = new Blob([result.csv], { type: result.mimeType });
      }
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
        `${new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR").format(result.count)} ${locale === "en" ? "opportunities exported" : "oportunidades exportadas"} (${format === "xlsx" ? "Excel" : "CSV"}) ${locale === "en" ? "with the applied filters." : "com os filtros aplicados."}`
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
      activeFormat.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap justify-end gap-2">
        {(["xlsx", "csv"] as const).map(format => {
          const exporting = busy && activeFormat.current === format;
          return (
            <button
              key={format}
              type="button"
              data-export-format={format}
              onClick={() => exportLeads(format)}
              disabled={disabled || busy || count < 1}
              aria-busy={exporting}
              title={
                locale === "en"
                  ? "Export all filtered opportunities, including full name, email, phone and vehicle of interest"
                  : "Exportar todas as oportunidades filtradas, incluindo nome completo, e-mail, telefone e carro de interesse"
              }
              className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 disabled:cursor-not-allowed disabled:opacity-45 ${format === "xlsx" ? "border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100" : "border-slate-200 bg-white text-slate-700 hover:border-red-200 hover:bg-red-50 hover:text-red-700"}`}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="h-4 w-4" aria-hidden="true" />
              )}
              {exporting
                ? locale === "en"
                  ? "Exporting…"
                  : "Exportando…"
                : format === "xlsx"
                  ? locale === "en"
                    ? "Download Excel"
                    : "Exportar Excel"
                  : locale === "en"
                    ? "Download CSV"
                    : "Exportar CSV"}
            </button>
          );
        })}
      </div>
      <p className="text-right text-[11px] text-slate-500">
        {locale === "en"
          ? "All filtered opportunities · Contact fields included"
          : "Todas as oportunidades filtradas · Campos de contato incluídos"}
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
