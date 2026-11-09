import { trpc } from "@/lib/trpc";
import type { CommercialStatusFile } from "@shared/v2Commercial";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  LoaderCircle,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_FILE_BYTES = 1_048_576;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type CombinedGoalRow = {
  key: string;
  sourceLabel: string;
  state: string | null;
  leadGoal: number | null;
  salesGoal: number | null;
  rawDealers: string[];
  isNewDealer?: boolean;
};

type NewDealer = {
  name: string;
  state: string | null;
};

type CombinedGoalsPreview = {
  competence: string;
  fileName: string;
  fileSha256: string;
  rows: CombinedGoalRow[];
  leadTotal: number | null;
  salesTotal: number | null;
  warnings: string[];
  availableDealers: string[];
  newDealers?: NewDealer[];
};

type Draft = {
  fileName: string;
  base64: string;
  preview: CombinedGoalsPreview | null;
  mappings: Record<string, string[]>;
  error: string | null;
  errorAction: "preview" | "commit" | null;
  notice: string | null;
  warnings: string[];
};

export type V2CombinedGoalsUploadProps = {
  competence: string;
  canManage?: boolean;
  onUpdated: () => void | Promise<void>;
  externalBusy?: boolean;
  onBusyChange?: (busy: boolean) => void;
  statusFiles: ReadonlyArray<CommercialStatusFile>;
  onRemove: (file: CommercialStatusFile) => void;
};

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

function emptyDraft(): Draft {
  return {
    fileName: "",
    base64: "",
    preview: null,
    mappings: {},
    error: null,
    errorAction: null,
    notice: null,
    warnings: [],
  };
}

function statusLabel(file: CommercialStatusFile | undefined, title: string) {
  if (!file?.configured) return `${title}: aguardando importação`;
  return `${title}: ${file.rows} linhas · ${numberFormat(file.total)}`;
}

