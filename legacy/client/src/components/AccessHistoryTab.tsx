import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Clock3,
  Filter,
  Laptop,
  Loader2,
  LogIn,
  LogOut,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

type DashboardLocale = "pt-BR" | "en-US";
type AccessEventType = "LOGIN_SUCCESS" | "LOGIN_FAILURE" | "LOGOUT";
type AccessEventFilter = AccessEventType | "ALL";

function ui(locale: DashboardLocale, pt: string, en: string) {
  return locale === "en-US" ? en : pt;
}

function startOfLocalDay(value: string) {
  return value ? new Date(`${value}T00:00:00`).getTime() : undefined;
}

function endOfLocalDay(value: string) {
  return value ? new Date(`${value}T23:59:59.999`).getTime() : undefined;
}

export function describeUserAgent(userAgent: string | null, locale: DashboardLocale) {
  if (!userAgent) return ui(locale, "Não informado", "Not provided");

  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /Firefox\//i.test(userAgent)
      ? "Firefox"
      : /(?:Chrome|CriOS)\//i.test(userAgent)
        ? "Chrome"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : ui(locale, "Outro navegador", "Other browser");
  const device = /Android/i.test(userAgent)
    ? "Android"
    : /(?:iPhone|iPad|iPod)/i.test(userAgent)
      ? "iOS"
      : /Mobile/i.test(userAgent)
        ? ui(locale, "Dispositivo móvel", "Mobile device")
        : ui(locale, "Computador", "Desktop");

  return `${browser} • ${device}`;
}

