import type { V2Filters } from "@shared/v2Types";

export type OverviewPdfLocale = "pt-BR" | "en";

export type PrintOverviewPdfInput = {
  root: HTMLElement;
  locale: OverviewPdfLocale;
  dateFrom: string;
  dateTo: string;
  cutoff: string;
  latestLeadDate: string | null;
  filters: V2Filters;
};

export type OverviewPdfFilterKey =
  | "model"
  | "channel"
  | "campaign"
  | "dealer"
  | "search";

export type OverviewPdfFilterLabel = {
  key: OverviewPdfFilterKey;
  label: string;
  value: string;
};

export type OverviewPdfMetadata = {
  title: string;
  overviewLabel: string;
  periodLabel: string;
  cutoffLabel: string;
  generatedLabel: string;
  latestLeadLabel: string;
  latestLeadWarning: string | null;
  filtersLabel: string;
  filterLabels: OverviewPdfFilterLabel[];
};

export const OVERVIEW_PDF_LOGO_SRC = "/logo-mg-red.svg";
export const OVERVIEW_PDF_ASSET_TIMEOUT_MS = 15_000;
export const OVERVIEW_PDF_CLEANUP_TIMEOUT_MS = 180_000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TOOLTIP_SELECTORS = [
  '[role~="tooltip"]',
  "[data-tooltip]",
  ".recharts-tooltip-wrapper",
  ".recharts-default-tooltip",
  ".recharts-tooltip-cursor",
].join(",");
const ADMINISTRATIVE_CONTROL_SELECTORS = [
  "[data-overview-pdf-exclude]",
  "[data-overview-pdf-admin]",
  "[data-administrative-control]",
  "[data-admin-control]",
  "[data-control-strip]",
].join(",");
const JAVASCRIPT_URL_ATTRIBUTES = new Set([
  "action",
  "cite",
  "data",
  "formaction",
  "href",
  "poster",
  "src",
  "xlink:href",
]);

function text(locale: OverviewPdfLocale, pt: string, en: string) {
  return locale === "en" ? en : pt;
}

