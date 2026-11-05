import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import {
  BadgeDollarSign,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Eye,
  EyeOff,
  FileLock2,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  PanelLeftClose,
  Phone,
  RefreshCcw,
  Search,
  ShieldCheck,
  TrendingUp,
  UserRound,
  UsersRound,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocation } from "wouter";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUMBER = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export type PartnerFilter = "all" | "webmotors" | "mercado-livre";

type FinanceiroPartner = {
  id: Exclude<PartnerFilter, "all">;
  plannedNetInvestment: number | null;
  actualLeads: number;
  estimatedImpressions: number | null;
};

export const FINANCEIRO_PARTNERS = {
  all: {
    label: "Visão geral",
    shortLabel: "Todos",
    description: "Consolidado dos parceiros",
    logo: null,
    accent: "border-[#e2212d] bg-[#e2212d] text-white shadow-[0_12px_28px_rgba(226,33,45,0.22)]",
  },
  webmotors: {
    label: "Webmotors",
    shortLabel: "Webmotors",
    description: "Portal automotivo",
    logo: "/manus-storage/webmotors-logo_59a1b39b.png",
    accent: "border-[#f05438] bg-[#f05438]/10 text-[#ff806c]",
  },
  "mercado-livre": {
    label: "Mercado Livre",
    shortLabel: "Mercado Livre",
    description: "Marketplace automotivo",
    logo: "/manus-storage/mercado-livre-logo_b206cb3b.png",
    accent: "border-[#f5cf34] bg-[#f5cf34]/10 text-[#ffe477]",
  },
} as const;

export function summarizeFinanceiroPartners(partners: FinanceiroPartner[]) {
  const hasPlan = partners.some(partner => partner.plannedNetInvestment != null);
  const plannedNetInvestment = hasPlan ? partners.reduce((total, partner) => total + (partner.plannedNetInvestment ?? 0), 0) : null;
  const actualLeads = partners.reduce((total, partner) => total + partner.actualLeads, 0);
  const estimatedImpressions = partners.some(partner => partner.estimatedImpressions == null)
    ? null
    : partners.reduce((total, partner) => total + (partner.estimatedImpressions ?? 0), 0);

  return {
    plannedNetInvestment,
    actualLeads,
    referenceCpl: plannedNetInvestment != null && actualLeads > 0 ? plannedNetInvestment / actualLeads : null,
    estimatedImpressions,
  };
}

function formatMonth(competence: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(`${competence}-01T12:00:00`))
    .replace(/^./, letter => letter.toUpperCase());
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function formatCurrency(value: number | null) {
  return value == null ? "—" : BRL.format(value);
}