export function formatAccessEventTime(value: number, locale: DashboardLocale) {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function EventBadge({ eventType, locale }: { eventType: AccessEventType; locale: DashboardLocale }) {
  const config = {
    LOGIN_SUCCESS: {
      label: ui(locale, "Acesso autorizado", "Successful login"),
      className: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
      icon: <ShieldCheck className="h-3.5 w-3.5" />,
    },
    LOGIN_FAILURE: {
      label: ui(locale, "Acesso recusado", "Failed login"),
      className: "border-red-500/20 bg-red-500/10 text-red-300",
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
    },
    LOGOUT: {
      label: ui(locale, "Saída", "Logout"),
      className: "border-sky-500/20 bg-sky-500/10 text-sky-300",
      icon: <LogOut className="h-3.5 w-3.5" />,
    },
  }[eventType];

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-semibold ${config.className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

export function AccessHistoryTab({ locale }: { locale: DashboardLocale }) {
  const [usernameDraft, setUsernameDraft] = useState("");
  const [eventTypeDraft, setEventTypeDraft] = useState<AccessEventFilter>("ALL");
  const [dateFromDraft, setDateFromDraft] = useState("");
  const [dateToDraft, setDateToDraft] = useState("");
  const [filters, setFilters] = useState({ username: "", eventType: "ALL" as AccessEventFilter, dateFrom: "", dateTo: "" });
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const queryInput = useMemo(
    () => ({
      page,
      pageSize,
      username: filters.username.trim() || undefined,
      eventType: filters.eventType === "ALL" ? undefined : filters.eventType,
      occurredFrom: startOfLocalDay(filters.dateFrom),
      occurredTo: endOfLocalDay(filters.dateTo),
    }),
    [filters, page],
  );
  const history = trpc.accessHistory.list.useQuery(queryInput, {
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  function applyFilters() {
    setPage(1);
    setFilters({ username: usernameDraft, eventType: eventTypeDraft, dateFrom: dateFromDraft, dateTo: dateToDraft });
  }

  function clearFilters() {
    setUsernameDraft("");
    setEventTypeDraft("ALL");
    setDateFromDraft("");
    setDateToDraft("");
    setPage(1);
    setFilters({ username: "", eventType: "ALL", dateFrom: "", dateTo: "" });
  }

  const data = history.data;
  const hasFilters = Boolean(filters.username || filters.dateFrom || filters.dateTo || filters.eventType !== "ALL");

  return (
    <main className="mx-auto max-w-[1680px] px-4 pb-12 pt-5 lg:px-6">
      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e2212d]">
            <ShieldCheck className="h-3.5 w-3.5" />
            {ui(locale, "Administração", "Administration")}
          </div>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-white">{ui(locale, "Histórico de acessos", "Access history")}</h1>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-slate-600">
            {ui(
              locale,
              "Auditoria de logins autorizados, tentativas recusadas e saídas do dashboard. Senhas e credenciais nunca são registradas.",
              "Audit trail of successful logins, failed attempts, and dashboard logouts. Passwords and credentials are never recorded.",
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => history.refetch()}
          disabled={history.isFetching}
          className="h-9 border-[#283349] bg-[#111827] text-slate-400 hover:bg-[#182236] hover:text-white"
        >
          {history.isFetching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="mr-2 h-3.5 w-3.5" />}
          {ui(locale, "Atualizar", "Refresh")}
        </Button>
      </div>

      <section className="mb-4 rounded-xl border border-[#1e293b] bg-[#0d1421] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Filter className="h-3.5 w-3.5" />
          {ui(locale, "Filtros de auditoria", "Audit filters")}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(180px,1.25fr)_minmax(170px,0.9fr)_160px_160px_auto]">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium text-slate-500">{ui(locale, "Usuário", "Username")}</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
              <Input
                value={usernameDraft}
                onChange={event => setUsernameDraft(event.target.value)}
                onKeyDown={event => event.key === "Enter" && applyFilters()}
                placeholder={ui(locale, "Buscar usuário", "Search username")}
                className="h-9 border-[#283349] bg-[#0a101b] pl-9 text-xs text-white placeholder:text-slate-700"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium text-slate-500">{ui(locale, "Resultado", "Result")}</span>
            <select
              value={eventTypeDraft}
              onChange={event => setEventTypeDraft(event.target.value as AccessEventFilter)}
              className="h-9 w-full rounded-md border border-[#283349] bg-[#0a101b] px-3 text-xs text-slate-300 outline-none focus:border-[#e2212d] focus:ring-2 focus:ring-[#e2212d]/20"
            >
              <option value="ALL">{ui(locale, "Todos os eventos", "All events")}</option>
              <option value="LOGIN_SUCCESS">{ui(locale, "Acesso autorizado", "Successful login")}</option>
              <option value="LOGIN_FAILURE">{ui(locale, "Acesso recusado", "Failed login")}</option>
              <option value="LOGOUT">{ui(locale, "Saída", "Logout")}</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium text-slate-500">{ui(locale, "Data inicial", "Start date")}</span>
            <Input type="date" value={dateFromDraft} max={dateToDraft || undefined} onChange={event => setDateFromDraft(event.target.value)} className="h-9 border-[#283349] bg-[#0a101b] text-xs text-slate-300 [color-scheme:dark]" />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium text-slate-500">{ui(locale, "Data final", "End date")}</span>
            <Input type="date" value={dateToDraft} min={dateFromDraft || undefined} onChange={event => setDateToDraft(event.target.value)} className="h-9 border-[#283349] bg-[#0a101b] text-xs text-slate-300 [color-scheme:dark]" />
          </label>

          <div className="flex items-end gap-2">
            <Button onClick={applyFilters} className="h-9 bg-[#e2212d] px-4 text-xs text-white hover:bg-[#c91622]">
              {ui(locale, "Aplicar", "Apply")}
            </Button>
            <Button variant="outline" onClick={clearFilters} disabled={!hasFilters && !usernameDraft && eventTypeDraft === "ALL" && !dateFromDraft && !dateToDraft} className="h-9 border-[#283349] bg-transparent px-3 text-xs text-slate-500 hover:bg-white/5 hover:text-white">
              {ui(locale, "Limpar", "Clear")}
            </Button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#1e293b] bg-[#0d1421] shadow-[0_8px_24px_rgba(0,0,0,0.14)]">
        <header className="flex min-h-16 flex-col gap-2 border-b border-[#1b2535] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{ui(locale, "Eventos registrados", "Recorded events")}</h2>
            <p className="mt-1 text-[11px] text-slate-600">
              {data ? `${new Intl.NumberFormat(locale).format(data.total)} ${ui(locale, "evento(s)", "event(s)")}` : ui(locale, "Carregando total...", "Loading total...")}
            </p>
          </div>
          {data ? <p className="text-[10px] text-slate-600">{ui(locale, "Página", "Page")} {data.page} {ui(locale, "de", "of")} {data.totalPages}</p> : null}
        </header>

        {history.isLoading ? (
          <div className="grid min-h-72 place-items-center">
            <div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#e2212d]" /><p className="mt-3 text-xs text-slate-500">{ui(locale, "Carregando histórico...", "Loading access history...")}</p></div>
          </div>
        ) : history.error ? (
          <div className="grid min-h-72 place-items-center px-6 text-center">
            <div><AlertTriangle className="mx-auto h-7 w-7 text-red-400" /><p className="mt-3 text-sm font-medium text-white">{ui(locale, "Não foi possível carregar o histórico", "Access history could not be loaded")}</p><p className="mt-1 text-xs text-slate-600">{ui(locale, "Tente atualizar os dados.", "Try refreshing the data.")}</p></div>
          </div>
        ) : !data?.items.length ? (
          <div className="grid min-h-72 place-items-center px-6 text-center">
            <div><Clock3 className="mx-auto h-7 w-7 text-slate-700" /><p className="mt-3 text-sm font-medium text-slate-300">{ui(locale, "Nenhum evento encontrado", "No events found")}</p><p className="mt-1 text-xs text-slate-600">{ui(locale, "Ajuste os filtros ou aguarde novos acessos.", "Change the filters or wait for new activity.")}</p></div>
          </div>
        ) : (
          <div className="text-xs">
            <div className="hidden grid-cols-[1.25fr_0.8fr_0.9fr_0.7fr_1.35fr] border-b border-[#1b2535] bg-[#0a101b] px-5 py-3 text-[9px] uppercase tracking-[0.1em] text-slate-600 md:grid">
              <span>{ui(locale, "Data e hora", "Date and time")}</span>
              <span>{ui(locale, "Usuário", "Username")}</span>
              <span>{ui(locale, "Resultado", "Result")}</span>
              <span>IP</span>
              <span>{ui(locale, "Navegador / dispositivo", "Browser / device")}</span>
            </div>
            <div className="divide-y divide-[#182231]">
              {data.items.map(event => (
                <article
                  key={event.id}
                  data-testid="access-history-row"
                  className="grid gap-3 px-4 py-4 transition-colors hover:bg-white/[0.02] md:grid-cols-[1.25fr_0.8fr_0.9fr_0.7fr_1.35fr] md:items-center md:gap-0 md:px-5 md:py-3.5"
                >
                  <div>
                    <span className="mb-1 block text-[9px] uppercase tracking-[0.1em] text-slate-700 md:hidden">{ui(locale, "Data e hora", "Date and time")}</span>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap tabular-nums text-slate-400"><Clock3 className="h-3.5 w-3.5 text-slate-700" />{formatAccessEventTime(event.occurredAt, locale)}</span>
                  </div>
                  <div>
                    <span className="mb-1 block text-[9px] uppercase tracking-[0.1em] text-slate-700 md:hidden">{ui(locale, "Usuário", "Username")}</span>
                    <span className="inline-flex items-center gap-2 font-medium text-slate-200"><UserRound className="h-3.5 w-3.5 text-slate-600" />{event.username}</span>
                  </div>
                  <div>
                    <span className="mb-1 block text-[9px] uppercase tracking-[0.1em] text-slate-700 md:hidden">{ui(locale, "Resultado", "Result")}</span>
                    <EventBadge eventType={event.eventType as AccessEventType} locale={locale} />
                  </div>
                  <div>
                    <span className="mb-1 block text-[9px] uppercase tracking-[0.1em] text-slate-700 md:hidden">IP</span>
                    <span className="whitespace-nowrap font-mono text-[11px] text-slate-500">{event.ipAddress ?? "—"}</span>
                  </div>
                  <div title={event.userAgent ?? undefined}>
                    <span className="mb-1 block text-[9px] uppercase tracking-[0.1em] text-slate-700 md:hidden">{ui(locale, "Navegador / dispositivo", "Browser / device")}</span>
                    <span className="inline-flex items-center gap-2 text-slate-500"><Laptop className="h-3.5 w-3.5 text-slate-700" />{describeUserAgent(event.userAgent, locale)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {data && data.totalPages > 1 ? (
          <footer className="flex items-center justify-between gap-3 border-t border-[#1b2535] px-5 py-3">
            <Button variant="outline" size="sm" disabled={page <= 1 || history.isFetching} onClick={() => setPage(value => Math.max(1, value - 1))} className="h-8 border-[#283349] bg-transparent text-[10px] text-slate-400 hover:bg-white/5 hover:text-white">
              {ui(locale, "Anterior", "Previous")}
            </Button>
            <span className="text-[10px] text-slate-600">{ui(locale, "Página", "Page")} {data.page} {ui(locale, "de", "of")} {data.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages || history.isFetching} onClick={() => setPage(value => Math.min(data.totalPages, value + 1))} className="h-8 border-[#283349] bg-transparent text-[10px] text-slate-400 hover:bg-white/5 hover:text-white">
              {ui(locale, "Próxima", "Next")}
            </Button>
          </footer>
        ) : null}
      </section>

      <p className="mt-4 flex items-start gap-2 text-[10px] leading-5 text-slate-700">
        <LogIn className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {ui(locale, "Os registros são restritos a administradores autorizados e não incluem senhas, cookies ou conteúdo de sessão.", "Records are restricted to authorized administrators and never include passwords, cookies, or session content.")}
      </p>
    </main>
  );
}
