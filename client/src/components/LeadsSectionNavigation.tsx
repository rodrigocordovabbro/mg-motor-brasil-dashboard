import { BarChart3, MapPin, Store, Users } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

export const LEADS_SECTION_TABS = [
  "Visão Geral",
  "Regiões",
  "Lojas & CRM",
  "Leads",
] as const;
export type LeadsSectionTab = (typeof LEADS_SECTION_TABS)[number];
const ICONS = [BarChart3, MapPin, Store, Users];

export function LeadsSectionNavigation({
  activeTab,
  onChange,
}: {
  activeTab: LeadsSectionTab;
  onChange: (tab: LeadsSectionTab) => void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = (index + 1) % LEADS_SECTION_TABS.length;
        break;
      case "ArrowLeft":
        next =
          (index + LEADS_SECTION_TABS.length - 1) % LEADS_SECTION_TABS.length;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = LEADS_SECTION_TABS.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    onChange(LEADS_SECTION_TABS[next]);
    buttons.current[next]?.focus({ preventScroll: true });
  };

  return (
    <div className="mg-leads-menu" data-testid="leads-section-menu">
      <div className="overflow-x-auto">
        <div
          className="flex min-w-max gap-2"
          role="tablist"
          aria-label="Navegação de Leads"
          aria-orientation="horizontal"
        >
          {LEADS_SECTION_TABS.map((tab, index) => {
            const Icon = ICONS[index];
            const selected = activeTab === tab;
            return (
              <button
                key={tab}
                ref={element => {
                  buttons.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`mg-leads-tab-${index}`}
                aria-controls="mg-leads-panel"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChange(tab)}
                onKeyDown={event => onKeyDown(event, index)}
                className={`inline-flex min-h-12 shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-xl px-5 py-3 text-[15px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 sm:px-6 sm:text-base ${selected ? "bg-[#e2212d] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {tab}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
