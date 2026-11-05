import type { RowDataPacket } from "mysql2/promise";
import { TRPCError } from "@trpc/server";
import {
  addIsoDays,
  getDashboardCutoffDate,
  isIsoCalendarDate,
} from "../shared/dashboardDates";
import type { DispatchDay } from "../shared/v2Dispatch";
import { getV2Pool } from "./v2Db";

const MAX_CATCHUP_DAYS = 370;

type DispatchMetadata = {
  days: DispatchDay[];
  [key: string]: unknown;
};

function parseMetadata(value: unknown): DispatchMetadata {
  let parsed: unknown = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = {};
    }
  }
  const object =
    parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  const rawDays = Array.isArray(object.days) ? object.days : [];
  const days = rawDays
    .filter(
      day =>
        day &&
        typeof day === "object" &&
        isIsoCalendarDate(String((day as { date?: unknown }).date ?? ""))
    )
    .map(day => {
      const source = day as Record<string, unknown>;
      return {
        date: String(source.date),
        label: String(source.label ?? source.date),
        sourceTotal:
          typeof source.sourceTotal === "number" ? source.sourceTotal : null,
        computedTotal:
          typeof source.computedTotal === "number"
            ? source.computedTotal
            : null,
        ...(source.pending === true ? { pending: true } : {}),
      } satisfies DispatchDay;
    });
  return { ...object, days };
}

function dayLabel(date: string): string {
  const months = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const [year, month, day] = date.split("-");
  return `${day}/${months[Number(month) - 1] ?? month}`;
}

function sortDays(days: DispatchDay[]): DispatchDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

function notFound(): never {
  throw new TRPCError({
    code: "NOT_FOUND",
    message: "Controle de envios não encontrado",
  });
}

export type PrepareDispatchDayResult = {
  date: string;
  added: boolean;
  missingSource: boolean;
};

export async function prepareDispatchDay(
  reportId: number,
  now: Date = new Date()
): Promise<PrepareDispatchDayResult> {
  const cutoffDate = getDashboardCutoffDate(now);
  const connection = await getV2Pool().getConnection();
  try {
    await connection.beginTransaction();
    const [reports] = await connection.execute<RowDataPacket[]>(
      "SELECT id,metadata FROM v2_dispatch_reports WHERE id=? LIMIT 1 FOR UPDATE",
      [reportId]
    );
    if (!reports[0]) notFound();

    const metadata = parseMetadata(reports[0].metadata);
    const existingDates = new Set(metadata.days.map(day => day.date));
    const eligibleDates = metadata.days
      .map(day => day.date)
      .filter(date => date <= cutoffDate)
      .sort();
    const anchor = eligibleDates.at(-1) ?? addIsoDays(cutoffDate, -1);
    const boundedStart = addIsoDays(cutoffDate, -(MAX_CATCHUP_DAYS - 1));
    let nextDate = addIsoDays(anchor, 1);
    if (nextDate < boundedStart) nextDate = boundedStart;

    const addedDays: DispatchDay[] = [];
    while (nextDate <= cutoffDate) {
      if (!existingDates.has(nextDate)) {
        addedDays.push({
          date: nextDate,
          label: dayLabel(nextDate),
          sourceTotal: null,
          computedTotal: null,
          pending: true,
        });
        existingDates.add(nextDate);
      }
      nextDate = addIsoDays(nextDate, 1);
    }

    if (addedDays.length) {
      const days = sortDays([...metadata.days, ...addedDays]);
      const [rows] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM v2_dispatch_rows WHERE reportId=? ORDER BY rowNumber FOR UPDATE",
        [reportId]
      );
      for (const row of rows) {
        for (const day of addedDays) {
          await connection.execute(
            "INSERT IGNORE INTO v2_dispatch_cells (rowId,dispatchDate,syonet,sourceManual,volume,sourcePending) VALUES (?,?,?,?,?,?)",
            [Number(row.id), day.date, "", "", null, true]
          );
        }
      }
      await connection.execute(
        "UPDATE v2_dispatch_reports SET metadata=? WHERE id=?",
        [JSON.stringify({ ...metadata, days }), reportId]
      );
    }

    const finalDays = sortDays([...metadata.days, ...addedDays]);
    const cutoffDay = finalDays.find(day => day.date === cutoffDate);
    await connection.commit();
    return {
      date: cutoffDate,
      added: addedDays.length > 0,
      missingSource: !cutoffDay || cutoffDay.pending === true,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const dispatchDailyLimits = { maxCatchupDays: MAX_CATCHUP_DAYS };