function PartnerMark({ partnerId, compact = false }: { partnerId: Exclude<PartnerFilter, "all">; compact?: boolean }) {
  const partner = FINANCEIRO_PARTNERS[partnerId];
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white ${compact ? "h-7 w-12 p-1" : "h-11 w-16 p-1.5"}`}>
      <img src={partner.logo} alt={`Logo ${partner.label}`} className="h-full w-full object-contain" />
    </span>
  );
}

function SummaryMetric({
  label,
  value,
  detail,
  icon: Icon,
  accent = "text-[#e2212d]",
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof CircleDollarSign;
  accent?: string;
}) {
  return (
    <section className="rounded-2xl border border-[#243047] bg-[#101827] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.16)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
          <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
        </div>
        <span className={`grid h-9 w-9 place-items-center rounded-xl bg-white/[0.04] ${accent}`}><Icon className="h-4 w-4" /></span>
      </div>
    </section>
  );
}

type FinanceiroPartnerAnalytics = {
  id: Exclude<PartnerFilter, "all">;
  label: string;
  daily: Array<{ date: string; leads: number }>;
  models: Array<{ model: string; leads: number }>;
  actualLeads: number;
  devicePlanning: {
    status: "ATIVA";
    source: "REFERENCIA_DE_PLANEJAMENTO";
    devices: Array<{
      device: "Mobile" | "Desktop";
      share: number;
      estimatedImpressions: number | null;
      modeledLeads: number;
    }>;
  };
};

function PartnerLeadCharts({ partner }: { partner: FinanceiroPartnerAnalytics }) {
  const color = partner.id === "webmotors" ? "#f05438" : "#f5cf34";
  const hasLeads = partner.daily.some(item => item.leads > 0);

  return (
    <section className="overflow-hidden rounded-2xl border border-[#243047] bg-[#101827]">
      <div className="flex items-center justify-between gap-3 border-b border-[#223047] px-5 py-4">
        <div className="flex items-center gap-3">
          <PartnerMark partnerId={partner.id} />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Visão analítica</p>
            <h3 className="mt-0.5 text-sm font-semibold text-white">Entrega de Leads — {partner.label}</h3>
          </div>
        </div>
        <span className="rounded-full border border-[#334159] bg-[#0b111d] px-2.5 py-1 text-[9px] font-semibold text-slate-400">Dados canônicos</span>
      </div>
      {hasLeads ? (
        <div className="grid xl:grid-cols-2">
          <div className="min-h-[300px] border-b border-[#223047] p-4 xl:border-b-0 xl:border-r">
            <div className="mb-2"><p className="text-[10px] font-semibold text-slate-300">Leads por dia</p><p className="text-[10px] text-slate-600">Competência selecionada</p></div>
            <div className="h-[245px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={partner.daily} margin={{ top: 12, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="#1d2737" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={value => formatDate(String(value)).slice(0, 5)} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} minTickGap={22} />
                  <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} width={34} />
                  <Tooltip labelFormatter={value => formatDate(String(value))} formatter={value => [NUMBER.format(Number(value)), "Leads"]} contentStyle={{ background: "#080d16", border: "1px solid #2a364b", borderRadius: 8, fontSize: 10 }} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="leads" name="Leads" fill={color} radius={[4, 4, 0, 0]} maxBarSize={26} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="min-h-[300px] p-4">
            <div className="mb-2"><p className="text-[10px] font-semibold text-slate-300">Mix de modelos</p><p className="text-[10px] text-slate-600">Distribuição dos Leads recebidos</p></div>
            <div className="h-[245px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={partner.models.slice(0, 8)} layout="vertical" margin={{ top: 8, right: 26, left: 10, bottom: 0 }}>
                  <CartesianGrid stroke="#1d2737" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fill: "#64748b", fontSize: 9 }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="model" width={78} tick={{ fill: "#94a3b8", fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={value => [NUMBER.format(Number(value)), "Leads"]} contentStyle={{ background: "#080d16", border: "1px solid #2a364b", borderRadius: 8, fontSize: 10 }} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                  <Bar dataKey="leads" name="Leads" radius={[0, 4, 4, 0]} maxBarSize={24}>{partner.models.slice(0, 8).map((item, index) => <Cell key={item.model} fill={index === 0 ? color : `${color}9c`} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : <div className="grid min-h-[220px] place-items-center px-6 text-center"><div><BarChart3 className="mx-auto h-7 w-7 text-slate-700" /><p className="mt-3 text-sm font-medium text-slate-300">Sem Leads no período</p><p className="mt-1 text-xs text-slate-600">Selecione outra competência para visualizar a evolução do parceiro.</p></div></div>}
    </section>
  );
}

function PartnerDeviceProfileCharts({ partner }: { partner: FinanceiroPartnerAnalytics }) {
  const devices = partner.devicePlanning.devices;
  const partnerColor = partner.id === "webmotors" ? "#f05438" : "#f5cf34";
  const colors = [partnerColor, "#48627f"];
  const mobile = devices.find(item => item.device === "Mobile");
  const desktop = devices.find(item => item.device === "Desktop");
  const totalEstimatedImpressions = devices.reduce((total, item) => total + (item.estimatedImpressions ?? 0), 0);

  function renderDonut(title: string, detail: string, centerLabel: string, centerValue: string) {
    return (
      <article className="min-h-[310px] p-4">
        <div className="mb-1 flex items-start justify-between gap-3"><div><p className="text-[11px] font-semibold text-slate-200">{title}</p><p className="mt-0.5 text-[10px] text-slate-600">{detail}</p></div></div>
        <div className="relative h-[190px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={devices} dataKey="share" nameKey="device" innerRadius={50} outerRadius={76} paddingAngle={3} stroke="none">
                {devices.map((item, index) => <Cell key={item.device} fill={colors[index]} />)}
              </Pie>
              <Tooltip formatter={(value, _name, item) => [`${NUMBER.format(Number(value))}%`, String(item.payload?.device ?? "")] } contentStyle={{ background: "#080d16", border: "1px solid #2a364b", borderRadius: 8, fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-600">{centerLabel}</p><p className="mt-1 text-lg font-semibold text-white">{centerValue}</p></div></div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[#1d283a] pt-3">
          {devices.map((item, index) => <div key={item.device} className="rounded-lg bg-[#0b111d] px-3 py-2"><p className="flex items-center gap-1.5 text-[10px] text-slate-400"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: colors[index] }} />{item.device}</p><p className="mt-1 text-sm font-semibold text-white">{item.share}%</p></div>)}
        </div>
      </article>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[#243047] bg-[#101827]">
      <div className="flex flex-col gap-3 border-b border-[#223047] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><PartnerMark partnerId={partner.id} /><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Perfil de dispositivo</p><h3 className="mt-0.5 text-sm font-semibold text-white">Impressões e Leads — {partner.label}</h3></div></div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-[9px] font-semibold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Configuração ativada</span>
      </div>
      <div className="grid divide-y divide-[#223047] xl:grid-cols-2 xl:divide-x xl:divide-y-0">
        {renderDonut("Impressões por dispositivo", "Estimativa de plano por Mobile e Desktop", "Impressões", totalEstimatedImpressions > 0 ? NUMBER.format(totalEstimatedImpressions) : "—")}
        {renderDonut("Leads por dispositivo", "Rateio de leitura sobre Leads canônicos", "Leads", NUMBER.format(partner.actualLeads))}
      </div>
      <div className="border-t border-amber-400/15 bg-amber-400/[0.035] px-5 py-3 text-[10px] leading-5 text-amber-100/75"><strong className="font-semibold text-amber-300">Perfil de referência:</strong> Mobile {mobile?.share ?? 0}% / Desktop {desktop?.share ?? 0}% nesta competência. As impressões e os Leads por dispositivo são uma visualização de planejamento solicitada, não uma mensuração reportada pelos veículos.</div>
    </section>
  );
}

function FinanceiroLogin({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = trpc.dashboardAuth.login.useMutation({ onSuccess: onAuthenticated });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    login.mutate({ username, password });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#080c15] px-5 py-10 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-[#273247] bg-[#101827] p-7 shadow-[0_28px_80px_rgba(0,0,0,0.45)]">
        <div className="mb-7 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e2212d]/10 text-[#ff5360]"><LockKeyhole className="h-5 w-5" /></span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e2212d]">MG Motors</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-white">Portal Financeiro</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-slate-400">Acesso restrito aos dados de Webmotors e Mercado Livre, com visão mensal de plano e Leads canônicos.</p>
        <form className="space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Usuário</span>
            <Input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required className="h-11 border-[#2a364c] bg-[#0b111d] text-white placeholder:text-slate-700" placeholder="Digite seu usuário" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Senha</span>
            <span className="relative block">
              <Input value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-11 border-[#2a364c] bg-[#0b111d] pr-11 text-white placeholder:text-slate-700" placeholder="Digite sua senha" />
              <button type="button" onClick={() => setShowPassword(current => !current)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-500 hover:text-white">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
          {login.error ? <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-xs text-red-300">{login.error.message}</p> : null}
          <Button type="submit" disabled={login.isPending} className="h-11 w-full bg-[#e2212d] font-semibold text-white hover:bg-[#c91825]">
            {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Entrar no portal financeiro
          </Button>
        </form>
      </section>
    </main>
  );
}

function FinanceiroContent() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const session = trpc.dashboardAuth.session.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const canAccess = Boolean(session.data?.permissions.canAccessFinanceiro);
  const months = trpc.financeiro.months.useQuery(undefined, { enabled: canAccess, staleTime: 5 * 60 * 1000 });
  const [competence, setCompetence] = useState("");
  const [partnerFilter, setPartnerFilter] = useState<PartnerFilter>("all");
  const [search, setSearch] = useState("");
  const data = trpc.financeiro.dashboard.useQuery({ competence }, {
    enabled: canAccess && /^\d{4}-\d{2}$/.test(competence),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const logout = trpc.dashboardAuth.logout.useMutation({
    onSuccess: async () => {
      await utils.dashboardAuth.session.invalidate();
      setLocation("/financeiro");
    },
  });

  useEffect(() => {
    if (!competence && months.data?.[0]) setCompetence(months.data[0]);
  }, [competence, months.data]);

  const selectedPartners = useMemo(() => {
    if (!data.data) return [];
    return partnerFilter === "all" ? data.data.partners : data.data.partners.filter(partner => partner.id === partnerFilter);
  }, [data.data, partnerFilter]);
  const summary = useMemo(() => summarizeFinanceiroPartners(selectedPartners), [selectedPartners]);
  const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
  const leadRows = useMemo(() => selectedPartners.flatMap(partner => partner.leads.map(lead => ({ ...lead, partner: partner.label, partnerId: partner.id })))
    .filter(lead => !normalizedSearch || [lead.name, lead.email, lead.phone, lead.dealer, lead.city, lead.model, lead.partner].some(value => value.toLocaleLowerCase("pt-BR").includes(normalizedSearch))), [selectedPartners, normalizedSearch]);

  if (session.isLoading) {
    return <main className="grid min-h-screen place-items-center bg-[#080c15]"><Loader2 className="h-7 w-7 animate-spin text-[#e2212d]" /></main>;
  }
  if (!session.data) return <FinanceiroLogin onAuthenticated={() => session.refetch()} />;
  if (!canAccess) {
    return <main className="grid min-h-screen place-items-center bg-[#080c15] p-5 text-slate-100"><section className="max-w-md rounded-2xl border border-red-500/20 bg-[#101827] p-7 text-center"><LockKeyhole className="mx-auto h-7 w-7 text-red-400" /><h1 className="mt-4 text-lg font-semibold">Acesso não autorizado</h1><p className="mt-2 text-sm leading-6 text-slate-400">Este usuário não possui acesso ao Portal Financeiro.</p><Button onClick={() => logout.mutate()} variant="outline" className="mt-5 border-[#324058] bg-[#111827] text-slate-200">Sair</Button></section></main>;
  }

  return (
    <main className="min-h-screen bg-[#080c15] text-slate-100">
      <header className="border-b border-[#1d2737] bg-[#0b111d]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1760px] items-center justify-between gap-4 px-5 py-4 lg:px-7">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e2212d] text-white"><BadgeDollarSign className="h-5 w-5" /></span>
            <div><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#e2212d]">MG Motors</p><h1 className="text-lg font-semibold tracking-tight text-white">Portal Financeiro</h1></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block"><p className="text-xs font-medium text-slate-300">{session.data.displayName}</p><p className="mt-0.5 text-[10px] text-emerald-400">Sessão autorizada</p></div>
            <Button onClick={() => logout.mutate()} disabled={logout.isPending} variant="outline" size="sm" className="border-[#2a364a] bg-[#101827] text-slate-300 hover:bg-[#172033] hover:text-white"><LogOut className="mr-1.5 h-3.5 w-3.5" />Sair</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1760px] gap-6 px-5 py-6 lg:grid-cols-[256px_minmax(0,1fr)] lg:px-7">
        <aside className="rounded-2xl border border-[#243047] bg-[#101827] p-3 lg:sticky lg:top-5 lg:h-[calc(100vh-104px)]">
          <div className="border-b border-[#223047] px-3 pb-4 pt-2">
            <div className="flex items-center gap-2 text-slate-300"><PanelLeftClose className="h-4 w-4 text-[#e2212d]" /><span className="text-[10px] font-semibold uppercase tracking-[0.15em]">Navegação</span></div>
            <p className="mt-3 text-sm font-semibold text-white">Dados de parceiros</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Plano financeiro e base canônica de Leads.</p>
          </div>
          <nav className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:flex-col" aria-label="Visões financeiras">
            {(Object.keys(FINANCEIRO_PARTNERS) as PartnerFilter[]).map(id => {
              const partner = FINANCEIRO_PARTNERS[id];
              const active = partnerFilter === id;
              return <button key={id} type="button" onClick={() => setPartnerFilter(id)} aria-current={active ? "page" : undefined} className={`group flex min-w-[188px] items-center gap-3 rounded-xl border p-3 text-left transition-all ${active ? partner.accent : "border-transparent text-slate-400 hover:border-[#2b3950] hover:bg-white/[0.025] hover:text-white"}`}>
                {id === "all" ? <span className={`grid h-10 w-10 place-items-center rounded-lg ${active ? "bg-white/15" : "bg-white/[0.05] text-slate-400"}`}><LayoutDashboard className="h-4 w-4" /></span> : <PartnerMark partnerId={id} />}
                <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">{partner.label}</span><span className={`mt-1 block truncate text-[10px] ${active ? "text-white/75" : "text-slate-600"}`}>{partner.description}</span></span>
                <ChevronRight className={`h-3.5 w-3.5 ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
              </button>;
            })}
          </nav>
          <div className="mt-5 hidden rounded-xl border border-[#263348] bg-[#0b111d] p-3 lg:block">
            <div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" /><span className="text-[10px] font-semibold">AMBIENTE RESTRITO</span></div>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">Dados de contato são protegidos e exibidos apenas para usuários autorizados.</p>
          </div>
        </aside>

        <section className="min-w-0">
          <section className="mb-5 overflow-hidden rounded-2xl border border-[#253149] bg-[#101827]">
            <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e2212d]">Painel operacional</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">{FINANCEIRO_PARTNERS[partnerFilter].label}</h2>
                <p className="mt-1 max-w-xl text-xs leading-5 text-slate-500">Investimento líquido de plano, Leads canônicos e indicadores de referência por parceiro.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex items-center gap-2 rounded-lg border border-[#2a364a] bg-[#0b111d] px-3 py-2 text-xs text-slate-400"><span>Competência</span><select aria-label="Competência" value={competence} onChange={event => setCompetence(event.target.value)} className="bg-transparent text-xs font-semibold text-white outline-none">{(months.data ?? []).map(month => <option key={month} value={month} className="bg-[#101827]">{formatMonth(month)}</option>)}</select></label>
                <Button onClick={() => data.refetch()} disabled={data.isFetching || !competence} variant="outline" size="sm" className="h-auto border-[#2a364a] bg-[#0b111d] text-slate-300 hover:bg-[#172033] hover:text-white">{data.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />} Atualizar</Button>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-[#223047] bg-white/[0.015] px-5 py-3 text-[10px] text-slate-500"><FileLock2 className="h-3.5 w-3.5 text-[#e2212d]" />Competência selecionada: <strong className="font-semibold text-slate-300">{competence ? formatMonth(competence) : "Carregando"}</strong><span className="ml-auto hidden items-center gap-1 text-slate-600 sm:flex"><BarChart3 className="h-3.5 w-3.5" />Atualização sob demanda</span></div>
          </section>

          {data.isLoading || !data.data ? <section className="grid min-h-[420px] place-items-center rounded-2xl border border-[#243047] bg-[#101827]"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#e2212d]" /><p className="mt-3 text-sm text-slate-500">Carregando visão financeira...</p></div></section> : data.error ? <section className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-7 text-center"><h2 className="font-semibold text-white">Não foi possível carregar os dados</h2><p className="mt-2 text-sm text-red-200/70">{data.error.message}</p></section> : <>
            <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryMetric label="Investimento líquido" value={formatCurrency(summary.plannedNetInvestment)} detail={partnerFilter === "all" ? "Soma dos planos aprovados" : `Plano de ${FINANCEIRO_PARTNERS[partnerFilter].label}`} icon={CircleDollarSign} />
              <SummaryMetric label="Leads recebidos" value={NUMBER.format(summary.actualLeads)} detail={partnerFilter === "all" ? "Base canônica dos parceiros" : `Base canônica ${FINANCEIRO_PARTNERS[partnerFilter].label}`} icon={UsersRound} accent="text-sky-300" />
              <SummaryMetric label="CPL de referência" value={formatCurrency(summary.referenceCpl)} detail="Líquido ÷ Leads recebidos" icon={TrendingUp} accent="text-amber-300" />
              <SummaryMetric label="Impressões estimadas" value={summary.estimatedImpressions == null ? "—" : NUMBER.format(summary.estimatedImpressions)} detail="Estimativa técnica por CPM" icon={Eye} accent="text-violet-300" />
            </div>
            <p className="mb-6 rounded-xl border border-amber-400/15 bg-amber-400/[0.045] px-4 py-3 text-[11px] leading-5 text-amber-100/75"><strong className="font-semibold text-amber-300">Impressões estimadas:</strong> cálculo técnico de plano sobre investimento líquido. Webmotors utiliza CPM de R$ 50 e Mercado Livre CPM de R$ 35. Não representa entrega real dos veículos.</p>

            <div className={`mb-6 grid gap-4 ${selectedPartners.length > 1 ? "xl:grid-cols-2" : ""}`}>
              {selectedPartners.map(partner => <section key={partner.id} className="overflow-hidden rounded-2xl border border-[#243047] bg-[#101827]">
                <div className="flex items-start justify-between gap-4 border-b border-[#223047] px-5 py-4"><div className="flex items-center gap-3"><PartnerMark partnerId={partner.id} /><div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Parceiro</p><h3 className="mt-0.5 text-sm font-semibold text-white">{partner.label}</h3><p className="mt-0.5 text-[10px] text-slate-500">CPM de referência: {BRL.format(partner.referenceCpm)}</p></div></div><span className="rounded-full border border-[#334159] bg-[#172033] px-2.5 py-1 text-[10px] font-semibold text-slate-300">{NUMBER.format(partner.actualLeads)} Leads</span></div>
                <div className="grid grid-cols-2 divide-x divide-y divide-[#223047] sm:grid-cols-4 sm:divide-y-0"><div className="p-4"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">Investimento líquido</p><p className="mt-1 text-sm font-semibold text-white">{formatCurrency(partner.plannedNetInvestment)}</p></div><div className="p-4"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">Leads reais</p><p className="mt-1 text-sm font-semibold text-white">{NUMBER.format(partner.actualLeads)}</p></div><div className="p-4"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">CPL de referência</p><p className="mt-1 text-sm font-semibold text-white">{formatCurrency(partner.referenceCpl)}</p></div><div className="p-4"><p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-600">Impressões estimadas</p><p className="mt-1 text-sm font-semibold text-white">{partner.estimatedImpressions == null ? "—" : NUMBER.format(partner.estimatedImpressions)}</p></div></div>
              </section>)}
            </div>

            <div className={`mb-6 grid gap-4 ${selectedPartners.length > 1 ? "2xl:grid-cols-2" : ""}`}>
              {selectedPartners.map(partner => <PartnerLeadCharts key={`analytics-${partner.id}`} partner={partner} />)}
            </div>

            <div className={`mb-6 grid gap-4 ${selectedPartners.length > 1 ? "2xl:grid-cols-2" : ""}`}>
              {selectedPartners.map(partner => <PartnerDeviceProfileCharts key={`devices-${partner.id}`} partner={partner} />)}
            </div>

            <section className="overflow-hidden rounded-2xl border border-[#243047] bg-[#101827]">
              <div className="flex flex-col gap-4 border-b border-[#223047] p-5 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e2212d]">Base de contatos</p><h2 className="mt-1 text-base font-semibold text-white">{partnerFilter === "all" ? "Leads por parceiro" : `Leads ${FINANCEIRO_PARTNERS[partnerFilter].label}`}</h2><p className="mt-1 text-xs text-slate-500">Dados pessoais disponíveis somente nesta área autorizada.</p></div><label className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" /><Input aria-label="Buscar Lead" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar contato ou dealer" className="h-9 min-w-[220px] border-[#2a364a] bg-[#0b111d] pl-9 text-xs text-white placeholder:text-slate-700" /></label></div>
              <div className="max-h-[620px] overflow-auto"><table className="min-w-[1180px] w-full text-left"><thead className="sticky top-0 z-10 bg-[#111a29]"><tr className="border-b border-[#263348] text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">{["Data", "Parceiro", "Nome", "E-mail", "Telefone", "Modelo", "Concessionária", "Cidade", "UF"].map(label => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody>{leadRows.map(lead => <tr key={`${lead.partner}-${lead.id}`} className="border-b border-[#1d283a] text-xs text-slate-300 hover:bg-white/[0.025]"><td className="whitespace-nowrap px-4 py-3 font-medium text-slate-400">{formatDate(lead.correctedDate)}</td><td className="whitespace-nowrap px-4 py-3"><span className="inline-flex items-center gap-2"><PartnerMark partnerId={lead.partnerId} compact /><span className="font-medium text-slate-300">{lead.partner}</span></span></td><td className="whitespace-nowrap px-4 py-3 font-medium text-white"><span className="inline-flex items-center gap-1.5"><UserRound className="h-3 w-3 text-slate-600" />{lead.name || "—"}</span></td><td className="whitespace-nowrap px-4 py-3 text-slate-400"><span className="inline-flex items-center gap-1.5"><Mail className="h-3 w-3 text-slate-600" />{lead.email || "—"}</span></td><td className="whitespace-nowrap px-4 py-3 text-slate-400"><span className="inline-flex items-center gap-1.5"><Phone className="h-3 w-3 text-slate-600" />{lead.phone || "—"}</span></td><td className="whitespace-nowrap px-4 py-3">{lead.model}</td><td className="whitespace-nowrap px-4 py-3">{lead.dealer || "—"}</td><td className="whitespace-nowrap px-4 py-3"><span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3 text-slate-600" />{lead.city || "—"}</span></td><td className="whitespace-nowrap px-4 py-3 text-slate-400">{lead.region || "—"}</td></tr>)}{!leadRows.length ? <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">Nenhum Lead encontrado para esta visão.</td></tr> : null}</tbody></table></div>
            </section>
          </>}
        </section>
      </div>
    </main>
  );
}

export default function Financeiro() {
  return <FinanceiroContent />;
}
