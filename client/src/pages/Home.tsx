import { MediaPlanDashboard } from "@/components/MediaPlanDashboard";
import V2LeadsDashboard, {
  v2Trpc,
  type V2AuthUser,
} from "@/components/V2LeadsDashboard";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  FileSpreadsheet,
  LockKeyhole,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { FormEvent, useState } from "react";

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Usuário ou senha inválidos. Confira os dados e tente novamente.";
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5" aria-label="MG Motors V2">
      <img
        src="/mg-logo.png"
        alt="MG"
        className="h-10 w-10 rounded-lg object-contain"
      />
      <div className="hidden leading-none sm:block">
        <p className="text-sm font-black tracking-[-0.03em] text-slate-950">
          MG MOTORS
        </p>
        <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
          Dashboard V2
        </p>
      </div>
    </div>
  );
}

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const loginMutation = v2Trpc.auth.login.useMutation();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError("Informe usuário e senha para continuar.");
      return;
    }
    setError(null);
    try {
      await loginMutation.mutateAsync({ username: username.trim(), password });
      setPassword("");
      await onLoggedIn();
    } catch (loginError) {
      setError(errorMessage(loginError));
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f1f4] px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.1)] lg:grid-cols-[0.9fr_1.1fr]">
        <div className="hidden flex-col justify-between bg-[#141d2c] p-9 text-white lg:flex">
          <div>
            <BrandMark />
            <div className="mt-16 max-w-xs">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-300">
                Ambiente de homologação
              </p>
              <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight">
                Dados de leads com contexto para decidir.
              </h1>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                Acesso restrito ao painel operacional MG V2. Os números exibidos
                vêm da fonte autenticada configurada pela equipe.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-red-300" /> Sessão protegida ·
            fonte importada
          </div>
        </div>
        <div className="p-6 sm:p-10">
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div className="mx-auto max-w-sm lg:mx-0">
            <div className="mt-10 lg:mt-4">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-[#e2212d]">
                <LockKeyhole className="h-5 w-5" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-950">
                Entrar no MG V2
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Use o acesso de homologação fornecido para consultar os dados.
              </p>
            </div>
            <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
              <label className="block">
                <span className="v2-label">Usuário</span>
                <input
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  className="v2-input"
                  placeholder="Digite seu usuário"
                />
              </label>
              <label className="block">
                <span className="v2-label">Senha</span>
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className="v2-input"
                  placeholder="Digite sua senha"
                />
              </label>
              {error ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-5 text-[#b41b26]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </div>
              ) : null}
              <button
                type="submit"
                disabled={loginMutation.isPending}
                className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#e2212d] text-sm font-bold text-white shadow-sm transition hover:bg-[#c91c28] disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
              >
                {loginMutation.isPending ? "Entrando…" : "Entrar"}
                {loginMutation.isPending ? null : (
                  <ArrowRight className="h-4 w-4" />
                )}
              </button>
            </form>
            <p className="mt-7 text-center text-[11px] leading-5 text-slate-400">
              Acesso de homologação. Não há credenciais preenchidas por padrão.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Topbar({
  user,
  module,
  onModuleChange,
  onLogout,
  loggingOut,
}: {
  user: V2AuthUser;
  module: "leads" | "media";
  onModuleChange: (module: "leads" | "media") => void;
  onLogout: () => void;
  loggingOut: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-[68px] max-w-[1680px] flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandMark />
        <nav
          className="order-3 flex w-full gap-1 sm:order-2 sm:w-auto"
          aria-label="Módulos"
        >
          <button
            type="button"
            aria-current={module === "leads" ? "page" : undefined}
            onClick={() => onModuleChange("leads")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition sm:flex-none ${module === "leads" ? "bg-red-50 text-[#e2212d]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
          >
            <BarChart3 className="h-4 w-4" /> Leads
          </button>
          <button
            type="button"
            aria-current={module === "media" ? "page" : undefined}
            onClick={() => onModuleChange("media")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition sm:flex-none ${module === "media" ? "bg-red-50 text-[#e2212d]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}
          >
            <FileSpreadsheet className="h-4 w-4" /> Plano de Mídia
          </button>
        </nav>
        <div className="order-2 flex items-center gap-2 sm:order-3">
          <span className="hidden rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-700 md:inline-flex">
            Homologação
          </span>
          <div className="hidden text-right md:block">
            <p className="text-xs font-bold text-slate-800">{user.username}</p>
            <p className="text-[10px] text-slate-400">Sessão ativa</p>
          </div>
          <button
            type="button"
            title="Sair"
            aria-label="Sair"
            onClick={onLogout}
            disabled={loggingOut}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-[#e2212d] disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f1f4]">
      <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-semibold text-slate-600 shadow-sm">
        Verificando sessão…
      </div>
    </div>
  );
}

function AuthenticatedDashboard({
  user,
  onLoggedOut,
}: {
  user: V2AuthUser;
  onLoggedOut: () => void;
}) {
  const [module, setModule] = useState<"leads" | "media">("leads");
  const [loggingOut, setLoggingOut] = useState(false);
  const queryClient = useQueryClient();
  const logoutMutation = v2Trpc.auth.logout.useMutation();

  const logout = async () => {
    setLoggingOut(true);
    try {
      await logoutMutation.mutateAsync();
    } finally {
      queryClient.clear();
      onLoggedOut();
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f0f1f4]">
      <Topbar
        user={user}
        module={module}
        onModuleChange={setModule}
        onLogout={() => void logout()}
        loggingOut={loggingOut}
      />
      <main className="mx-auto max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        {module === "leads" ? (
          <V2LeadsDashboard authenticated />
        ) : (
          <MediaPlanDashboard locale="pt-BR" />
        )}
      </main>
    </div>
  );
}

export default function Home() {
  const meQuery = v2Trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [sessionOverride, setSessionOverride] = useState<
    V2AuthUser | null | undefined
  >(undefined);
  const user =
    sessionOverride === undefined ? (meQuery.data ?? null) : sessionOverride;
  const refreshSession = async () => {
    const result = await meQuery.refetch();
    setSessionOverride(result.data ?? null);
  };
  if (meQuery.isLoading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLoggedIn={refreshSession} />;
  return (
    <AuthenticatedDashboard
      user={user}
      onLoggedOut={() => setSessionOverride(null)}
    />
  );
}
