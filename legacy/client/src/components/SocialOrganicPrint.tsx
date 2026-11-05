import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import React from "react";

export type SocialOrganicPrintPlatform = "instagram" | "tiktok";
type Locale = "pt-BR" | "en-US";

const PDF_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sept",
  "Oct",
  "Nov",
  "Dec",
];

function ui(locale: Locale, pt: string, en: string) {
  return locale === "en-US" ? en : pt;
}

export function SocialOrganicPdfButton({
  locale = "pt-BR",
  onPrint,
}: {
  locale?: Locale;
  onPrint: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onPrint}
      className="social-organic-print-hide h-8 bg-[#e2212d] text-[10px] text-white hover:bg-[#c91622]"
      data-testid="social-organic-pdf-button"
    >
      <Printer className="mr-1.5 h-3.5 w-3.5" />
      {ui(locale, "Exportar PDF", "Export PDF")}
    </Button>
  );
}

export function buildSocialOrganicPdfTitle(
  platform: SocialOrganicPrintPlatform,
  generatedAt: Date = new Date(),
) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).formatToParts(generatedAt);
  const day = parts.find(part => part.type === "day")?.value ?? "00";
  const monthIndex = Number.parseInt(
    parts.find(part => part.type === "month")?.value ?? "0",
    10,
  ) - 1;
  const month = PDF_MONTH_LABELS[monthIndex] ?? "Mon";
  const platformLabel = platform === "tiktok" ? "TikTok" : "Instagram";
  return `MG Motors _ SOCIAL ORGANIC ${platformLabel} dashboard_${day} ${month}`;
}

export function activateSocialOrganicPrintMode(input: {
  body: { dataset: DOMStringMap };
  page?: { title: string };
  pdfTitle?: string;
  print: () => void;
  addAfterPrintListener?: (listener: () => void) => void;
}) {
  const originalTitle = input.page?.title;
  input.body.dataset.printMode = "social-organic";
  if (input.page && input.pdfTitle) input.page.title = input.pdfTitle;

  const cleanup = () => {
    if (input.body.dataset.printMode === "social-organic") {
      delete input.body.dataset.printMode;
    }
    if (input.page && originalTitle !== undefined) input.page.title = originalTitle;
  };

  input.addAfterPrintListener?.(cleanup);
  input.print();
  return cleanup;
}
