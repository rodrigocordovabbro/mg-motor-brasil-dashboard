import type { PublicAccount, UserRole } from "@shared/accountRoles";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { FormEvent, useState } from "react";

type V2UserManagementProps = {
  currentUserId?: number;
};

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  )
    return error.message;
  return "Não foi possível concluir a operação. Tente novamente.";
}

function dateLabel(value: string | null) {
  if (!value) return "Data não informada";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(parsed);
}

export default function V2UserManagement({
  currentUserId,
}: V2UserManagementProps) {
  const utils = trpc.useUtils();
  const accountsQuery = trpc.accounts.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const createMutation = trpc.accounts.create.useMutation();
  const updateMutation = trpc.accounts.update.useMutation();
  const resetMutation = trpc.accounts.resetPassword.useMutation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("client");
  const [selectedAccount, setSelectedAccount] = useState<PublicAccount | null>(
    null
  );
  const [resetPassword, setResetPassword] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const accounts = (accountsQuery.data ?? []) as PublicAccount[];
  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    resetMutation.isPending;

  const refresh = async () => {
    setError(null);
    await accountsQuery.refetch();
  };

  const invalidate = async () => {
    await Promise.all([
      utils.accounts.list.invalidate(),
      utils.auth.me.invalidate(),
    ]);
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const created = await createMutation.mutateAsync({
        username,
        password,
        role,
      });
      await invalidate();
      setUsername("");
      setPassword("");
      setRole("client");
      setNotice(`Usuário ${created.username} criado com sucesso.`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const updateAccount = async (
    account: PublicAccount,
    input: { role?: UserRole; isActive?: boolean }
  ) => {
    setError(null);
    setNotice(null);
    try {
      const updated = await updateMutation.mutateAsync({
        id: account.id,
        ...input,
      });
      await invalidate();
      setNotice(`Usuário ${updated.username} atualizado com sucesso.`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const openReset = (account: PublicAccount) => {
    setSelectedAccount(account);
    setResetPassword("");
    setResetOpen(true);
    setError(null);
    setNotice(null);
  };

  const closeReset = (open: boolean) => {
    if (resetMutation.isPending) return;
    setResetOpen(open);
    if (!open) {
      setSelectedAccount(null);
      setResetPassword("");
    }
  };

  const submitReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedAccount) return;
    setError(null);
    setNotice(null);
    try {
      await resetMutation.mutateAsync({
        id: selectedAccount.id,
        password: resetPassword,
      });
      await invalidate();
      setResetOpen(false);
      setResetPassword("");
      setSelectedAccount(null);
      setNotice(`Senha de ${selectedAccount.username} redefinida com sucesso.`);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#e2212d]">
              Acesso MG Sales
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-950">
              Gerenciamento de usuários
            </h1>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">
              Crie contas, altere perfil/status e redefina senhas sem exibir ou
              transportar hashes para a interface.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={accountsQuery.isFetching || busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${accountsQuery.isFetching ? "animate-spin" : ""}`}
            />
            Atualizar
          </button>
        </div>

        <form
          onSubmit={create}
          className="mt-5 grid gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-4 md:grid-cols-[1fr_1fr_180px_auto] md:items-end"
          noValidate
        >
          <label>
            <span className="v2-label">Novo usuário</span>
            <input
              className="v2-input"
              type="text"
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              minLength={3}
              maxLength={64}
              placeholder="ex.: equipe.vendas"
              disabled={busy}
            />
          </label>
          <label>
            <span className="v2-label">Senha inicial</span>
            <input
              className="v2-input"
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              maxLength={200}
              placeholder="Mínimo de 8 caracteres"
              disabled={busy}
            />
          </label>
          <label>
            <span className="v2-label">Perfil</span>
            <select
              className="v2-input"
              value={role}
              onChange={event => setRole(event.target.value as UserRole)}
              disabled={busy}
            >
              <option value="client">Cliente</option>
              <option value="admin">Administrador</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !username || !password}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#e2212d] px-4 text-xs font-bold text-white transition hover:bg-[#c91c28] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {createMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Criar conta
          </button>
        </form>

        {accountsQuery.isLoading ? (
          <p
            role="status"
            className="flex items-center gap-2 py-8 text-sm text-slate-500"
          >
            <LoaderCircle className="h-4 w-4 animate-spin" /> Carregando contas…
          </p>
        ) : accountsQuery.error ? (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {errorMessage(accountsQuery.error)}
          </div>
        ) : (
          <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-bold">Usuário</th>
                  <th className="px-4 py-3 font-bold">Perfil</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Criado em</th>
                  <th className="px-4 py-3 text-right font-bold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {accounts.map(account => (
                  <tr
                    key={account.id}
                    className="transition hover:bg-slate-50/80"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50 text-[#e2212d]">
                          {account.role === "admin" ? (
                            <ShieldCheck className="h-4 w-4" />
                          ) : (
                            <UserRound className="h-4 w-4" />
                          )}
                        </span>
                        <div>
                          <p className="font-bold text-slate-900">
                            {account.username}
                          </p>
                          {account.id === currentUserId ? (
                            <p className="text-[11px] text-slate-400">
                              Sessão atual
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="v2-input max-w-[180px]"
                        value={account.role}
                        onChange={event =>
                          void updateAccount(account, {
                            role: event.target.value as UserRole,
                          })
                        }
                        disabled={busy}
                        aria-label={`Perfil de ${account.username}`}
                      >
                        <option value="client">Cliente</option>
                        <option value="admin">Administrador</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input
                          type="checkbox"
                          checked={account.isActive}
                          onChange={event =>
                            void updateAccount(account, {
                              isActive: event.target.checked,
                            })
                          }
                          disabled={busy}
                          aria-label={`${account.isActive ? "Desativar" : "Ativar"} ${account.username}`}
                          className="h-4 w-4 accent-[#e2212d]"
                        />
                        {account.isActive ? "Ativo" : "Inativo"}
                      </label>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {dateLabel(account.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openReset(account)}
                        disabled={busy}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-[#b41b26] disabled:opacity-50"
                      >
                        Redefinir senha
                      </button>
                    </td>
                  </tr>
                ))}
                {!accounts.length ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      Nenhuma conta cadastrada.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {error ? (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-5 text-red-700"
          >
            {error}
          </div>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs leading-5 text-emerald-700"
          >
            {notice}
          </p>
        ) : null}
      </section>

      <Dialog open={resetOpen} onOpenChange={closeReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina manualmente uma nova senha para{" "}
              {selectedAccount?.username ?? "a conta"}. O valor não é exibido
              novamente nem retornado pela API.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitReset} className="space-y-4">
            <label>
              <span className="v2-label">Nova senha</span>
              <input
                className="v2-input"
                type="password"
                value={resetPassword}
                onChange={event => setResetPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                maxLength={200}
                autoFocus
                disabled={resetMutation.isPending}
                placeholder="Mínimo de 8 caracteres"
              />
            </label>
            <DialogFooter>
              <button
                type="button"
                onClick={() => closeReset(false)}
                disabled={resetMutation.isPending}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-600 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
              <button
                type="submit"
                disabled={resetMutation.isPending || !resetPassword}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#e2212d] px-4 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : null}
                Salvar nova senha
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
