import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LEADS_RELOAD_VERSION_NOT_CONFIRMED,
  type LeadsReloadResult,
  type LeadsReloadStage,
  type LeadsLocale,
} from "@shared/leadsReload";

export type LeadsReloadDialogOutcome =
  | { type: "success"; result: LeadsReloadResult; description: string }
  | { type: "error"; message: string; code?: string };

type V2LeadsReloadDialogProps = {
  open: boolean;
  busy: boolean;
  stage: LeadsReloadStage;
  outcome: LeadsReloadDialogOutcome | null;
  onClose: () => void;
  locale?: LeadsLocale;
};

export function V2LeadsReloadDialog({
  open,
  busy,
  stage,
  outcome,
  onClose,
  locale = "pt-BR",
}: V2LeadsReloadDialogProps) {
  const t = (portuguese: string, english: string) =>
    locale === "en" ? english : portuguese;
  const formatNumber = (value: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR").format(value);
  const stageLabel: Record<LeadsReloadStage, string> = {
    syncing: t("Atualizando a base", "Refreshing the source"),
    refreshing: t(
      "Atualizando números e gráficos",
      "Refreshing numbers and charts"
    ),
  };
  const preventDismiss = (event: Event) => event.preventDefault();
  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (nextOpen || busy || outcome) return;
        onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={preventDismiss}
        onPointerDownOutside={preventDismiss}
        onInteractOutside={preventDismiss}
        className="gap-0 overflow-hidden rounded-2xl border-slate-200 bg-white p-0 shadow-xl sm:max-w-md"
      >
        {busy ? (
          <div className="flex flex-col items-center px-6 py-8 text-center">
            <div
              className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-[#b41b26]"
              aria-hidden="true"
            >
              <LoaderCircle className="h-7 w-7 animate-spin" />
            </div>
            <DialogHeader className="items-center">
              <DialogTitle className="text-xl text-slate-900">
                {t(
                  "Atualizando a base de Leads",
                  "Refreshing the Leads source"
                )}
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-sm text-center text-sm leading-5 text-slate-600">
                {t(
                  "Aguarde enquanto a base é conferida e os números e gráficos são atualizados.",
                  "Please wait while the source is checked and the numbers and charts are refreshed."
                )}
              </DialogDescription>
            </DialogHeader>
            <p
              role="status"
              aria-live="polite"
              className="mt-6 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              {stageLabel[stage]}
            </p>
          </div>
        ) : outcome?.type === "success" ? (
          <div className="px-6 py-7">
            <DialogHeader>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
              </div>
              <DialogTitle className="text-xl text-slate-900">
                {t("Atualização concluída", "Refresh completed")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm leading-5 text-slate-600">
                {t(
                  "Os números e gráficos exibidos já correspondem à leitura fresca da base.",
                  "The displayed numbers and charts now match the latest confirmed source reading."
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {t("Total do recorte", "Selected total")}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {formatNumber(outcome.result.total)}
                </p>
                <p className="text-xs text-slate-500">Leads</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {t("Acumulado mensal", "Month to date")}
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  {formatNumber(outcome.result.monthlyTotal)}
                </p>
                <p className="text-xs text-slate-500">Leads</p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              {outcome.description}
            </p>
          </div>
        ) : outcome?.type === "error" ? (
          <div className="px-6 py-7">
            <DialogHeader>
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-red-700">
                <AlertCircle className="h-6 w-6" aria-hidden="true" />
              </div>
              <DialogTitle className="text-xl text-slate-900">
                {t(
                  "Não foi possível concluir a atualização",
                  "Unable to complete the refresh"
                )}
              </DialogTitle>
              <DialogDescription
                role="alert"
                className="mt-1 text-sm leading-5 text-red-700"
              >
                {outcome.message}
              </DialogDescription>
            </DialogHeader>
            <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
              {outcome.code === LEADS_RELOAD_VERSION_NOT_CONFIRMED
                ? t(
                    "A importação foi recebida, mas a nova versão ainda não foi confirmada pelos números do painel. Feche esta janela e tente novamente.",
                    "The import was received, but the dashboard numbers have not confirmed the new version yet. Close this window and try again."
                  )
                : t(
                    "Nenhum resultado novo foi confirmado. Feche esta janela e tente novamente.",
                    "No new result was confirmed. Close this window and try again."
                  )}
            </p>
          </div>
        ) : null}
        <DialogFooter className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-xl bg-[#b41b26] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#991b1b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-wait disabled:opacity-60"
          >
            {t("Fechar", "Close")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