function parseIsoDate(value: string, field: string): Date {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`${field} must be an ISO date in YYYY-MM-DD format.`);
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${field} is not a valid calendar date.`);
  }
  return date;
}

function todayInSaoPaulo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find(part => part.type === "year")?.value ?? "0000";
  const month = parts.find(part => part.type === "month")?.value ?? "00";
  const day = parts.find(part => part.type === "day")?.value ?? "00";
  return `${year}-${month}-${day}`;
}

/**
 * Validates without clamping or rewriting the requested period. Future values are rejected so a
 * printout cannot present a period as if its data already existed.
 */
export function validateOverviewPdfDateRange(input: {
  dateFrom: string;
  dateTo: string;
  cutoff: string;
  latestLeadDate?: string | null;
  now?: Date;
}): void {
  parseIsoDate(input.dateFrom, "dateFrom");
  parseIsoDate(input.dateTo, "dateTo");
  parseIsoDate(input.cutoff, "cutoff");
  if (input.latestLeadDate != null) {
    parseIsoDate(input.latestLeadDate, "latestLeadDate");
  }

  if (input.dateFrom > input.dateTo) {
    throw new Error("dateFrom cannot be later than dateTo.");
  }

  const today = todayInSaoPaulo(input.now);
  const futureValue = [
    ["dateFrom", input.dateFrom],
    ["dateTo", input.dateTo],
    ["cutoff", input.cutoff],
    ["latestLeadDate", input.latestLeadDate],
  ].find(([, value]) => value != null && value > today);
  if (futureValue) {
    throw new Error(`${futureValue[0]} cannot be in the future.`);
  }
  if (input.dateTo > input.cutoff)
    throw new Error("dateTo cannot exceed the dashboard D-1 cutoff.");
  if (input.cutoff >= today)
    throw new Error("cutoff must end before today in America/Sao_Paulo.");
}

function dateForDisplay(value: string): Date {
  return parseIsoDate(value, "date");
}

export function formatOverviewPdfDate(
  value: string,
  locale: OverviewPdfLocale
): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(dateForDisplay(value));
}

export function formatOverviewPdfTimestamp(
  value: Date,
  locale: OverviewPdfLocale
): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(value);
}

export function buildOverviewPdfTitle(
  dateFrom: string,
  dateTo: string
): string {
  return `MG_Overview_${dateFrom}_${dateTo}`;
}

function normalizeFilterValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

/**
 * Returns only applied dimensions. Search is intentionally represented by a fixed phrase and never
 * by its value, because the search field may contain personal information.
 */
export function buildOverviewPdfFilterLabels(
  filters: V2Filters,
  locale: OverviewPdfLocale
): OverviewPdfFilterLabel[] {
  const labels: Array<[OverviewPdfFilterKey, string, string | undefined]> = [
    ["model", text(locale, "Modelo", "Model"), filters.model],
    ["channel", text(locale, "Canal", "Channel"), filters.channel],
    ["campaign", text(locale, "Campanha", "Campaign"), filters.campaign],
    ["dealer", text(locale, "Concessionária", "Dealer"), filters.dealer],
  ];

  const applied = labels.flatMap(([key, label, value]) => {
    const normalized = normalizeFilterValue(value);
    return normalized ? [{ key, label, value: normalized }] : [];
  });

  if (normalizeFilterValue(filters.search)) {
    applied.push({
      key: "search",
      label: text(locale, "Busca", "Search"),
      value: "Search filter applied",
    });
  }

  return applied;
}

export function buildOverviewPdfFilterText(
  filters: V2Filters,
  locale: OverviewPdfLocale
): string {
  const labels = buildOverviewPdfFilterLabels(filters, locale);
  if (!labels.length)
    return text(locale, "Nenhum filtro aplicado", "No filters applied");
  return labels.map(item => `${item.label}: ${item.value}`).join(" • ");
}

export function buildOverviewPdfMetadata(input: {
  locale: OverviewPdfLocale;
  dateFrom: string;
  dateTo: string;
  cutoff: string;
  latestLeadDate: string | null;
  filters: V2Filters;
  generatedAt?: Date;
}): OverviewPdfMetadata {
  validateOverviewPdfDateRange(input);

  const latestLeadWarning =
    input.latestLeadDate == null
      ? text(
          input.locale,
          "Data do último Lead indisponível; a fonte pode estar atrasada.",
          "Latest Lead date is unavailable; the source may be lagging."
        )
      : input.latestLeadDate < input.cutoff
        ? text(
            input.locale,
            "A data do último Lead está antes do D-1; a fonte pode estar atrasada.",
            "Latest Lead date is before D-1; the source may be lagging."
          )
        : null;

  const filterLabels = buildOverviewPdfFilterLabels(
    input.filters,
    input.locale
  );
  return {
    title: buildOverviewPdfTitle(input.dateFrom, input.dateTo),
    overviewLabel: text(input.locale, "Visão Geral", "Overview"),
    periodLabel: `${formatOverviewPdfDate(input.dateFrom, input.locale)}  —  ${formatOverviewPdfDate(input.dateTo, input.locale)}`,
    cutoffLabel: `D-1 São Paulo: ${formatOverviewPdfDate(input.cutoff, input.locale)}`,
    generatedLabel: `${text(input.locale, "Gerado", "Generated")}: ${formatOverviewPdfTimestamp(input.generatedAt ?? new Date(), input.locale)}`,
    latestLeadLabel: input.latestLeadDate
      ? `${text(input.locale, "Último Lead", "Latest Lead")}: ${formatOverviewPdfDate(input.latestLeadDate, input.locale)}`
      : `${text(input.locale, "Último Lead", "Latest Lead")}: N/A`,
    latestLeadWarning,
    filtersLabel: buildOverviewPdfFilterText(input.filters, input.locale),
    filterLabels,
  };
}

/** Escapes text for callers that need a safe HTML string; the DOM implementation uses textContent. */
export function escapeOverviewPdfHtml(
  value: string | number | null | undefined
): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * CSS is kept as a pure helper so the layout contract can be tested without a browser. The
 * overrides deliberately affect only the cloned Overview, not the application page.
 */
export function buildOverviewPdfPrintCss(): string {
  return `
