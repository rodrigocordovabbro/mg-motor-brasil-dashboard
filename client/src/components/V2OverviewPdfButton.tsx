import { useRef, useState, type RefObject } from "react";
import { FileDown, LoaderCircle } from "lucide-react";
import type { V2Dashboard, V2Filters } from "@shared/v2Types";

export function V2OverviewPdfButton({
  rootRef,
  data,
  filters,
  busy = false,
  locale = "pt-BR",
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  data: V2Dashboard;
  filters: V2Filters;
  busy?: boolean;
  locale?: "pt-BR" | "en";
}) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState(false);
  const locked = useRef(false);
  const en = locale === "en";
  const disabled = busy || preparing || data.status !== "READY";
  const generate = async () => {
    if (disabled || locked.current || !rootRef.current) return;
    locked.current = true;
    setPreparing(true);
    setError(false);
    try {
      const { printOverviewPdf } = await import("@/lib/overviewPdf");
      await printOverviewPdf({
        root: rootRef.current,
        locale,
        dateFrom: data.period.dateFrom,
        dateTo: data.period.dateTo,
        cutoff: data.period.cutoffDate,
        latestLeadDate: data.source.latestLeadDate ?? null,
        filters,
      });
    } catch {
      setError(true);
    } finally {
      locked.current = false;
      setPreparing(false);
    }
  };
  return (
    <div
      data-overview-pdf-exclude
      className="flex flex-col items-start gap-2 sm:items-end"
    >
      <button
        type="button"
        onClick={() => void generate()}
        disabled={disabled}
        data-testid="overview-pdf-button"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#e2212d] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#c91c29] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {preparing ? (
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <FileDown className="h-4 w-4" aria-hidden="true" />
        )}
        {preparing
          ? en
            ? "Preparing PDF…"
            : "Preparando PDF…"
          : en
            ? "Export PDF"
            : "Gerar PDF"}
      </button>
      <p
        className="max-w-lg text-[11px] leading-4 text-slate-500"
        role="status"
        aria-live="polite"
      >
        {en
          ? "Overview summary for sharing. Choose “Save as PDF” in the print dialog."
          : "Resumo da Overview para compartilhar. Escolha “Salvar como PDF” na janela de impressão."}
      </p>
      {error ? (
        <p role="alert" className="max-w-lg text-xs text-red-700">
          {en
            ? "Unable to prepare the PDF. Please try again with the Overview loaded and printing allowed."
            : "Não foi possível preparar o PDF. Tente novamente com a Overview carregada e a impressão permitida."}
        </p>
      ) : null}
    </div>
  );
}