export default function V2CombinedGoalsUpload({
  competence,
  canManage = false,
  onUpdated,
  externalBusy = false,
  onBusyChange,
  statusFiles,
  onRemove,
}: V2CombinedGoalsUploadProps) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [reading, setReading] = useState(false);
  const mounted = useRef(true);
  const readingRef = useRef(false);
  const activeReader = useRef<FileReader | null>(null);
  const readSequence = useRef(0);
  const operationSequence = useRef(0);
  const operationLocked = useRef(false);
  const utils = trpc.useUtils();
  const previewMutation = trpc.commercial.previewGoals.useMutation();
  const commitMutation = trpc.commercial.commitGoals.useMutation();
  const ownBusy =
    reading || previewMutation.isPending || commitMutation.isPending;
  const busy = ownBusy || externalBusy;
  const preview = draft.preview;
  const hasCurrentFile = Boolean(draft.fileName && draft.base64);
  const leadStatus = statusFiles.find(file => file.kind === "lead-goals");
  const salesGoalStatus = statusFiles.find(file => file.kind === "sales-goals");
  const unlinkedRows = preview
    ? preview.rows.filter(row => !(draft.mappings[row.key] ?? []).length).length
    : 0;
  const statusWarnings = useMemo(
    () => [leadStatus?.warnings ?? [], salesGoalStatus?.warnings ?? []].flat(),
    [leadStatus?.warnings, salesGoalStatus?.warnings]
  );
  const newDealers = useMemo(() => {
    const explicit = preview?.newDealers ?? [];
    const rowDealers =
      preview?.rows
        .filter(row => row.isNewDealer)
        .map(row => ({ name: row.sourceLabel, state: row.state })) ?? [];
    const seen = new Set<string>();
    return [...explicit, ...rowDealers].filter(dealer => {
      const key = `${dealer.name}\u0000${dealer.state ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [preview]);

  useEffect(() => {
    onBusyChange?.(ownBusy);
  }, [onBusyChange, ownBusy]);

  useEffect(() => {
    readSequence.current += 1;
    operationSequence.current += 1;
    const reader = activeReader.current;
    if (reader) {
      activeReader.current = null;
      readingRef.current = false;
      operationLocked.current = false;
      try {
        reader.abort();
      } catch {
        // The local reader is already being torn down.
      }
    }
    if (!mounted.current) return;
    setDraft(emptyDraft());
    setReading(false);
  }, [competence]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      readSequence.current += 1;
      operationSequence.current += 1;
      const reader = activeReader.current;
      activeReader.current = null;
      readingRef.current = false;
      operationLocked.current = false;
      try {
        reader?.abort();
      } catch {
        // Do not cancel an already submitted preview/commit operation.
      }
    };
  }, []);

  const updateDraft = (update: (current: Draft) => Draft) => {
    if (!mounted.current) return;
    setDraft(current => update(current));
  };

  const readFile = (file: File | undefined) => {
    if (!file || busy || operationLocked.current) return;
    if (!file.name.toLocaleLowerCase().endsWith(".xlsx")) {
      setDraft({
        ...emptyDraft(),
        error: "Selecione um arquivo .xlsx.",
      });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setDraft({
        ...emptyDraft(),
        error: "O arquivo deve ter no máximo 1 MiB.",
      });
      return;
    }

    operationLocked.current = true;
    const sequence = ++readSequence.current;
    readingRef.current = true;
    setReading(true);
    setDraft({
      ...emptyDraft(),
      fileName: file.name,
    });
    const reader = new FileReader();
    activeReader.current = reader;
    const finishRead = () => {
      if (activeReader.current !== reader) return false;
      activeReader.current = null;
      readingRef.current = false;
      operationLocked.current = false;
      if (mounted.current) setReading(false);
      return true;
    };
    const failRead = (message: string) => {
      if (!finishRead()) return;
      if (!mounted.current || sequence !== readSequence.current) return;
      setDraft({
        ...emptyDraft(),
        error: message,
      });
    };
    reader.onerror = () => {
      failRead("Não foi possível ler o arquivo no navegador.");
    };
    reader.onabort = () => {
      failRead("Leitura cancelada. Selecione o arquivo novamente.");
    };
    reader.onload = () => {
      if (activeReader.current !== reader) return;
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const separator = dataUrl.indexOf(",");
      const base64 = separator >= 0 ? dataUrl.slice(separator + 1) : dataUrl;
      if (!base64) {
        failRead("O arquivo não pôde ser convertido para envio.");
        return;
      }
      if (!finishRead()) return;
      if (!mounted.current || sequence !== readSequence.current) return;
      setDraft({
        ...emptyDraft(),
        fileName: file.name,
        base64,
      });
    };
    try {
      reader.readAsDataURL(file);
    } catch {
      failRead("Não foi possível iniciar a leitura do arquivo no navegador.");
    }
  };

  const previewGoals = async () => {
    if (
      busy ||
      operationLocked.current ||
      !hasCurrentFile ||
      !MONTH_PATTERN.test(competence)
    )
      return;
    operationLocked.current = true;
    const requestCompetence = competence;
    const requestFileName = draft.fileName;
    const requestBase64 = draft.base64;
    const requestOperation = operationSequence.current;
    updateDraft(current => ({
      ...current,
      error: null,
      errorAction: "preview",
      notice: null,
    }));
    try {
      const result = await previewMutation.mutateAsync({
        competence: requestCompetence,
        fileName: requestFileName,
        base64: requestBase64,
      });
      if (
        !mounted.current ||
        requestCompetence !== competence ||
        requestOperation !== operationSequence.current ||
        readSequence.current <= 0
      )
        return;
      updateDraft(current => {
        if (
          current.fileName !== requestFileName ||
          current.base64 !== requestBase64
        )
          return current;
        const nextPreview = result as CombinedGoalsPreview;
        return {
          ...current,
          preview: nextPreview,
          mappings: Object.fromEntries(
            nextPreview.rows.map(row => [row.key, row.rawDealers])
          ),
          error: null,
          errorAction: null,
          notice: null,
          warnings: nextPreview.warnings,
        };
      });
    } catch (error) {
      if (
        !mounted.current ||
        requestOperation !== operationSequence.current
      )
        return;
      updateDraft(current => ({
        ...current,
        error: errorMessage(error),
        errorAction: "preview",
        notice: null,
      }));
    } finally {
      operationLocked.current = false;
    }
  };

  const commitGoals = async () => {
    const currentPreview = draft.preview;
    if (busy || operationLocked.current || !currentPreview || !hasCurrentFile)
      return;
    if (
      currentPreview.competence !== competence ||
      currentPreview.fileName !== draft.fileName
    ) {
      updateDraft(current => ({
        ...current,
        error:
          "A prévia não corresponde ao arquivo ou à competência atual. Pré-visualize novamente antes de confirmar.",
        errorAction: "preview",
        notice: null,
      }));
      return;
    }

    operationLocked.current = true;
    const savedCompetence = competence;
    const savedFileName = draft.fileName;
    const mappings = draft.mappings;
    const requestOperation = operationSequence.current;
    updateDraft(current => ({
      ...current,
      error: null,
      errorAction: "commit",
      notice: null,
    }));
    try {
      const result = await commitMutation.mutateAsync({
        competence: savedCompetence,
        fileName: savedFileName,
        base64: draft.base64,
        mappings,
      });
      const warnings = [
        ...(result.lead?.warnings ?? []),
        ...(result.sales?.warnings ?? []),
      ];
      if (
        !mounted.current ||
        requestOperation !== operationSequence.current ||
        savedCompetence !== competence
      ) {
        if (!mounted.current) return;
        try {
          await Promise.all([
            utils.commercial.status.invalidate({ competence: savedCompetence }),
            utils.leads.dashboard.invalidate(),
            utils.leads.goal.invalidate({ competence: savedCompetence }),
          ]);
          if (mounted.current) await onUpdated();
        } catch {
          // A newer competence is already on screen; do not surface a stale
          // refresh error in that newer draft.
        }
        return;
      }
      updateDraft(current => ({
        ...current,
        fileName: "",
        base64: "",
        preview: null,
        mappings: {},
        warnings,
        notice: `${result.alreadyImported ? "Arquivo já havia sido importado" : "Metas de Leads e Vendas salvas"} para ${savedCompetence}.${unlinkedRows ? ` ${unlinkedRows} linha(s) sem vínculo; o total foi preservado.` : ""}`,
        error: null,
        errorAction: null,
      }));
      try {
        await Promise.all([
          utils.commercial.status.invalidate({ competence: savedCompetence }),
          utils.leads.dashboard.invalidate(),
          utils.leads.goal.invalidate({ competence: savedCompetence }),
        ]);
        if (mounted.current) await onUpdated();
      } catch {
        if (!mounted.current) return;
        updateDraft(current => ({
          ...current,
          notice:
            "Metas salvas, mas não foi possível atualizar todos os dados da tela.",
        }));
      }
    } catch (error) {
      if (
        !mounted.current ||
        requestOperation !== operationSequence.current ||
        savedCompetence !== competence
      )
        return;
      updateDraft(current => ({
        ...current,
        error: errorMessage(error),
        errorAction: "commit",
        notice: null,
      }));
    } finally {
      operationLocked.current = false;
    }
  };

  if (!canManage) return null;

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#e2212d]">
            DEALER · TOTAL DEALER · SALES
          </p>
          <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900">
            Metas de Leads e Vendas
          </h3>
        </div>
        <FileSpreadsheet
          className="h-4 w-4 shrink-0 text-[#e2212d]"
          aria-hidden="true"
        />
      </div>

      <div className="space-y-3 p-4">
        <p className="text-xs leading-5 text-slate-500">
          Envie um único arquivo .xlsx com o padrão oficial DEALER / TOTAL
          DEALER / SALES. O arquivo fica somente em memória até a confirmação;
          nada é importado automaticamente.
        </p>
        <label className="block">
          <span className="v2-label">Arquivo .xlsx (até 1 MiB)</span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={event => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              readFile(file);
            }}
            className="block w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-red-50 file:px-3 file:py-2 file:text-xs file:font-bold file:text-[#b41b26]"
            aria-label="Arquivo XLSX de metas de Leads e Vendas"
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

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-700">
                TOTAL DEALER · Leads
              </span>
              <span className="font-bold text-slate-900">
                {numberFormat(leadStatus?.total ?? null)}
              </span>
            </div>
            <p
              className="mt-0.5 truncate"
              title={leadStatus?.fileName ?? undefined}
            >
              {statusLabel(leadStatus, "Meta de Leads")}
            </p>
            {leadStatus?.configured ? (
              <p>{dateTimeFormat(leadStatus.importedAt)}</p>
            ) : null}
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-[11px] leading-5 text-slate-600">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-slate-700">SALES · Vendas</span>
              <span className="font-bold text-slate-900">
                {numberFormat(salesGoalStatus?.total ?? null)}
              </span>
            </div>
            <p
              className="mt-0.5 truncate"
              title={salesGoalStatus?.fileName ?? undefined}
            >
              {statusLabel(salesGoalStatus, "Meta de Vendas")}
            </p>
            {salesGoalStatus?.configured ? (
              <p>{dateTimeFormat(salesGoalStatus.importedAt)}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !hasCurrentFile}
            onClick={() => void previewGoals()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            {previewMutation.isPending ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {previewMutation.isPending ? "Processando…" : "Pré-visualizar"}
          </button>
          <button
            type="button"
            disabled={busy || !preview || !hasCurrentFile}
            onClick={() => void commitGoals()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#e2212d] px-3 text-xs font-bold text-white transition hover:bg-[#c91c28] disabled:cursor-wait disabled:opacity-50"
          >
            {commitMutation.isPending ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {commitMutation.isPending ? "Importando…" : "Confirmar metas"}
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
                onClick={() =>
                  void (draft.errorAction === "commit"
                    ? commitGoals()
                    : previewGoals())
                }
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
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800"
          >
            {draft.notice}
          </p>
        ) : null}

        {statusWarnings.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            <p className="font-bold">Avisos dos arquivos ativos</p>
            <ul className="mt-1 space-y-0.5">
              {statusWarnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>• {warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {newDealers.length ? (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] leading-5 text-blue-900">
            <p className="font-bold">Novas concessionárias detectadas</p>
            <p>
              Serão cadastradas somente ao confirmar a importação transacional;
              a prévia não altera a base.
            </p>
            <ul className="mt-1 space-y-0.5">
              {newDealers.map(dealer => (
                <li key={`${dealer.name}-${dealer.state ?? ""}`}>
                  • {dealer.name}
                  {dealer.state ? ` · ${dealer.state}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-[11px] leading-5 text-slate-600">
          <p className="font-bold text-slate-700">
            Fontes ativas nesta competência
          </p>
          {[
            { file: leadStatus, title: "Meta de Leads" },
            { file: salesGoalStatus, title: "Meta de Vendas" },
          ].map(({ file, title }) => (
            <div
              key={title}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2 first:border-t-0 first:pt-0"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-700">{title}</p>
                <p className="truncate" title={file?.fileName ?? undefined}>
                  {file?.fileName ?? "Nenhum arquivo salvo nesta competência."}
                </p>
              </div>
              {file?.configured && file.id != null ? (
                <button
                  type="button"
                  onClick={() => onRemove(file)}
                  disabled={busy}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 text-[11px] font-bold text-[#b41b26] transition hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Remover
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {draft.warnings.length ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
            <p className="font-bold">Avisos da prévia</p>
            <ul className="mt-1 space-y-0.5">
              {draft.warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>• {warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {preview ? (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#b41b26]">
                  TOTAL DEALER · Leads
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">
                  {numberFormat(preview.leadTotal)}
                </p>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#b41b26]">
                  SALES · Vendas
                </p>
                <p className="mt-0.5 text-sm font-bold text-slate-900">
                  {numberFormat(preview.salesTotal)}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Prévia dos dados originais
              </p>
              <p className="text-[11px] text-slate-500">
                {preview.rows.length} linhas · {preview.competence}
              </p>
            </div>
            <div className="max-h-[320px] overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-[760px] w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">DEALER · dados originais</th>
                    <th className="px-3 py-2 text-right">
                      TOTAL DEALER · Leads
                    </th>
                    <th className="px-3 py-2 text-right">SALES · Vendas</th>
                    <th className="px-3 py-2">Dealers da base</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.rows.map((row, index) => {
                    const selected = draft.mappings[row.key] ?? row.rawDealers;
                    return (
                      <tr key={`${row.key}-${index}`} className="align-top">
                        <td className="max-w-[220px] px-3 py-2 text-slate-700">
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
                          <span className="mt-1 block text-[10px] text-slate-400">
                            Original:{" "}
                            {row.rawDealers.length
                              ? row.rawDealers.join(", ")
                              : "grupo sem dealer associado"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">
                          {numberFormat(row.leadGoal)}
                        </td>
                        <td className="px-3 py-2 text-right font-bold text-slate-900">
                          {numberFormat(row.salesGoal)}
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
                              updateDraft(current => ({
                                ...current,
                                mappings: {
                                  ...current.mappings,
                                  [row.key]: Array.from(
                                    event.currentTarget.selectedOptions,
                                    option => option.value
                                  ),
                                },
                                error: null,
                                errorAction: null,
                              }))
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
              O vínculo de grupo/UF é coletivo e preserva os dados originais:
              não há rateio da meta entre lojas.
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