@page {
  size: A4 landscape;
  margin: 10mm;
}

:root {
  color-scheme: light;
}

html,
body {
  margin: 0;
  padding: 0;
  background: #ffffff;
}

body {
  color: #0f172a;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 10pt;
  line-height: 1.35;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.overview-pdf-document {
  width: 100%;
  max-width: none;
}

.overview-pdf-header {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  align-items: start;
  margin: 0 0 12px;
  padding: 0 0 9px;
  border-bottom: 2px solid #e2212d;
}

.overview-pdf-logo {
  display: block;
  width: 100px;
  height: 36px;
  object-fit: contain;
}

.overview-pdf-header h1,
.overview-pdf-header p {
  margin: 0;
}

.overview-pdf-header h1 {
  color: #111827;
  font-size: 18pt;
  line-height: 1.05;
  font-weight: 700;
}

.overview-pdf-header-meta,
.overview-pdf-filter-line {
  margin-top: 4px !important;
  color: #475569;
  font-size: 8.5pt;
}

.overview-pdf-warning {
  margin-top: 4px !important;
  color: #b45309;
  font-size: 8.5pt;
  font-weight: 700;
}

.overview-pdf-content,
.overview-pdf-content * {
  box-sizing: border-box;
}

.overview-pdf-content [data-overview-pdf-only] {
  display: block !important;
  visibility: visible !important;
}

.overview-pdf-content [class*="max-h-"],
.overview-pdf-content [style*="max-height"],
.overview-pdf-content [class*="overflow-auto"],
.overview-pdf-content [class*="overflow-y-auto"],
.overview-pdf-content [class*="overflow-scroll"],
.overview-pdf-content [class*="overflow-x-auto"],
.overview-pdf-content [class*="overflow-hidden"] {
  max-height: none !important;
  overflow: visible !important;
}

.overview-pdf-content [class*="min-w-"],
.overview-pdf-content [style*="min-width"],
.overview-pdf-content .recharts-wrapper,
.overview-pdf-content .recharts-responsive-container {
  min-width: 0 !important;
  max-width: 100% !important;
}
.overview-pdf-content .recharts-wrapper,
.overview-pdf-content .recharts-responsive-container {
  width: 100% !important;
  height: auto !important;
}
.overview-pdf-content th,
.overview-pdf-content td {
  font-size: 8pt !important;
  white-space: normal !important;
  overflow-wrap: anywhere;
}
.overview-pdf-content [data-overview-pdf-only] > div {
  break-inside: avoid;
}
.overview-pdf-content [data-overview-pdf-only] li {
  padding-top: 6px !important;
  padding-bottom: 6px !important;
  break-inside: avoid;
}
.overview-pdf-content [data-testid="historical-lead-pace-card"] header {
  padding: 10px 12px !important;
}
.overview-pdf-content [data-testid="historical-lead-pace-card"] .p-5,
.overview-pdf-content [data-testid="historical-lead-pace-card"] .p-4,
.overview-pdf-content [data-testid="historical-lead-pace-card"] .p-3 {
  padding: 8px 10px !important;
}
.overview-pdf-content [data-testid="historical-lead-pace-card"] .space-y-5 > * {
  margin-top: 6px !important;
  margin-bottom: 6px !important;
}
.overview-pdf-content [data-testid="historical-lead-pace-card"] [role="img"] {
  height: auto !important;
}
.overview-pdf-content [data-testid="historical-lead-pace-card"] h2 {
  font-size: 16px !important;
}
.overview-pdf-content [data-testid="historical-lead-pace-card"] p {
  font-size: 10px !important;
  line-height: 1.35 !important;
}
.overview-pdf-content [data-testid="historical-lead-pace-card"] p.text-lg {
  font-size: 15px !important;
}

.overview-pdf-content table,
.overview-pdf-content table[class*="min-w-"],
.overview-pdf-content table[style*="min-width"] {
  width: 100% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  table-layout: auto;
  border-collapse: collapse;
}

.overview-pdf-content thead {
  display: table-header-group;
}

.overview-pdf-content tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

.overview-pdf-content svg {
  display: block;
  max-width: 100%;
  overflow: visible;
}

.overview-pdf-svg-wrap {
  width: 100%;
  max-width: 100%;
  overflow: visible !important;
  break-inside: avoid-page;
  page-break-inside: avoid;
}

.overview-pdf-content details {
  break-inside: avoid;
}

.overview-pdf-content button,
.overview-pdf-content input,
.overview-pdf-content textarea,
.overview-pdf-content select,
.overview-pdf-content form,
.overview-pdf-content script,
.overview-pdf-content iframe,
.overview-pdf-content [role~="tooltip"] {
  display: none !important;
}

.overview-pdf-content,
.overview-pdf-content * {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}

@media print {
  .overview-pdf-document {
    width: 100%;
  }
}
`;
}

function isSameOriginUrl(value: string, sourceDocument: Document): boolean {
  try {
    const base = sourceDocument.location?.href;
    if (!base) return false;
    const resolved = new URL(value, base);
    const origin = new URL(base).origin;
    return resolved.origin === origin;
  } catch {
    return false;
  }
}

function isUnsafeAttribute(name: string, value: string): boolean {
  const normalizedName = name.toLowerCase();
  if (normalizedName.startsWith("on") || normalizedName === "srcdoc") {
    return true;
  }
  if (
    JAVASCRIPT_URL_ATTRIBUTES.has(normalizedName) &&
    /^\s*javascript:/i.test(value)
  ) {
    return true;
  }
  return (
    normalizedName === "style" && /url\s*\(\s*["']?\s*javascript:/i.test(value)
  );
}

function copySafeAttributes(source: Element, target: Element): void {
  for (const attribute of Array.from(source.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    if (isUnsafeAttribute(name, value)) continue;
    target.setAttribute(attribute.name, value);
  }
}

function replaceSelectedOptions(
  root: HTMLElement,
  ownerDocument: Document
): void {
  for (const select of Array.from(root.querySelectorAll("select"))) {
    const selected = select.options[select.selectedIndex];
    const replacement = ownerDocument.createElement("span");
    copySafeAttributes(select, replacement);
    replacement.removeAttribute("name");
    replacement.removeAttribute("id");
    replacement.removeAttribute("value");
    replacement.setAttribute("data-overview-pdf-selected-option", "true");
    replacement.textContent =
      selected?.textContent?.trim() || select.value || "";
    select.replaceWith(replacement);
  }
}

function removeUnsafeCloneNodes(root: HTMLElement): void {
  const selector = [
    ADMINISTRATIVE_CONTROL_SELECTORS,
    "button",
    "input",
    "textarea",
    "script",
    "iframe",
    "form",
    TOOLTIP_SELECTORS,
  ].join(",");
  for (const element of Array.from(root.querySelectorAll(selector))) {
    element.remove();
  }
}

function sanitizeCloneAttributes(root: HTMLElement): void {
  const elements = [root, ...Array.from(root.querySelectorAll("*"))];
  for (const element of elements) {
    for (const attribute of Array.from(element.attributes)) {
      if (isUnsafeAttribute(attribute.name, attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
}

function openCloneDetails(root: HTMLElement): void {
  for (const details of Array.from(root.querySelectorAll("details"))) {
    if (!details.matches(ADMINISTRATIVE_CONTROL_SELECTORS)) {
      details.open = true;
    }
  }
}

function revealPdfOnlySubtrees(root: HTMLElement): void {
  const elements = [
    ...(root.matches("[data-overview-pdf-only]") ? [root] : []),
    ...Array.from(root.querySelectorAll("[data-overview-pdf-only]")),
  ];
  for (const element of elements) {
    const htmlElement = element as HTMLElement;
    htmlElement.hidden = false;
    htmlElement.style.display = "block";
    htmlElement.classList.remove("hidden");
  }
}

function parseSvgNumber(value: string | null): number | null {
  if (!value) return null;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseViewBox(
  value: string | null
): [number, number, number, number] | null {
  if (!value) return null;
  const parts = value
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isFinite(part)))
    return null;
  if (parts[2] <= 0 || parts[3] <= 0) return null;
  return [parts[0], parts[1], parts[2], parts[3]];
}

function cssPixelNumber(value: string | undefined): number | null {
  if (!value || !value.endsWith("px")) return null;
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sourceSvgSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = parseViewBox(svg.getAttribute("viewBox"));
  const rect =
    typeof svg.getBoundingClientRect === "function"
      ? svg.getBoundingClientRect()
      : null;
  const computed = svg.ownerDocument.defaultView?.getComputedStyle(svg);
  const width =
    rect && rect.width > 0
      ? rect.width
      : (cssPixelNumber(computed?.width) ??
        parseSvgNumber(svg.getAttribute("width")) ??
        viewBox?.[2] ??
        1);
  const height =
    rect && rect.height > 0
      ? rect.height
      : (cssPixelNumber(computed?.height) ??
        parseSvgNumber(svg.getAttribute("height")) ??
        viewBox?.[3] ??
        1);
  return { width, height };
}

function prepareSvgContainScaling(
  sourceRoot: HTMLElement,
  cloneRoot: HTMLElement,
  ownerDocument: Document
): void {
  const sourceSvgs = Array.from(sourceRoot.querySelectorAll("svg"));
  const cloneSvgs = Array.from(cloneRoot.querySelectorAll("svg"));

  cloneSvgs.forEach((svg, index) => {
    const sourceSvg = sourceSvgs[index];
    const sourceSize = sourceSvg
      ? sourceSvgSize(sourceSvg)
      : sourceSvgSize(svg);
    const viewBox = parseViewBox(svg.getAttribute("viewBox"));
    if (!viewBox) {
      const width =
        parseSvgNumber(svg.getAttribute("width")) ?? sourceSize.width;
      const height =
        parseSvgNumber(svg.getAttribute("height")) ?? sourceSize.height;
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    const wrapper = ownerDocument.createElement("div");
    wrapper.className = "overview-pdf-svg-wrap";
    wrapper.style.width = `${sourceSize.width}px`;
    wrapper.style.maxWidth = "100%";
    wrapper.style.aspectRatio = `${sourceSize.width} / ${sourceSize.height}`;
    wrapper.setAttribute(
      "data-overview-pdf-svg-width",
      String(sourceSize.width)
    );
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.style.overflow = "visible";
    svg.replaceWith(wrapper);
    wrapper.appendChild(svg);
  });
}

/**
 * Clone and privacy-sanitize only the supplied Overview root. This is exported to permit DOM-aware
 * tests when a jsdom-like environment is available; native print uses it internally.
 */
export function sanitizeOverviewPdfClone(root: HTMLElement): HTMLElement {
  if (!root.matches("[data-overview-pdf-root]")) {
    throw new Error(
      "printOverviewPdf requires a root marked [data-overview-pdf-root]."
    );
  }

  const ownerDocument = root.ownerDocument;
  const clone = root.cloneNode(true) as HTMLElement;
  // Pair SVGs while the trees are identical: excluded icons would shift indices.
  prepareSvgContainScaling(root, clone, ownerDocument);
  replaceSelectedOptions(clone, ownerDocument);
  removeUnsafeCloneNodes(clone);
  sanitizeCloneAttributes(clone);
  openCloneDetails(clone);
  revealPdfOnlySubtrees(clone);
  clone.setAttribute("data-overview-pdf-frozen", "true");
  return clone;
}

function appendTextElement(
  ownerDocument: Document,
  parent: Element,
  tagName: string,
  value: string,
  className?: string
): HTMLElement {
  const element = ownerDocument.createElement(tagName);
  if (className) element.className = className;
  element.textContent = value;
  parent.appendChild(element);
  return element;
}

function buildHeaderDocument(
  ownerDocument: Document,
  metadata: OverviewPdfMetadata
): HTMLElement {
  const header = ownerDocument.createElement("header");
  header.className = "overview-pdf-header";
  header.setAttribute("aria-label", metadata.overviewLabel);

  const logo = ownerDocument.createElement("img");
  logo.className = "overview-pdf-logo";
  logo.src = OVERVIEW_PDF_LOGO_SRC;
  logo.alt = "MG Motors";
  header.appendChild(logo);

  const copy = ownerDocument.createElement("div");
  appendTextElement(
    ownerDocument,
    copy,
    "h1",
    `${metadata.overviewLabel} — MG Motors`
  );
  appendTextElement(
    ownerDocument,
    copy,
    "p",
    `${metadata.periodLabel} · ${metadata.cutoffLabel}`,
    "overview-pdf-header-meta"
  );
  appendTextElement(
    ownerDocument,
    copy,
    "p",
    `${metadata.latestLeadLabel} · ${metadata.generatedLabel}`,
    "overview-pdf-header-meta"
  );
  appendTextElement(
    ownerDocument,
    copy,
    "p",
    metadata.filtersLabel,
    "overview-pdf-filter-line"
  );
  if (metadata.latestLeadWarning) {
    appendTextElement(
      ownerDocument,
      copy,
      "p",
      metadata.latestLeadWarning,
      "overview-pdf-warning"
    );
  }
  header.appendChild(copy);
  return header;
}

function copyCurrentDocumentStyles(
  sourceDocument: Document,
  printDocument: Document
): HTMLLinkElement[] {
  const copiedLinks: HTMLLinkElement[] = [];
  const sourceStyles = Array.from(
    sourceDocument.querySelectorAll("style, link[rel~='stylesheet']")
  );

  for (const sourceStyle of sourceStyles) {
    if (sourceStyle.tagName.toLowerCase() === "style") {
      const style = printDocument.createElement("style");
      style.textContent = sourceStyle.textContent ?? "";
      printDocument.head.appendChild(style);
      continue;
    }

    const sourceLink = sourceStyle as HTMLLinkElement;
    const href = sourceLink.getAttribute("href");
    if (!href || !isSameOriginUrl(href, sourceDocument)) continue;

    const link = printDocument.createElement("link");
    copySafeAttributes(sourceLink, link);
    link.rel = "stylesheet";
    printDocument.head.appendChild(link);
    copiedLinks.push(link);
  }
  return copiedLinks;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  description: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error(`${description} did not finish before the timeout.`)),
      timeoutMs
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function waitForStylesheets(links: HTMLLinkElement[]): Promise<void> {
  return Promise.all(
    links.map(
      link =>
        new Promise<void>((resolve, reject) => {
          if (link.sheet) {
            resolve();
            return;
          }
          const onLoad = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(
              new Error(`A same-origin stylesheet failed to load: ${link.href}`)
            );
          };
          const cleanup = () => {
            link.removeEventListener("load", onLoad);
            link.removeEventListener("error", onError);
          };
          link.addEventListener("load", onLoad, { once: true });
          link.addEventListener("error", onError, { once: true });
        })
    )
  ).then(() => undefined);
}

function waitForFonts(printDocument: Document): Promise<void> {
  const fonts = printDocument.fonts;
  return fonts?.ready ? fonts.ready.then(() => undefined) : Promise.resolve();
}

function waitForImages(printDocument: Document): Promise<void> {
  const images = Array.from(printDocument.images);
  return Promise.all(
    images.map(
      image =>
        new Promise<void>((resolve, reject) => {
          if (!image.getAttribute("src") && !image.getAttribute("srcset")) {
            resolve();
            return;
          }
          if (image.complete) {
            if (image.naturalWidth > 0) resolve();
            else
              reject(
                new Error(
                  `An image failed to load: ${image.currentSrc || image.src}`
                )
              );
            return;
          }
          const onLoad = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(
              new Error(
                `An image failed to load: ${image.currentSrc || image.src}`
              )
            );
          };
          const cleanup = () => {
            image.removeEventListener("load", onLoad);
            image.removeEventListener("error", onError);
          };
          image.addEventListener("load", onLoad, { once: true });
          image.addEventListener("error", onError, { once: true });
        })
    )
  ).then(() => undefined);
}

function createPrintIframe(
  sourceDocument: Document,
  title: string
): HTMLIFrameElement {
  if (!sourceDocument.body)
    throw new Error("The Overview document has no body.");

  const iframe = sourceDocument.createElement("iframe");
  iframe.title = `${title} — MG Motors Overview`;
  iframe.setAttribute("aria-label", iframe.title);
  iframe.tabIndex = -1;
  iframe.setAttribute("scrolling", "no");
  iframe.style.position = "fixed";
  iframe.style.left = "-100000px";
  iframe.style.top = "0";
  iframe.style.width = "100vw";
  iframe.style.height = "100vh";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.style.zIndex = "-1";
  sourceDocument.body.appendChild(iframe);
  return iframe;
}

function initializePrintDocument(printDocument: Document, title: string): void {
  printDocument.open();
  printDocument.write(
    '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'
  );
  printDocument.close();
  printDocument.title = title;
}

function removeIframe(iframe: HTMLIFrameElement): void {
  iframe.parentNode?.removeChild(iframe);
}

/**
 * Prints a frozen, isolated clone through the browser's native print dialog. The returned promise
 * resolves after print() has been requested; the iframe remains until afterprint or the bounded
 * fallback so the native dialog never loses its document immediately.
 */
export async function printOverviewPdf(
  input: PrintOverviewPdfInput
): Promise<void> {
  const sourceDocument = input.root.ownerDocument;
  validateOverviewPdfDateRange(input);
  const metadata = buildOverviewPdfMetadata({
    locale: input.locale,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    cutoff: input.cutoff,
    latestLeadDate: input.latestLeadDate,
    filters: input.filters,
  });
  const clone = sanitizeOverviewPdfClone(input.root);
  const iframe = createPrintIframe(sourceDocument, metadata.title);
  const originalTitle = sourceDocument.title;
  let cleaned = false;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (cleanupTimer) clearTimeout(cleanupTimer);
    iframe.contentWindow?.removeEventListener("afterprint", cleanup);
    if (sourceDocument.title === metadata.title) {
      sourceDocument.title = originalTitle;
    }
    removeIframe(iframe);
  };

  try {
    const printDocument = iframe.contentDocument;
    const printWindow = iframe.contentWindow;
    if (!printDocument || !printWindow) {
      throw new Error("The browser did not create an isolated print document.");
    }

    initializePrintDocument(printDocument, metadata.title);
    const copiedLinks = copyCurrentDocumentStyles(
      sourceDocument,
      printDocument
    );
    const printCss = printDocument.createElement("style");
    printCss.setAttribute("data-overview-pdf-print-css", "true");
    printCss.textContent = buildOverviewPdfPrintCss();
    printDocument.head.appendChild(printCss);

    const documentShell = printDocument.createElement("main");
    documentShell.className = "overview-pdf-document";
    documentShell.appendChild(buildHeaderDocument(printDocument, metadata));

    const content = printDocument.createElement("section");
    content.className = "overview-pdf-content";
    content.appendChild(printDocument.importNode(clone, true));
    documentShell.appendChild(content);
    printDocument.body.appendChild(documentShell);

    sourceDocument.title = metadata.title;
    printWindow.addEventListener("afterprint", cleanup, { once: true });

    await withTimeout(
      Promise.all([
        waitForStylesheets(copiedLinks),
        waitForFonts(printDocument),
        waitForImages(printDocument),
      ]).then(() => undefined),
      OVERVIEW_PDF_ASSET_TIMEOUT_MS,
      "Overview PDF assets"
    );

    cleanupTimer = setTimeout(cleanup, OVERVIEW_PDF_CLEANUP_TIMEOUT_MS);
    printWindow.focus();
    if (typeof printWindow.print !== "function") {
      throw new Error("Native browser printing is unavailable.");
    }
    printWindow.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
