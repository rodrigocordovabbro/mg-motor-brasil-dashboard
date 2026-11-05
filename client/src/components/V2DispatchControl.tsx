import { trpc } from "@/lib/trpc";
import { getDashboardCutoffDate } from "@shared/dashboardDates";
import type {
  DispatchAuditEntry,
  DispatchCell,
  DispatchReport,
  DispatchReportSummary,
  DispatchRow,
} from "@shared/v2Dispatch";
import { effectiveManualOk } from "@shared/v2Dispatch";
import {
  AlertCircle,
  Check,
  Clock3,
  LockKeyhole,
  RefreshCw,
  Search,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const EXCEL_BLUE = "#1F3864";
const GROUP_GRAY = "#D9D9D9";
const DATE_GRAY = "#F2F2F2";

const STICKY_COLUMNS = [
  { width: 310, left: 0 },
  { width: 190, left: 310 },
  { width: 100, left: 500 },
  { width: 100, left: 600 },
] as const;

const DAILY_COLUMNS = [
  { key: "syonet", label: "SYONET", width: 70 },
  { key: "manual", label: "Manual", width: 160 },
  { key: "volume", label: "Vol. Lead", width: 80 },
] as const;

type ManualFilter = "all" | "pending" | "ok";

type V2DispatchControlProps = {
  authenticated?: boolean;
  clientMode?: boolean;
  embedded?: boolean;
};

function numberFormat(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(
    value
  );
}

function timestampFormat(value: string) {
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

function hasSourceOk(cell: DispatchCell) {
  return cell.sourceManual.trim().toUpperCase() === "OK";
}

function stickyStyle(index: number) {
  const column = STICKY_COLUMNS[index];
  return {
    left: column.left,
    minWidth: column.width,
    width: column.width,
    maxWidth: column.width,
  };
}

function sourceCellForDate(row: DispatchRow, date: string) {
  return row.cells.find(cell => cell.date === date) ?? null;
}

function ReportSelector({
  summaries,
  selectedReportId,
  onChange,
  isFetching,
  onRefresh,
}: {
  summaries: DispatchReportSummary[];
  selectedReportId: number | null;
  onChange: (reportId: number) => void;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="min-w-[260px] flex-1 sm:flex-none">
        <span className="v2-label">Seleção do relatório</span>
        <select
          className="v2-input"
          value={selectedReportId ?? ""}
          onChange={event => onChange(Number(event.target.value))}
          disabled={!summaries.length || isFetching}
          aria-label="Seleção do relatório de envios"
        >
          {summaries.map(summary => (
            <option key={summary.id} value={summary.id}>
              {summary.title} · {summary.fileName}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        title="Atualizar lista de relatórios"
        aria-label="Atualizar lista de relatórios"
      >
        <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        Atualizar
      </button>
    </div>
  );
}

function FilterBar({
  search,
  onSearch,
  manualFilter,
  onManualFilter,
  rowCount,
  clientMode,
}: {
  search: string;
  onSearch: (value: string) => void;
  manualFilter: ManualFilter;
  onManualFilter: (value: ManualFilter) => void;
  rowCount: string;
  clientMode: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] sm:flex-row sm:items-end sm:justify-between">
      <label className="min-w-0 flex-1">
        <span className="v2-label">
          {clientMode ? "Buscar loja" : "Buscar loja ou responsável CRM"}
        </span>
        <span className="relative block">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            className="v2-input pl-9"
            value={search}
            onChange={event => onSearch(event.target.value)}
            placeholder="Buscar sem alterar os nomes da fonte"
            aria-label={
              clientMode
                ? "Buscar por loja"
                : "Buscar por loja ou responsável CRM"
            }
          />
        </span>
      </label>
      <label className="sm:w-48">
        <span className="v2-label">Status Manual</span>
        <select
          className="v2-input"
          value={manualFilter}
          onChange={event => onManualFilter(event.target.value as ManualFilter)}
          aria-label="Filtrar status Manual"
        >
          <option value="all">Todos</option>
          <option value="pending">Com pendências</option>
          <option value="ok">Com OK</option>
        </select>
      </label>
      <p className="shrink-0 pb-2 text-xs font-semibold text-slate-500">
        {rowCount}
      </p>
    </div>
  );
}

function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1.5 text-base font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ManualHistory({
  entries,
  isLoading,
  error,
}: {
  entries: DispatchAuditEntry[] | undefined;
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) {
    return <p className="text-xs text-slate-500">Carregando histórico…</p>;
  }
  if (error) {
    return (
      <p role="alert" className="text-xs leading-5 text-red-700">
        Erro ao carregar histórico: {errorMessage(error)}
      </p>
    );
  }
  if (!entries?.length) {
    return (
      <p className="text-xs leading-5 text-slate-500">
        Sem alterações auditadas para esta célula.
      </p>
    );
  }
  return (
    <ol className="max-h-64 space-y-3 overflow-y-auto pr-1">
      {entries.map(entry => (
        <li
          key={entry.id}
          className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-bold text-slate-800">
              {entry.isOk ? "Marcou OK" : "Desmarcou"}
            </p>
            <span className="shrink-0 text-[10px] text-slate-400">
              v{entry.version}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            Por {entry.changedBy || "usuário autenticado"} ·{" "}
            {timestampFormat(entry.createdAt)}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-slate-500">
            Responsável: {entry.reviewerLabel || "Wini"}
          </p>
        </li>
      ))}
    </ol>
  );
}

function ManualCell({
  cell,
  storeName,
  saving,
  saved,
  onToggle,
  historyOpen,
  onHistoryOpenChange,
  historyQuery,
}: {
  cell: DispatchCell;
  storeName: string;
  saving: boolean;
  saved: boolean;
  onToggle: (cell: DispatchCell, isOk: boolean) => void;
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  historyQuery: {
    data: DispatchAuditEntry[] | undefined;
    isLoading: boolean;
    error: unknown;
  };
}) {
  const validation = cell.validation;
  const isOk = effectiveManualOk(cell);
  const sourceOk = hasSourceOk(cell);
  const responsible = validation?.reviewerLabel || "Wini";
  const statusLabel = validation
    ? validation.isOk
      ? "OK"
      : "Pendente"
    : sourceOk
      ? "Arquivo"
      : "Pendente";
  const statusTitle = validation
    ? `${statusLabel}. Atualizado por ${validation.updatedBy || "usuário autenticado"} em ${timestampFormat(validation.updatedAt)}. Responsável: ${responsible}.`
    : sourceOk
      ? "OK do arquivo. Ainda não há validação manual persistida; responsável pela conferência: Wini."
      : "Pendente no arquivo. Responsável pela conferência: Wini.";

  return (
    <div className="flex min-w-0 items-center justify-between gap-1">
      <label className="flex min-w-0 items-center gap-1.5" title={statusTitle}>
        <input
          type="checkbox"
          checked={isOk}
          onChange={event => onToggle(cell, event.target.checked)}
          disabled={saving}
          aria-label={`Manual ${statusLabel} · ${storeName} · ${cell.date}`}
          className="h-5 w-5 shrink-0 accent-[#1F3864] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
        />
        <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700">
          {statusLabel}
        </span>
      </label>
      <div className="flex shrink-0 items-center gap-0.5">
        {sourceOk && !validation ? (
          <button
            type="button"
            onClick={() => onToggle(cell, true)}
            disabled={saving}
            className="rounded px-1 py-0.5 text-[10px] font-bold text-[#1F3864] underline-offset-2 transition hover:bg-slate-100 hover:underline disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
            title="Confirmar o OK do arquivo no fluxo Wini, registrando a conta autenticada"
            aria-label={`Confirmar OK do arquivo · ${storeName} · ${cell.date}`}
          >
            Confirmar
          </button>
        ) : null}
        <Popover open={historyOpen} onOpenChange={onHistoryOpenChange}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              title="Abrir histórico desta célula"
              aria-label={`Histórico Manual · ${storeName} · ${cell.date}`}
            >
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-80"
            aria-labelledby={`manual-history-${cell.id}`}
          >
            <div className="mb-3 border-b border-slate-100 pb-3">
              <p
                id={`manual-history-${cell.id}`}
                className="text-xs font-bold text-slate-900"
              >
                Histórico do Manual
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500">
                {storeName} · {cell.date} · responsável: Wini
              </p>
            </div>
            <ManualHistory
              entries={historyQuery.data}
              isLoading={historyQuery.isLoading}
              error={historyQuery.error}
            />
          </PopoverContent>
        </Popover>
      </div>
      {saved ? (
        <span className="sr-only" role="status">
          Salvo
        </span>
      ) : null}
    </div>
  );
}

function DispatchTable({
  report,
  rows,
  clientMode,
  savingCellIds,
  savedCellId,
  onToggle,
  historyCellId,
  onHistoryCellChange,
  historyQuery,
}: {
  report: DispatchReport;
  rows: DispatchRow[];
  clientMode: boolean;
  savingCellIds: ReadonlySet<number>;
  savedCellId: number | null;
  onToggle: (cell: DispatchCell, isOk: boolean) => void;
  historyCellId: number | null;
  onHistoryCellChange: (cellId: number, open: boolean) => void;
  historyQuery: {
    data: DispatchAuditEntry[] | undefined;
    isLoading: boolean;
    error: unknown;
  };
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastDate = report.days.at(-1)?.date;
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [lastDate]);
  const tableMinWidth = 700 + report.days.length * 310;
  const crmResponsibleLabel = (row: DispatchRow) =>
    clientMode ? "Restrito" : row.crmResponsible;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
        <span>
          Deslize a tabela para consultar os dias. Os checks ficam em Manual.
        </span>
        <button
          type="button"
          className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 font-semibold text-slate-700"
          onClick={() => {
            if (scrollRef.current)
              scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
          }}
        >
          Ir ao último dia
        </button>
      </div>
      <div
        ref={scrollRef}
        className="max-h-[70vh] overflow-auto"
        tabIndex={0}
        role="region"
        aria-label="Tabela de controle por loja e dia"
      >
        <table
          className="dispatch-table border-separate border-spacing-0 text-left text-xs"
          style={{
            minWidth: tableMinWidth,
            width: tableMinWidth,
            tableLayout: "fixed",
          }}
        >
          <caption className="sr-only">
            LEADs Status por loja, responsável CRM, integrações e dia de
            despacho.
          </caption>
          <colgroup>
            {STICKY_COLUMNS.map((column, index) => (
              <col key={`fixed-${index}`} style={{ width: column.width }} />
            ))}
            {report.days.flatMap(day =>
              DAILY_COLUMNS.map(column => (
                <col
                  key={`${day.date}-${column.key}`}
                  style={{ width: column.width }}
                />
              ))
            )}
          </colgroup>
          <thead className="sticky top-0 z-40">
            <tr>
              <th
                data-freeze="meta"
                colSpan={4}
                rowSpan={2}
                aria-hidden="true"
                className="sticky left-0 z-50 border-b border-r border-slate-300 bg-white"
                style={{ left: 0, width: 700, minWidth: 700 }}
              />
              {report.days.map(day => (
                <th
                  key={`group-${day.date}`}
                  colSpan={3}
                  scope="colgroup"
                  className="border-b border-r border-slate-300 px-2 py-2 text-center text-xs font-bold text-slate-800"
                  style={{ backgroundColor: GROUP_GRAY }}
                >
                  LEADs Status
                </th>
              ))}
            </tr>
            <tr>
              {report.days.map(day => (
                <th
                  key={day.date}
                  colSpan={3}
                  scope="colgroup"
                  className="border-b border-r border-slate-300 px-2 py-2 text-center text-xs font-bold text-slate-800"
                  style={{ backgroundColor: DATE_GRAY }}
                  title={`Data de despacho ${day.date}`}
                >
                  {day.label}
                </th>
              ))}
            </tr>
            <tr>
              {[
                "NOME DA LOJA",
                "Responsável por CRM",
                "Integração Syonet",
                "Integração API BBRO",
              ].map((label, index) => (
                <th
                  key={label}
                  scope="col"
                  data-freeze={index === 0 ? "store" : "meta"}
                  className="sticky z-50 border-b border-r border-white/20 px-3 py-2 text-left text-xs font-bold leading-4 text-white"
                  style={{ ...stickyStyle(index), backgroundColor: EXCEL_BLUE }}
                >
                  {label}
                </th>
              ))}
              {report.days.flatMap(day =>
                DAILY_COLUMNS.map(column => (
                  <th
                    key={`${day.date}-${column.key}`}
                    scope="col"
                    className="border-b border-r border-white/20 px-1 py-2 text-center text-xs font-bold leading-4 text-white"
                    style={{
                      minWidth: column.width,
                      width: column.width,
                      backgroundColor: EXCEL_BLUE,
                    }}
                  >
                    {column.label}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map(row => (
                <tr key={row.id} className="group">
                  <td
                    data-freeze="store"
                    className="sticky left-0 z-20 border-b border-r border-slate-200 px-3 py-2.5 align-top text-[12px] font-semibold text-slate-800 group-hover:bg-slate-50"
                    style={{ ...stickyStyle(0), backgroundColor: "#ffffff" }}
                    title={row.storeName}
                  >
                    <span className="whitespace-pre-wrap break-words">
                      {row.storeName}
                    </span>
                  </td>
                  <td
                    data-freeze="meta"
                    className="sticky z-20 border-b border-r border-slate-200 px-3 py-2.5 align-top text-[11px] text-slate-600 group-hover:bg-slate-50"
                    style={{ ...stickyStyle(1), backgroundColor: "#ffffff" }}
                    title={
                      clientMode
                        ? "Responsável por CRM oculto no modo cliente"
                        : row.crmResponsible
                    }
                  >
                    <span className="whitespace-pre-wrap break-words">
                      {crmResponsibleLabel(row)}
                    </span>
                  </td>
                  <td
                    data-freeze="meta"
                    className="sticky z-20 border-b border-r border-slate-200 px-2 py-2.5 align-top text-center text-[10px] text-slate-600 group-hover:bg-slate-50"
                    style={{ ...stickyStyle(2), backgroundColor: "#ffffff" }}
                    title={row.syonetIntegration}
                  >
                    <span className="whitespace-pre-wrap break-words">
                      {row.syonetIntegration}
                    </span>
                  </td>
                  <td
                    data-freeze="meta"
                    className="sticky z-20 border-b border-r border-slate-200 px-2 py-2.5 align-top text-center text-[10px] text-slate-600 group-hover:bg-slate-50"
                    style={{ ...stickyStyle(3), backgroundColor: "#ffffff" }}
                    title={row.bbroIntegration}
                  >
                    <span className="whitespace-pre-wrap break-words">
                      {row.bbroIntegration}
                    </span>
                  </td>
                  {report.days.flatMap(day => {
                    const cell = sourceCellForDate(row, day.date);
                    if (!cell) {
                      return [
                        <td
                          key={`${row.id}-${day.date}-syonet-missing`}
                          className="border-b border-r border-slate-200 px-2 py-2.5 text-center text-slate-300"
                        >
                          —
                        </td>,
                        <td
                          key={`${row.id}-${day.date}-manual-missing`}
                          className="border-b border-r border-slate-200 px-2 py-2.5 text-center text-slate-300"
                        >
                          —
                        </td>,
                        <td
                          key={`${row.id}-${day.date}-volume-missing`}
                          className="border-b border-r border-slate-200 px-2 py-2.5 text-center text-slate-300"
                        >
                          —
                        </td>,
                      ];
                    }
                    return [
                      <td
                        key={`${cell.id}-syonet`}
                        className="border-b border-r border-slate-200 px-2 py-2.5 text-center text-[11px] text-slate-600"
                        title={`SYONET · ${cell.syonet || (cell.volume === null ? "Aguardando" : "—")}`}
                      >
                        {cell.syonet ||
                          (cell.volume === null ? "Aguardando" : "—")}
                      </td>,
                      <td
                        key={`${cell.id}-manual`}
                        className="border-b border-r border-slate-200 px-2 py-2.5 text-slate-700"
                      >
                        <ManualCell
                          cell={cell}
                          storeName={row.storeName}
                          saving={savingCellIds.has(cell.id)}
                          saved={savedCellId === cell.id}
                          onToggle={onToggle}
                          historyOpen={historyCellId === cell.id}
                          onHistoryOpenChange={open =>
                            onHistoryCellChange(cell.id, open)
                          }
                          historyQuery={historyQuery}
                        />
                      </td>,
                      <td
                        key={`${cell.id}-volume`}
                        className="border-b border-r border-slate-200 px-2 py-2.5 text-center text-[11px] font-semibold text-slate-700"
                        title={
                          cell.volume === null
                            ? "Volume aguardando arquivo atualizado"
                            : `Vol. Lead · ${cell.volume}`
                        }
                      >
                        {numberFormat(cell.volume)}
                      </td>,
                    ];
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={4 + report.days.length * 3}
                  className="border-b border-slate-200 px-4 py-10 text-center text-xs text-slate-500"
                >
                  Nenhuma das linhas da fonte corresponde aos filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <th
                data-freeze="meta"
                colSpan={4}
                scope="row"
                className="sticky left-0 z-20 border-r border-t border-slate-300 px-3 py-3 text-left text-[10px] font-bold uppercase leading-4 text-slate-800"
                style={{
                  left: 0,
                  width: 700,
                  minWidth: 700,
                  backgroundColor: GROUP_GRAY,
                }}
              >
                Total da fonte por dia
              </th>
              {report.days.flatMap(day => [
                <td
                  key={`${day.date}-source-syonet`}
                  className="border-r border-t border-slate-300 px-1 py-3 text-center text-[10px] text-slate-400"
                  style={{ backgroundColor: "#fafafa" }}
                >
                  —
                </td>,
                <td
                  key={`${day.date}-source-manual`}
                  className="border-r border-t border-slate-300 px-1 py-3 text-center text-[10px] text-slate-400"
                  style={{ backgroundColor: "#fafafa" }}
                >
                  —
                </td>,
                <td
                  key={`${day.date}-source-volume`}
                  className="border-r border-t border-slate-300 px-1 py-3 text-center text-[11px] font-bold text-slate-800"
                  style={{ backgroundColor: "#fafafa" }}
                  title={
                    day.sourceTotal === null
                      ? "Total aguardando fonte"
                      : `Total informado na fonte em ${day.date}`
                  }
                >
                  {numberFormat(day.sourceTotal)}
                </td>,
              ])}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="border-t border-slate-100 px-4 py-3 text-[11px] leading-5 text-slate-500">
        Totais no rodapé são os totais informados pela fonte para os dias
        exibidos e não mudam com a busca por loja. Dias sem fonte ficam sem
        volume. SYONET e Vol.Lead são somente leitura; apenas o check Manual
        grava uma validação.
      </div>
    </div>
  );
}

function AuthenticationRequired() {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
      <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-bold">Login necessário</p>
        <p className="mt-1 text-xs leading-5">
          Os relatórios de envios só são consultados depois da autenticação.
        </p>
      </div>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
      {label}
    </div>
  );
}

function ErrorPanel({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          <span className="font-bold">Erro ao consultar envios:</span>{" "}
          {errorMessage(error)}
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 text-xs font-bold text-red-800 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        Tentar novamente
      </button>
    </div>
  );
}

export default function V2DispatchControl({
  authenticated = true,
  clientMode = true,
  embedded = false,
}: V2DispatchControlProps = {}) {
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [manualFilter, setManualFilter] = useState<ManualFilter>("all");
  const [savingCellIds, setSavingCellIds] = useState<Set<number>>(
    () => new Set()
  );
  const [savedCellId, setSavedCellId] = useState<number | null>(null);
  const [manualError, setManualError] = useState<string | null>(null);
  const [manualNotice, setManualNotice] = useState<string | null>(null);
  const [historyCellId, setHistoryCellId] = useState<number | null>(null);
  const activeRequests = useRef(new Set<number>());
  const utils = trpc.useUtils();
  const [cutoff, setCutoff] = useState(() => getDashboardCutoffDate());
  const [showCrm, setShowCrm] = useState(() => embedded || !clientMode);
  const [integrationFilter, setIntegrationFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState(
    () => `${getDashboardCutoffDate().slice(0, 7)}-01`
  );
  const [dateTo, setDateTo] = useState(() => getDashboardCutoffDate());
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const preparedKey = useRef<string | null>(null);
  const [prepareRetry, setPrepareRetry] = useState(0);
  const uploadRef = useRef<HTMLInputElement>(null);
  const prepareDayMutation = trpc.dispatch.prepareDay.useMutation();
  const importWorkbookMutation = trpc.dispatch.importWorkbook.useMutation();
  useEffect(() => {
    const id = window.setInterval(
      () => setCutoff(getDashboardCutoffDate()),
      60000
    );
    return () => window.clearInterval(id);
  }, []);
  const previousCutoff = useRef(cutoff);
  useEffect(() => {
    const previous = previousCutoff.current;
    if (previous === cutoff) return;
    previousCutoff.current = cutoff;
    setDateTo(current => (current === previous ? cutoff : current));
    setDateFrom(current =>
      current === `${previous.slice(0, 7)}-01`
        ? `${cutoff.slice(0, 7)}-01`
        : current
    );
  }, [cutoff]);

  const reportsQuery = trpc.dispatch.reports.useQuery(undefined, {
    enabled: authenticated,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const summaries = reportsQuery.data ?? [];

  useEffect(() => {
    setSelectedReportId(current => {
      if (!summaries.length) return null;
      if (
        current !== null &&
        summaries.some(summary => summary.id === current)
      ) {
        return current;
      }
      return summaries[0].id;
    });
  }, [summaries]);

  const reportQuery = trpc.dispatch.report.useQuery(
    { reportId: selectedReportId ?? 0 },
    {
      enabled: authenticated && selectedReportId !== null,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const historyQuery = trpc.dispatch.history.useQuery(
    { cellId: historyCellId ?? 0 },
    {
      enabled: authenticated && historyCellId !== null,
      retry: false,
      refetchOnWindowFocus: false,
    }
  );
  const setManualMutation = trpc.dispatch.setManual.useMutation();

  const report = reportQuery.data;
  const preparePreviousDay = async () => {
    if (selectedReportId === null) return null;
    setPreparing(true);
    setUpdateError(null);
    setUpdateNotice(null);
    try {
      const result = await prepareDayMutation.mutateAsync({
        reportId: selectedReportId,
      });
      await utils.dispatch.report.invalidate({ reportId: selectedReportId });
      if (result.added)
        setUpdateNotice(
          `Dia ${result.date.split("-").reverse().join("/")} preparado. Check Manual pendente; SYONET e volume aguardam o arquivo atualizado.`
        );
      preparedKey.current = `${selectedReportId}:${result.date}`;
      return result;
    } catch (error) {
      preparedKey.current = null;
      setUpdateNotice(null);
      setUpdateError(errorMessage(error));
      return null;
    } finally {
      setPreparing(false);
    }
  };
  useEffect(() => {
    if (!authenticated || selectedReportId === null) return;
    const key = `${selectedReportId}:${cutoff}`;
    if (preparedKey.current === key) return;
    preparedKey.current = key;
    let active = true;
    const retryTimer = window.setTimeout(() => {
      if (active && preparedKey.current !== key && prepareRetry < 1)
        setPrepareRetry(current => current + 1);
    }, 15000);
    void preparePreviousDay();
    return () => {
      active = false;
      window.clearTimeout(retryTimer);
    };
  }, [authenticated, selectedReportId, cutoff, prepareRetry]);
  const visibleReport = useMemo<DispatchReport | undefined>(() => {
    if (!report) return undefined;
    const days = report.days.filter(
      day => day.date >= dateFrom && day.date <= dateTo && day.date <= cutoff
    );
    const dates = new Set(days.map(day => day.date));
    const rows = report.rows.map(row => ({
      ...row,
      cells: row.cells.filter(cell => dates.has(cell.date)),
    }));
    const cells = rows.flatMap(row => row.cells);
    return {
      ...report,
      days,
      rows,
      totals: {
        ...report.totals,
        computed: cells.reduce((sum, cell) => sum + (cell.volume ?? 0), 0),
        sourceDailySum: days.reduce(
          (sum, day) => sum + (day.sourceTotal ?? 0),
          0
        ),
        sourceManualOk: cells.filter(
          cell => cell.sourceManual.trim().toUpperCase() === "OK"
        ).length,
        auditedOk: cells.filter(cell => cell.validation?.isOk).length,
        manualOverridden: cells.filter(cell => cell.validation !== null).length,
      },
    };
  }, [report, dateFrom, dateTo, cutoff]);
  const refreshDaily = async () => {
    const prepared = await preparePreviousDay();
    if (!prepared) return;
    const results = await Promise.all([
      reportsQuery.refetch(),
      reportQuery.refetch(),
    ]);
    if (results.some(result => result.error)) {
      setUpdateNotice(null);
      setUpdateError(
        "Dia preparado, mas não foi possível recarregar os dados. Use Atualizar novamente."
      );
    }
  };
  const uploadWorkbook = async (file: File | undefined) => {
    if (!file || selectedReportId === null) return;
    if (uploading || preparing || savingCellIds.size > 0) return;
    setUpdateError(null);
    setUpdateNotice(null);
    if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 1024 * 1024) {
      setUpdateError("Envie um arquivo Envios .xlsx de até 1 MB.");
      return;
    }
    try {
      setUploading(true);
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () =>
          reject(new Error("Não foi possível ler o arquivo"));
        reader.readAsDataURL(file);
      });
      const imported = await importWorkbookMutation.mutateAsync({
        reportId: selectedReportId,
        fileName: file.name,
        base64,
      });
      const prepared = await preparePreviousDay();
      if (!prepared) {
        setUpdateNotice(null);
        setUpdateError(
          "Arquivo recebido, mas não foi possível concluir a preparação D-1. Use Atualizar para tentar novamente; checks anteriores preservados."
        );
        return;
      }
      await Promise.all([
        utils.dispatch.report.invalidate({ reportId: selectedReportId }),
        utils.dispatch.reports.invalidate(),
      ]);
      const refreshed = await reportQuery.refetch();
      if (refreshed.error) {
        setUpdateNotice(null);
        setUpdateError(
          "Arquivo recebido, mas a tela não foi atualizada. Use Atualizar para recarregar; checks preservados."
        );
        return;
      }
      const future = imported.skippedFutureDays
        ? ` ${imported.skippedFutureDays} dia(s) posterior(es) a D-1 ignorado(s).`
        : "";
      const pending = prepared.missingSource
        ? " D-1 continua aguardando a fonte de envio."
        : "";
      setUpdateNotice(
        imported.alreadyImported
          ? `Arquivo já importado; dados e checks mantidos.${future}${pending}`
          : imported.daysImported === 0
            ? `Arquivo sem dias aplicáveis até D-1; nenhum volume diário atualizado.${future}${pending}`
            : `${imported.daysImported} dia(s) de fonte processado(s) e ${imported.rowsUpdated} loja(s) conciliada(s). Checks e histórico preservados.${future}${pending}`
      );
    } catch (error) {
      setUpdateError(errorMessage(error));
    } finally {
      setUploading(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  };

  const filteredRows = useMemo(() => {
    if (!visibleReport) return [];
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return visibleReport.rows.filter(row => {
      const matchesSearch =
        !normalizedSearch ||
        row.storeName.toLocaleLowerCase("pt-BR").includes(normalizedSearch) ||
        (showCrm &&
          row.crmResponsible
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedSearch));
      if (!matchesSearch) return false;
      const syonet = row.syonetIntegration.trim().toUpperCase();
      const bbro = row.bbroIntegration.trim().toUpperCase();
      if (integrationFilter === "syonet-ok" && syonet !== "OK") return false;
      if (
        integrationFilter === "syonet-no" &&
        syonet !== "NÃO" &&
        syonet !== "NAO"
      )
        return false;
      if (integrationFilter === "bbro-ok" && bbro !== "OK") return false;
      if (manualFilter === "all") return true;
      const hasOk = row.cells.some(cell => effectiveManualOk(cell));
      return manualFilter === "ok"
        ? hasOk
        : row.cells.some(cell => !effectiveManualOk(cell));
    });
  }, [showCrm, manualFilter, visibleReport, search, integrationFilter]);

  const onToggle = async (cell: DispatchCell, isOk: boolean) => {
    if (
      activeRequests.current.has(cell.id) ||
      preparing ||
      importWorkbookMutation.isPending ||
      uploading
    )
      return;
    activeRequests.current.add(cell.id);
    setSavingCellIds(current => {
      const next = new Set(current);
      next.add(cell.id);
      return next;
    });
    setSavedCellId(null);
    setManualError(null);
    setManualNotice(null);
    try {
      const validation = await setManualMutation.mutateAsync({
        cellId: cell.id,
        isOk,
        expectedVersion: cell.validation?.version ?? 0,
      });
      if (selectedReportId !== null)
        utils.dispatch.report.setData(
          { reportId: selectedReportId },
          current =>
            current
              ? {
                  ...current,
                  rows: current.rows.map(row => ({
                    ...row,
                    cells: row.cells.map(sourceCell =>
                      sourceCell.id === cell.id
                        ? { ...sourceCell, validation }
                        : sourceCell
                    ),
                  })),
                }
              : current
        );
      void utils.dispatch.history.invalidate({ cellId: cell.id });
      setSavedCellId(cell.id);
      setManualNotice(
        `Manual ${isOk ? "marcado como OK" : "desmarcado"} e salvo.`
      );
      const refreshed = await reportQuery.refetch();
      if (refreshed.error)
        setManualError(
          "Validação salva, mas não foi possível atualizar o relatório. Use Atualizar para recarregar os dados."
        );
    } catch (error) {
      setManualError(
        `Não foi possível salvar a célula ${cell.id}: ${errorMessage(error)}`
      );
    } finally {
      activeRequests.current.delete(cell.id);
      setSavingCellIds(current => {
        const next = new Set(current);
        next.delete(cell.id);
        return next;
      });
    }
  };

  if (!authenticated) return <AuthenticationRequired />;

  if (reportsQuery.isLoading && !reportsQuery.data) {
    return <LoadingPanel label="Carregando relatórios de envios…" />;
  }
  if (reportsQuery.error && !summaries.length) {
    return (
      <ErrorPanel
        error={reportsQuery.error}
        onRetry={() => void reportsQuery.refetch()}
      />
    );
  }
  if (!summaries.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
        Nenhum relatório de envios disponível para esta sessão.
      </div>
    );
  }
  if (reportQuery.isLoading && !report) {
    return (
      <div className="space-y-4">
        <ReportSelector
          summaries={summaries}
          selectedReportId={selectedReportId}
          onChange={setSelectedReportId}
          isFetching={reportsQuery.isFetching}
          onRefresh={() => void reportsQuery.refetch()}
        />
        <LoadingPanel label="Carregando a fotografia importada…" />
      </div>
    );
  }
  if (reportQuery.error && !report) {
    return (
      <div className="space-y-4">
        <ReportSelector
          summaries={summaries}
          selectedReportId={selectedReportId}
          onChange={setSelectedReportId}
          isFetching={reportsQuery.isFetching}
          onRefresh={() => void reportsQuery.refetch()}
        />
        <ErrorPanel
          error={reportQuery.error}
          onRetry={() => void reportQuery.refetch()}
        />
      </div>
    );
  }
  if (!report) {
    return <LoadingPanel label="Aguardando o relatório selecionado…" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
              Envios · conferência operacional
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
              {embedded
                ? "Lojas & CRM — controle de envios"
                : "Controle de Envios"}
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              {report.title}. Cadastro e integrações conforme o arquivo;
              conferência Manual por Wini. O período operacional termina em D-1
              (São Paulo).
            </p>
          </div>
          <div className="shrink-0 text-left text-xs text-slate-500 lg:text-right">
            <p className="font-semibold text-slate-700">{report.fileName}</p>
            <p className="mt-1">
              {report.importedAt
                ? `Importado em ${timestampFormat(report.importedAt)}`
                : "Importação não informada"}
            </p>
          </div>
        </div>
        <ReportSelector
          summaries={summaries}
          selectedReportId={selectedReportId}
          onChange={setSelectedReportId}
          isFetching={
            reportsQuery.isFetching ||
            reportQuery.isFetching ||
            preparing ||
            importWorkbookMutation.isPending
          }
          onRefresh={() => void refreshDaily()}
        />
      </div>

      {reportsQuery.isFetching || reportQuery.isFetching ? (
        <div
          className="flex items-center gap-2 text-[11px] font-semibold text-slate-500"
          aria-live="polite"
        >
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Atualizando dados protegidos…
        </div>
      ) : null}
      {reportsQuery.error ? (
        <div
          role="alert"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          Não foi possível atualizar a lista de relatórios:{" "}
          {errorMessage(reportsQuery.error)}
        </div>
      ) : null}
      {reportQuery.error && report ? (
        <ErrorPanel
          error={reportQuery.error}
          onRetry={() => void reportQuery.refetch()}
        />
      ) : null}
      {updateError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {updateError}
        </div>
      ) : null}
      {updateNotice ? (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {updateNotice}
        </div>
      ) : null}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label>
            <span className="v2-label">Envios de</span>
            <input
              type="date"
              className="v2-input"
              value={dateFrom}
              max={dateTo}
              onChange={event => setDateFrom(event.target.value)}
            />
          </label>
          <label>
            <span className="v2-label">Até ontem (D-1)</span>
            <input
              type="date"
              className="v2-input"
              value={dateTo}
              min={dateFrom}
              max={cutoff}
              onChange={event =>
                setDateTo(
                  event.target.value > cutoff ? cutoff : event.target.value
                )
              }
            />
          </label>
          <label>
            <span className="v2-label">Integração cadastrada</span>
            <select
              className="v2-input"
              value={integrationFilter}
              onChange={event => setIntegrationFilter(event.target.value)}
            >
              <option value="all">Todas as lojas</option>
              <option value="syonet-ok">Syonet integrado (OK)</option>
              <option value="syonet-no">Syonet não integrado</option>
              <option value="bbro-ok">API BBRO integrada (OK)</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={showCrm}
              onChange={event => setShowCrm(event.target.checked)}
              className="h-4 w-4 accent-[#e2212d]"
            />{" "}
            Mostrar responsáveis CRM
          </label>
          <input
            ref={uploadRef}
            type="file"
            accept=".xlsx"
            className="sr-only"
            aria-label="Arquivo atualizado de Envios"
            onChange={event => void uploadWorkbook(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={
              preparing ||
              importWorkbookMutation.isPending ||
              savingCellIds.size > 0
            }
            onClick={() => uploadRef.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#e2212d] px-4 text-xs font-bold text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {importWorkbookMutation.isPending
              ? "Importando…"
              : "Atualizar arquivo Envios"}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Atualizar prepara os dias ausentes até ontem, sem alterar conferências
          anteriores. Envie o Envios atualizado para preencher volumes e status
          reais. Integração cadastrada não comprova entrega diária. Não há
          conexão live com o CRM.
        </p>
      </section>
      {manualError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-red-800"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{manualError}</span>
        </div>
      ) : null}
      {manualNotice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800"
        >
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          {manualNotice}
        </div>
      ) : null}

      <FilterBar
        search={search}
        onSearch={setSearch}
        manualFilter={manualFilter}
        onManualFilter={setManualFilter}
        rowCount={`${filteredRows.length} de ${report.rows.length} linhas`}
        clientMode={!showCrm}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryFact
          label="Volume informado no período"
          value={
            visibleReport?.rows.some(row =>
              row.cells.some(cell => cell.volume !== null)
            )
              ? numberFormat(visibleReport.totals.computed)
              : "Aguardando fonte"
          }
        />
        <SummaryFact
          label="Linhas na tabela"
          value={numberFormat(report.rows.length)}
        />
        <SummaryFact
          label="OKs do arquivo"
          value={numberFormat(visibleReport?.totals.sourceManualOk ?? 0)}
        />
        <SummaryFact
          label="Validações OK"
          value={numberFormat(visibleReport?.totals.auditedOk ?? 0)}
        />
        <SummaryFact
          label="Células conferidas"
          value={numberFormat(visibleReport?.totals.manualOverridden ?? 0)}
        />
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2">
          Syonet integrado:{" "}
          <strong>
            {
              report.rows.filter(
                row => row.syonetIntegration.trim().toUpperCase() === "OK"
              ).length
            }
          </strong>{" "}
          de {report.rows.length} linhas
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
          BBRO integrado:{" "}
          <strong>
            {
              report.rows.filter(
                row => row.bbroIntegration.trim().toUpperCase() === "OK"
              ).length
            }
          </strong>{" "}
          de {report.rows.length} linhas
        </span>
        <span className="rounded-full border border-slate-200 bg-white px-3 py-2">
          Dias aguardando fonte:{" "}
          <strong>
            {visibleReport?.days.filter(day => day.sourceTotal === null)
              .length ?? 0}
          </strong>
        </span>
      </div>
      {!visibleReport?.days.length ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Nenhum dia nesse intervalo. Ajuste o período ou use Atualizar para
          preparar D-1.
        </div>
      ) : (
        <DispatchTable
          report={visibleReport}
          rows={filteredRows}
          clientMode={!showCrm}
          savingCellIds={savingCellIds}
          savedCellId={savedCellId}
          onToggle={onToggle}
          historyCellId={historyCellId}
          onHistoryCellChange={(cellId, open) =>
            setHistoryCellId(open ? cellId : null)
          }
          historyQuery={historyQuery}
        />
      )}

      <p className="px-1 text-[11px] leading-5 text-slate-500">
        Dados de despacho são atualizados somente pelo arquivo Envios, sem
        conexão live ao CRM. Dias novos recebem check Manual pendente e aguardam
        a fonte. Marcar OK registra a conferência, mas não dispara e-mail, envio
        ou operação de CRM.
      </p>
    </div>
  );
}
