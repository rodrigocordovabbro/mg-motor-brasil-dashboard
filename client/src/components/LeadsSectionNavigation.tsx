import { BarChart3, ChartNoAxesCombined, MapPin, Store, Users } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

export const LEADS_SECTION_TABS = [
  "Visão Geral",
  "Lojas & CRM",
  "Regiões",
  "Leads",
] as const;
export const MODEL_ANALYSIS_TAB = "Análise por modelo" as const;
export type LeadsBaseSectionTab = (typeof LEADS_SECTION_TABS)[number];
export type LeadsSectionTab =
  | LeadsBaseSectionTab
  | typeof MODEL_ANALYSIS_TAB;
export type LeadsNavigationAccess = {
  canManage?: boolean;
  clientView?: boolean;
  overviewOnly?: boolean;
};
const ICONS = [BarChart3, Store, MapPin, Users] as const;
const ENGLISH_LABELS: Record<LeadsSectionTab, string> = {
  "Visão Geral": "Overview",
  "Lojas & CRM": "Stores & CRM",
  Regiões: "Regions",
  Leads: "Leads",
  [MODEL_ANALYSIS_TAB]: "Model analysis",
};

/** Only an operational Administrator may enter the model-analysis surface. */
export function canAnalyzeModels(
  access: LeadsNavigationAccess | boolean = {},
  clientView = false,
  overviewOnly = false
): boolean {
  const options =
    typeof access === "boolean"
      ? { canManage: access, clientView, overviewOnly }
      : access;
  return Boolean(
    options.canManage && !options.clientView && !options.overviewOnly
  );
}

export function getTabs(
  access: LeadsNavigationAccess = {}
): readonly LeadsSectionTab[] {
  if (access.overviewOnly) return ["Visão Geral"];
  return canAnalyzeModels(access)
    ? [...LEADS_SECTION_TABS, MODEL_ANALYSIS_TAB]
    : LEADS_SECTION_TABS;
}

function tabIndex(tab: LeadsSectionTab): number {
  return tab === MODEL_ANALYSIS_TAB
    ? LEADS_SECTION_TABS.length
    : LEADS_SECTION_TABS.indexOf(tab);
}

export function LeadsSectionNavigation({
  activeTab,
  onChange,
  overviewOnly = false,
  locale = "pt-BR",
  canManage = false,
  clientView = false,
}: {
  activeTab: LeadsSectionTab;
  onChange: (tab: LeadsSectionTab) => void;
  overviewOnly?: boolean;
  locale?: "pt-BR" | "en";
  canManage?: boolean;
  clientView?: boolean;
}) {
  const tabs = getTabs({ canManage, clientView, overviewOnly });
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % tabs.length;
        break;
      case "ArrowLeft":
        next = (index + tabs.length - 1) % tabs.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = tabs.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(tabs[next]);
    buttons.current[next]?.focus({ preventScroll: true });
  };

  return (
    <div className="mg-leads-menu" data-testid="leads-section-menu">
      <div className="overflow-x-auto">
        <div
          className="flex min-w-max gap-2"
          role="tablist"
          aria-label={
            locale === "en" ? "Leads navigation" : "Navegação de Leads"
          }
          aria-orientation="horizontal"
        >
          {tabs.map((tab, index) => {
            const globalIndex = tabIndex(tab);
            const Icon =
              tab === MODEL_ANALYSIS_TAB ? ChartNoAxesCombined : ICONS[globalIndex];
            const selected = activeTab === tab;
            return (
              <button
                key={tab}
                ref={element => {
                  buttons.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`mg-leads-tab-${globalIndex}`}
                aria-controls="mg-leads-panel"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(tab)}
                onKeyDown={event => onKeyDown(event, index)}
                className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-xl px-5 py-3 text-[15px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 sm:px-6 sm:text-base ${selected ? "bg-[#e2212d] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {locale === "en" ? ENGLISH_LABELS[tab] : tab}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
