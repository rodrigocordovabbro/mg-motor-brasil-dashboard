import { TRPCError } from "@trpc/server";
import type { RowDataPacket } from "mysql2/promise";
import { getV2Pool } from "./v2Db";
import type {
  DispatchReport,
  DispatchReportSummary,
  DispatchValidation,
  DispatchAuditEntry,
  DispatchRow,
} from "../shared/v2Dispatch";
import type { V2Identity } from "./v2Auth";

const iso = (value: unknown) => new Date(String(value)).toISOString();
const summary = (row: RowDataPacket): DispatchReportSummary => ({
  id: Number(row.id),
  title: String(row.title),
  fileName: String(row.fileName),
  dateFrom: String(row.dateFrom),
  dateTo: String(row.dateTo),
  generatedLabel: String(row.generatedLabel),
});
export async function listDispatchReports(): Promise<DispatchReportSummary[]> {
  const [rows] = await getV2Pool().query<RowDataPacket[]>(
    "SELECT id,title,fileName,dateFrom,dateTo,generatedLabel FROM v2_dispatch_reports ORDER BY dateTo DESC,id DESC"
  );
  return rows.map(summary);
}

export async function getDispatchReport(
  reportId: number
): Promise<DispatchReport> {
  const db = getV2Pool();
  const [reports] = await db.execute<RowDataPacket[]>(
    "SELECT * FROM v2_dispatch_reports WHERE id=? LIMIT 1",
    [reportId]
  );
  if (!reports[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Controle de envios não encontrado",
    });
  const report = reports[0];
  const metadata =
    typeof report.metadata === "string"
      ? JSON.parse(report.metadata)
      : report.metadata;
  const [rawRows] = await db.execute<RowDataPacket[]>(
    "SELECT id,rowNumber,storeName,crmResponsible,syonetIntegration,bbroIntegration FROM v2_dispatch_rows WHERE reportId=? ORDER BY rowNumber",
    [reportId]
  );
  const [rawCells] = await db.execute<RowDataPacket[]>(
    "SELECT c.id,c.rowId,r.rowNumber,c.dispatchDate,c.syonet,c.sourceManual,c.volume,k.isOk,k.version,k.reviewerLabel,k.updatedAt,a.username AS updatedBy FROM v2_dispatch_cells c INNER JOIN v2_dispatch_rows r ON r.id=c.rowId LEFT JOIN v2_dispatch_checks k ON k.cellId=c.id LEFT JOIN v2_accounts a ON a.id=k.updatedBy WHERE r.reportId=? ORDER BY r.rowNumber,c.dispatchDate",
    [reportId]
  );
  const byRow = new Map<number, DispatchRow>();
  rawRows.forEach(r =>
    byRow.set(Number(r.id), {
      id: Number(r.id),
      rowNumber: Number(r.rowNumber),
      storeName: String(r.storeName),
      crmResponsible: String(r.crmResponsible),
      syonetIntegration: String(r.syonetIntegration),
      bbroIntegration: String(r.bbroIntegration),
      cells: [],
    })
  );
  rawCells.forEach(c =>
    byRow
      .get(Number(c.rowId))
      ?.cells.push({
        id: Number(c.id),
        rowNumber: Number(c.rowNumber),
        date: String(c.dispatchDate),
        syonet: String(c.syonet),
        sourceManual: String(c.sourceManual),
        volume: Number(c.volume),
        validation:
          c.version == null
            ? null
            : {
                isOk: Boolean(c.isOk),
                version: Number(c.version),
                reviewerLabel: String(c.reviewerLabel),
                updatedBy: String(c.updatedBy),
                updatedAt: iso(c.updatedAt),
              },
      })
  );
  const days = (
    metadata.days as { date: string; label: string; sourceTotal: number }[]
  ).map(d => ({
    ...d,
    computedTotal: rawCells
      .filter(c => String(c.dispatchDate) === d.date)
      .reduce((s, c) => s + Number(c.volume), 0),
  }));
  return {
    ...summary(report),
    importedAt: iso(report.importedAt),
    information: [],
    days,
    rows: [...byRow.values()],
    totals: {
      computed: rawCells.reduce((s, c) => s + Number(c.volume), 0),
      sourceDailySum: days.reduce((s, d) => s + Number(d.sourceTotal), 0),
      declaredInInstructions: null,
      sourceManualOk: rawCells.filter(
        c => String(c.sourceManual).trim().toUpperCase() === "OK"
      ).length,
      auditedOk: rawCells.filter(c => c.version != null && Boolean(c.isOk))
        .length,
      manualOverridden: rawCells.filter(c => c.version != null).length,
    },
    notes: [
      "Controle reproduzido da aba Envios do arquivo importado. Os dados de despacho são uma fotografia da fonte, não uma integração em tempo real.",
      "Somente Manual é editável. A conferência do fluxo Wini registra a conta autenticada e o horário de quem salva; não realiza envios, nem altera SYONET ou volumes.",
      "Os OK que já constavam no arquivo são identificados como origem arquivo e não são atribuídos automaticamente ao Wini.",
    ],
  };
}

