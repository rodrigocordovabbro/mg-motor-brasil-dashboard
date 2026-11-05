import { trpc } from "@/lib/trpc";
import { getDashboardCutoffDate } from "@shared/dashboardDates";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type UploadKind = "lead-goals" | "sales-goals" | "sales";

type StatusFile = {
  kind: UploadKind;
  configured: boolean;
  fileName: string | null;
  total: number | null;
  asOf: string | null;
  sourceWeek?: number | null;
  importedAt: string | null;
  rows: number;
  warnings: string[];
};

type PreviewRow = {
  key: string;
  sourceLabel: string;
  state: string | null;
  value: number | null;
  rawDealers: string[];
};

type Preview = {
  kind: UploadKind;
  competence: string;
  asOf: string | null;
  fileName: string;
  fileSha256: string;
  rows: PreviewRow[];
  total: number | null;
  warnings: string[];
  availableDealers: string[];
};

type Draft = {
  fileName: string;
  base64: string;
  asOf: string;
  sourceWeek: number;
  preview: Preview | null;
  mappings: Record<string, string[]>;
  error: string | null;
  errorAction: "preview" | "commit" | null;
  notice: string | null;
  warnings: string[];
};

type SourceConfig = {
  kind: UploadKind;
  title: string;
  eyebrow: string;
  previewValueLabel: string;
};

const SOURCE_CONFIGS: SourceConfig[] = [
  {
    kind: "lead-goals",
    title: "Meta de Leads",
    eyebrow: "LeadGoals",
    previewValueLabel: "Meta",
  },
  {
    kind: "sales-goals",
    title: "Meta de Vendas",
    eyebrow: "SalesGoals",
    previewValueLabel: "Meta",
  },
  {
    kind: "sales",
    title: "Atual Vendas",
    eyebrow: "Vendas por dealer · WEEKLY_REG",
    previewValueLabel: "Vendas",
  },
];

const MAX_FILE_BYTES = 1_048_576;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function numberFormat(value: number | null) {
  return value === null
    ? "Indisponível"
    : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
        value
      );
}

function dateTimeFormat(value: string | null) {
  if (!value) return "Importação não informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(parsed);
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message
  ) {
    return error.message;
  }
  return "Não foi possível concluir a operação. Tente novamente.";
}

function monthEnd(month: string) {
  if (!MONTH_PATTERN.test(month)) return "";
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
}

function defaultSalesDate(month: string, cutoff: string) {
  if (!MONTH_PATTERN.test(month) || month > cutoff.slice(0, 7)) return "";
  return month === cutoff.slice(0, 7)
    ? cutoff
    : [monthEnd(month), cutoff].sort()[0];
}

function emptyDraft(kind: UploadKind, month: string): Draft {
  return {
    fileName: "",
    base64: "",
    asOf:
      kind === "sales" ? defaultSalesDate(month, getDashboardCutoffDate()) : "",
    sourceWeek:
      Math.max(
        1,
        Math.min(
          6,
          Math.ceil(
            Number(defaultSalesDate(month, getDashboardCutoffDate()).slice(8)) /
              7
          )
        )
      ) || 1,
    preview: null,
    mappings: {},
    error: null,
    errorAction: null,
    notice: null,
    warnings: [],
  };
}

function initialDrafts(month: string): Record<UploadKind, Draft> {
  return {
    "lead-goals": emptyDraft("lead-goals", month),
    "sales-goals": emptyDraft("sales-goals", month),
    sales: emptyDraft("sales", month),
  };
}