export function assertDispatchVersion(actual: number, expected: number) {
  if (actual !== expected)
    throw new TRPCError({
      code: "CONFLICT",
      message:
        "Outra pessoa atualizou esta célula. Atualize o controle antes de confirmar novamente.",
    });
}
export async function setDispatchManual(
  cellId: number,
  isOk: boolean,
  expectedVersion: number,
  actor: V2Identity
): Promise<DispatchValidation> {
  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    // Lock the source cell even when no check exists, preventing two initial writes.
    const [cells] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM v2_dispatch_cells WHERE id=? FOR UPDATE",
      [cellId]
    );
    if (!cells[0])
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Célula de conferência não encontrada",
      });
    const [current] = await connection.execute<RowDataPacket[]>(
      "SELECT isOk,version FROM v2_dispatch_checks WHERE cellId=?",
      [cellId]
    );
    const version = current[0] ? Number(current[0].version) : 0;
    assertDispatchVersion(version, expectedVersion);
    const nextVersion = version + 1;
    await connection.execute(
      "INSERT INTO v2_dispatch_checks (cellId,isOk,version,reviewerLabel,updatedBy) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE isOk=VALUES(isOk),version=VALUES(version),reviewerLabel=VALUES(reviewerLabel),updatedBy=VALUES(updatedBy),updatedAt=CURRENT_TIMESTAMP",
      [cellId, isOk, nextVersion, "Wini", actor.id]
    );
    await connection.execute(
      "INSERT INTO v2_dispatch_check_audit (cellId,previousIsOk,isOk,reviewerLabel,changedBy,version) VALUES (?,?,?,?,?,?)",
      [
        cellId,
        current[0] ? Boolean(current[0].isOk) : null,
        isOk,
        "Wini",
        actor.id,
        nextVersion,
      ]
    );
    const [saved] = await connection.execute<RowDataPacket[]>(
      "SELECT updatedAt FROM v2_dispatch_checks WHERE cellId=?",
      [cellId]
    );
    await connection.commit();
    return {
      isOk,
      version: nextVersion,
      reviewerLabel: "Wini",
      updatedBy: actor.username,
      updatedAt: iso(saved[0].updatedAt),
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getDispatchHistory(
  cellId: number
): Promise<DispatchAuditEntry[]> {
  const db = getV2Pool();
  const [cell] = await db.execute<RowDataPacket[]>(
    "SELECT id FROM v2_dispatch_cells WHERE id=?",
    [cellId]
  );
  if (!cell[0])
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Célula de conferência não encontrada",
    });
  const [rows] = await db.execute<RowDataPacket[]>(
    "SELECT h.id,h.isOk,h.previousIsOk,h.reviewerLabel,h.version,h.createdAt,a.username AS changedBy FROM v2_dispatch_check_audit h INNER JOIN v2_accounts a ON a.id=h.changedBy WHERE h.cellId=? ORDER BY h.id DESC",
    [cellId]
  );
  return rows.map(r => ({
    id: Number(r.id),
    isOk: Boolean(r.isOk),
    previousIsOk: r.previousIsOk == null ? null : Boolean(r.previousIsOk),
    reviewerLabel: String(r.reviewerLabel),
    changedBy: String(r.changedBy),
    createdAt: iso(r.createdAt),
    version: Number(r.version),
  }));
}