function SourceCard({
  config,
  status,
  draft,
  selectedMonth,
  cutoff,
  busy,
  reading,
  onFile,
  onAsOf,
  onSourceWeek,
  onPreview,
  onCommit,
  onRetry,
  onMapping,
}: {
  config: SourceConfig;
  status: StatusFile | null;
  draft: Draft;
  selectedMonth: string;
  cutoff: string;
  busy: boolean;
  reading: boolean;
  onFile: (file: File | undefined) => void;
  onAsOf: (value: string) => void;
  onSourceWeek: (value: number) => void;
  onPreview: () => void;
  onCommit: () => void;
  onRetry: () => void;
  onMapping: (key: string, dealers: string[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = draft.preview;
  const unlinkedRows = preview
    ? preview.rows.filter(row => !(draft.mappings[row.key] ?? []).length).length
    : 0;
  const hasCurrentFile = Boolean(draft.base64 && draft.fileName);

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#e2212d]">
            {config.eyebrow}
          </p>
          <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900">
            {config.title}
          </h3>
        </div>
        <FileSpreadsheet
          className="h-4 w-4 shrink-0 text-[#e2212d]"
          aria-hidden="true"
        />
      </div>

      <div className="space-y-3 p-4">
        <label className="block">
          <span className="v2-label">Arquivo .xlsx (até 1 MiB)</span>
          <input
            ref={inputRef}
            key={draft.fileName ? "selected-file" : "empty-file"}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={event => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              onFile(file);
            }}
            className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#b41b26]"
          />
        </label>
        {reading ? (
          <p
            role="status"
            className="flex items-center gap-2 text-xs text-slate-500"
          >
            <LoaderCircle
              className="h-3.5 w-3.5 animate-spin"
              aria-hidden="true"
            />
            Lendo o arquivo somente em memória…
          </p>
        ) : draft.fileName ? (
          <p
            className="truncate text-[11px] text-slate-500"
            title={draft.fileName}
          >
            Arquivo carregado:{" "}
            <strong className="text-slate-700">{draft.fileName}</strong>
          </p>
        ) : null}

        {config.kind === "sales" ? (
          <div className="space-y-3">
            <label className="block">
              <span className="v2-label">Data de corte da foto de vendas</span>
              <input
                type="date"
                value={draft.asOf}
                max={cutoff}
                disabled={busy}
                onChange={event => onAsOf(event.target.value)}
                className="v2-input"
                aria-label="Data de corte da foto de vendas"
              />
              <span className="mt-1 block text-[11px] leading-4 text-slate-400">
                Data ISO em America/Sao_Paulo; somente até D-1 e dentro da
                competência.
              </span>
            </label>
            <label className="block">
              <span className="v2-label">Coluna de vendas — WEEKLY_REG</span>
              <select
                value={draft.sourceWeek}
                disabled={busy}
                onChange={event => onSourceWeek(Number(event.target.value))}
                className="v2-input"
              >
                {[1, 2, 3, 4, 5, 6].map(week => (
                  <option key={week} value={week}>
                    W{week}_Reg — semana {week}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] leading-4 text-slate-400">
                Leia a coluna preenchida do arquivo. Não somamos snapshots
                acumulados de semanas diferentes.
              </span>
            </label>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !hasCurrentFile}
            onClick={onPreview}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {busy ? "Processando…" : "Pré-visualizar"}
          </button>
          <button
            type="button"
            disabled={busy || !preview || !hasCurrentFile}
            onClick={onCommit}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#e2212d] px-3 text-xs font-bold text-white transition hover:bg-[#c91c28] disabled:cursor-wait disabled:opacity-50"
          >
            {busy ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Confirmar arquivo
          </button>
        </div>

        {draft.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-[#b41b26]"
          >
            <AlertTriangle
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              aria-hidden="true"
            />
            <span>{draft.error}</span>
            {draft.errorAction ? (
              <button
                type="button"
                onClick={onRetry}
                disabled={busy || !hasCurrentFile}
                className="shrink-0 font-bold underline disabled:opacity-50"
              >
                Tentar novamente
              </button>
            ) : null}
          </div>
        ) : null}
        {draft.notice ? (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs leading-5 text-emerald-800"
          >
            {draft.notice}
          </p>
        ) : null}

        <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-[11px] leading-5 text-slate-500">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-slate-700">
              {status?.configured
                ? "Fonte configurada"
                : "Aguardando importação"}
            </span>
            <span>{status ? `${status.rows} linhas` : "—"}</span>
          </div>
          <p className="mt-0.5 truncate" title={status?.fileName ?? undefined}>
            {status?.fileName ?? "Nenhum arquivo salvo nesta competência."}
          </p>
          <p>
            {status
              ? `Total: ${numberFormat(status.total)} · ${dateTimeFormat(status.importedAt)}`
              : "Total: Indisponível"}
          </p>
          {status?.asOf ? <p>Data de corte: {status.asOf}</p> : null}
          {status?.sourceWeek ? (
            <p>Coluna ativa: W{status.sourceWeek}_Reg</p>
          ) : null}
          {status?.warnings.length ? (
            <ul className="mt-1 space-y-0.5 text-amber-700">
              {status.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>• {warning}</li>
              ))}
            </ul>
          ) : null}
        </div>

        {draft.warnings.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            <p className="font-bold">Avisos da importação</p>
            <ul className="mt-1 space-y-0.5">
              {draft.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>• {warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview ? (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                  Prévia da fonte
                </p>
                <p className="mt-1 text-sm font-bold text-slate-900">
                  Total: {numberFormat(preview.total)}
                </p>
              </div>
              <p className="text-[11px] text-slate-500">
                {preview.rows.length} linhas ·{" "}
                {preview.asOf ? `corte ${preview.asOf}` : selectedMonth}
              </p>
            </div>
            <div className="max-h-[320px] overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-[560px] w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Fonte</th>
                    <th className="px-3 py-2 text-right">
                      {config.previewValueLabel}
                    </th>
                    <th className="px-3 py-2">Dealers da base</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row, index) => {
                    const selected = draft.mappings[row.key] ?? row.rawDealers;
                    return (
                      <tr key={`${row.key}-${index}`} className="align-top">
                        <td className="max-w-[190px] px-3 py-2 text-slate-700">
                          <span
                            className="block break-words font-semibold"
                            title={row.sourceLabel}
                          >
                            {row.sourceLabel}
                          </span>
                          {row.state ? (
                            <span className="text-[11px] text-slate-400">
                              {row.state}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">
                          {numberFormat(row.value)}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            multiple
                            size={Math.min(
                              4,
                              Math.max(2, preview.availableDealers.length)
                            )}
                            value={selected}
                            disabled={busy}
                            onChange={event =>
                              onMapping(
                                row.key,
                                Array.from(
                                  event.currentTarget.selectedOptions,
                                  option => option.value
                                )
                              )
                            }
                            aria-label={`Dealers da base para ${row.sourceLabel}`}
                            className="min-h-16 w-full min-w-[240px] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                          >
                            {preview.availableDealers.length ? (
                              preview.availableDealers.map(dealer => (
                                <option key={dealer} value={dealer}>
                                  {dealer}
                                </option>
                              ))
                            ) : (
                              <option disabled>Nenhum dealer disponível</option>
                            )}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] leading-5 text-slate-500">
              Vínculo de grupo/UF é coletivo: não divide meta entre lojas.
            </p>
            {unlinkedRows ? (
              <p
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800"
              >
                {unlinkedRows} linha(s) sem vínculo. A confirmação preserva o
                total informado, mesmo sem associar essa(s) linha(s) a dealers
                da base.
              </p>
            ) : null}
            {preview.warnings.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
                <p className="font-bold">Avisos da prévia</p>
                <ul className="mt-1 space-y-0.5">
                  {preview.warnings.map((warning, index) => (
                    <li key={`${warning}-${index}`}>• {warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}

export default function V2CommercialUploads({
  competence,
  onUpdated,
}: {
  competence: string;
  onUpdated: () => void | Promise<void>;
}) {
  const [selectedMonth, setSelectedMonth] = useState(competence);
  const [drafts, setDrafts] = useState<Record<UploadKind, Draft>>(() =>
    initialDrafts(competence)
  );
  const [readingKind, setReadingKind] = useState<UploadKind | null>(null);
  const monthTouched = useRef(false);
  const cutoff = useMemo(() => getDashboardCutoffDate(), []);
  const utils = trpc.useUtils();
  const statusQuery = trpc.commercial.status.useQuery(
    { competence: selectedMonth },
    { retry: false, refetchOnWindowFocus: true, staleTime: 0 }
  );
  const previewMutation = trpc.commercial.preview.useMutation();
  const commitMutation = trpc.commercial.commit.useMutation();
  const busy =
    readingKind !== null ||
    previewMutation.isPending ||
    commitMutation.isPending;
  const files = statusQuery.data?.files ?? [];

  useEffect(() => {
    if (!monthTouched.current) setSelectedMonth(competence);
  }, [competence]);

  const updateDraft = (kind: UploadKind, update: (draft: Draft) => Draft) => {
    setDrafts(current => ({ ...current, [kind]: update(current[kind]) }));
  };

  const changeMonth = (nextMonth: string) => {
    if (busy || !MONTH_PATTERN.test(nextMonth)) return;
    monthTouched.current = true;
    setSelectedMonth(nextMonth);
    setDrafts(current => {
      const next = { ...current };
      for (const config of SOURCE_CONFIGS) {
        const currentDraft = current[config.kind];
        next[config.kind] = {
          ...currentDraft,
          preview: null,
          mappings: {},
          error: null,
          errorAction: null,
          warnings: [],
          notice: currentDraft.base64
            ? "Competência alterada. Pré-visualize novamente antes de confirmar."
            : currentDraft.notice,
          asOf:
            config.kind === "sales" ? defaultSalesDate(nextMonth, cutoff) : "",
          sourceWeek:
            Math.max(
              1,
              Math.min(
                6,
                Math.ceil(
                  Number(defaultSalesDate(nextMonth, cutoff).slice(8)) / 7
                )
              )
            ) || 1,
        };
      }
      return next;
    });
  };

  const readFile = (kind: UploadKind, file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      updateDraft(kind, () => ({
        ...emptyDraft(kind, selectedMonth),
        error: "Selecione um arquivo .xlsx.",
      }));
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      updateDraft(kind, () => ({
        ...emptyDraft(kind, selectedMonth),
        error: "O arquivo deve ter no máximo 1 MiB.",
      }));
      return;
    }
    setReadingKind(kind);
    updateDraft(kind, draft => ({
      ...draft,
      fileName: file.name,
      base64: "",
      preview: null,
      mappings: {},
      error: null,
      errorAction: null,
      notice: null,
      warnings: [],
    }));
    const reader = new FileReader();
    reader.onerror = () => {
      setReadingKind(null);
      updateDraft(kind, draft => ({
        ...draft,
        fileName: "",
        base64: "",
        error: "Não foi possível ler o arquivo no navegador.",
        errorAction: null,
      }));
    };
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const separator = dataUrl.indexOf(",");
      const base64 = separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl;
      if (!base64) {
        updateDraft(kind, draft => ({
          ...draft,
          fileName: "",
          error: "O arquivo não pôde ser convertido para envio.",
          errorAction: null,
        }));
      } else {
        updateDraft(kind, draft => ({
          ...draft,
          base64,
          error: null,
          errorAction: null,
        }));
      }
      setReadingKind(null);
    };
    reader.readAsDataURL(file);
  };

  const previewSource = async (kind: UploadKind) => {
    const draft = drafts[kind];
    if (!draft.base64 || !draft.fileName) return;
    const requestMonth = selectedMonth;
    if (kind === "sales") {
      if (
        !draft.asOf ||
        draft.asOf > cutoff ||
        !draft.asOf.startsWith(`${requestMonth}-`)
      ) {
        updateDraft(kind, current => ({
          ...current,
          error:
            "Escolha uma data de corte da competência, sem ultrapassar D-1.",
          errorAction: "preview",
          notice: null,
        }));
        return;
      }
    }
    updateDraft(kind, current => ({
      ...current,
      error: null,
      errorAction: "preview",
      notice: null,
    }));
    try {
      const result = await previewMutation.mutateAsync({
        kind,
        competence: requestMonth,
        fileName: draft.fileName,
        base64: draft.base64,
        ...(kind === "sales" && draft.asOf
          ? { asOf: draft.asOf, sourceWeek: draft.sourceWeek }
          : {}),
      });
      if (requestMonth !== selectedMonth) return;
      updateDraft(kind, current => ({
        ...current,
        preview: result,
        mappings: Object.fromEntries(
          result.rows.map(row => [row.key, row.rawDealers])
        ),
        error: null,
        errorAction: null,
        notice: null,
        warnings: result.warnings,
      }));
    } catch (error) {
      updateDraft(kind, current => ({
        ...current,
        error: errorMessage(error),
        errorAction: "preview",
        notice: null,
      }));
    }
  };

  const commitSource = async (kind: UploadKind) => {
    const draft = drafts[kind];
    if (!draft.preview || !draft.base64 || !draft.fileName) return;
    const duplicateOwners = new Map<string, string[]>();
    for (const config of SOURCE_CONFIGS.filter(
      config => config.kind === kind
    )) {
      const other = drafts[config.kind];
      if (!other.preview) continue;
      for (const [rowKey, dealers] of Object.entries(other.mappings)) {
        const row = other.preview.rows.find(item => item.key === rowKey);
        for (const dealer of dealers) {
          const owners = duplicateOwners.get(dealer) ?? [];
          owners.push(`${config.title}: ${row?.sourceLabel ?? rowKey}`);
          duplicateOwners.set(dealer, owners);
        }
      }
    }
    const duplicate = Array.from(duplicateOwners.entries()).find(
      ([, owners]) => owners.length > 1
    );
    if (duplicate) {
      updateDraft(kind, current => ({
        ...current,
        error: `O dealer da base “${duplicate[0]}” foi vinculado a mais de uma linha (${duplicate[1].join("; ")}). Revise os vínculos antes de confirmar.`,
        errorAction: "commit",
        notice: null,
      }));
      return;
    }
    const savedMonth = selectedMonth;
    updateDraft(kind, current => ({
      ...current,
      error: null,
      errorAction: "commit",
      notice: null,
    }));
    try {
      const result = await commitMutation.mutateAsync({
        kind,
        competence: savedMonth,
        fileName: draft.fileName,
        base64: draft.base64,
        ...(kind === "sales" && draft.asOf
          ? { asOf: draft.asOf, sourceWeek: draft.sourceWeek }
          : {}),
        mappings: draft.mappings,
      });
      const unlinked = draft.preview.rows.filter(
        row => !(draft.mappings[row.key] ?? []).length
      ).length;
      updateDraft(kind, current => ({
        ...current,
        fileName: "",
        base64: "",
        preview: null,
        mappings: {},
        warnings: result.warnings,
        notice: `${result.alreadyImported ? "Arquivo já havia sido importado" : "Arquivo salvo"} para ${savedMonth}.${unlinked ? ` ${unlinked} linha(s) sem vínculo; o total foi preservado.` : ""}`,
        error: null,
        errorAction: null,
      }));
      try {
        await Promise.all([
          utils.commercial.status.invalidate({ competence: savedMonth }),
          utils.leads.dashboard.invalidate(),
          utils.leads.goal.invalidate({ competence: savedMonth }),
          Promise.resolve(onUpdated()),
        ]);
      } catch {
        updateDraft(kind, current => ({
          ...current,
          notice: "Arquivo salvo, não foi possível atualizar a tela.",
        }));
      }
    } catch (error) {
      updateDraft(kind, current => ({
        ...current,
        error: errorMessage(error),
        errorAction: "commit",
        notice: null,
      }));
    }
  };

  return (
    <div className="border-b border-slate-100 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <label className="sm:w-64">
          <span className="v2-label">Competência dos arquivos</span>
          <input
            type="month"
            value={selectedMonth}
            disabled={busy}
            onChange={event => changeMonth(event.target.value)}
            className="v2-input"
            aria-label="Competência dos arquivos"
          />
        </label>
        <p className="max-w-xl text-[11px] leading-5 text-slate-500">
          Cada fonte é importada separadamente. O arquivo fica somente em
          memória até a confirmação; a tela usa exclusivamente o retorno da API
          autenticada.
        </p>
      </div>
      {statusQuery.isLoading ? (
        <p role="status" className="mt-3 text-xs text-slate-500">
          Carregando status das três fontes…
        </p>
      ) : null}
      {statusQuery.error ? (
        <div
          role="alert"
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-[#b41b26]"
        >
          <span>
            Não foi possível carregar o status dos arquivos:{" "}
            {errorMessage(statusQuery.error)}
          </span>
          <button
            type="button"
            onClick={() => void statusQuery.refetch()}
            disabled={busy}
            className="font-bold underline disabled:opacity-50"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {SOURCE_CONFIGS.map(config => (
          <SourceCard
            key={config.kind}
            config={config}
            status={files.find(file => file.kind === config.kind) ?? null}
            draft={drafts[config.kind]}
            selectedMonth={selectedMonth}
            cutoff={cutoff}
            busy={busy}
            reading={readingKind === config.kind}
            onFile={file => readFile(config.kind, file)}
            onAsOf={value =>
              updateDraft(config.kind, draft => ({
                ...draft,
                asOf: value,
                preview: null,
                error: null,
                errorAction: null,
              }))
            }
            onSourceWeek={value =>
              updateDraft(config.kind, draft => ({
                ...draft,
                sourceWeek: value,
                preview: null,
                error: null,
                errorAction: null,
              }))
            }
            onPreview={() => void previewSource(config.kind)}
            onCommit={() => void commitSource(config.kind)}
            onRetry={() =>
              void (drafts[config.kind].errorAction === "commit"
                ? commitSource(config.kind)
                : previewSource(config.kind))
            }
            onMapping={(key, dealers) =>
              updateDraft(config.kind, draft => ({
                ...draft,
                mappings: { ...draft.mappings, [key]: dealers },
                error: null,
                errorAction: null,
              }))
            }
          />
        ))}
      </div>
    </div>
  );
}
