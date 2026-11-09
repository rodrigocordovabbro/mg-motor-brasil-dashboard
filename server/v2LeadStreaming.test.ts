import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rows: [] as any[],
  query: vi.fn(),
  execute: vi.fn(),
  coreQuery: vi.fn(),
  stream: vi.fn(),
}));
vi.mock("./v2Db", () => ({
  getV2Pool: () => ({
    query: state.query,
    execute: state.execute,
    pool: { query: state.coreQuery },
  }),
}));
import {
  invalidateAnalyticalCache,
  readV2LeadsForPeriod,
  V2_COUNTING_SOURCE_SELECT,
} from "./v2Leads";
function row(id: number) {
  return {
    id,
    date: "2026-11-08",
    hour: 12,
    name: "Pessoa de teste",
    model: "MG 4",
    version: "Não informado",
    channel: "Site",
    campaign: "Teste",
    dealer: "Dealer de teste",
    city: "São Paulo",
    state: "SP",
    crm: "Não informado",
    sourceSheet: "Site",
    headersJson: JSON.stringify([
      "data",
      "Modelo de Interesse",
      "Concessionária",
      "Nome do solicitante",
      "E-mail do solicitante",
    ]),
    valuesJson: JSON.stringify([
      "08/11/2026",
      "MG4",
      "Dealer de teste",
      "Pessoa de teste",
      "teste@example.invalid",
    ]),
    sourceTimestampRaw: "08/11/2026",
  };
}
beforeEach(() => {
  invalidateAnalyticalCache();
  vi.clearAllMocks();
  state.rows = [row(1), row(2)];
  state.query.mockResolvedValue([
    [
      {
        importedAt: "2026-11-09T12:00:00Z",
        totalRows: 2,
        inputSha256: "fixture",
      },
    ],
    [],
  ]);
  state.stream.mockImplementation(() =>
    Readable.from(state.rows, { objectMode: true, highWaterMark: 32 })
  );
  state.coreQuery.mockReturnValue({ stream: state.stream });
});
describe("leitura analítica streaming em produção", () => {
  it("usa uma consulta com backpressure e mantém a primeira ocorrência sem retornar proveniência", async () => {
    const result = await readV2LeadsForPeriod("2026-11-01", "2026-11-08");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(state.coreQuery).toHaveBeenCalledOnce();
    expect(state.coreQuery).toHaveBeenCalledWith(V2_COUNTING_SOURCE_SELECT);
    expect(state.stream).toHaveBeenCalledWith({ highWaterMark: 32 });
    expect(state.execute).not.toHaveBeenCalled();
    expect(result[0]).not.toHaveProperty("headersJson");
    expect(result[0]).not.toHaveProperty("valuesJson");
    await readV2LeadsForPeriod("2026-11-01", "2026-11-08");
    expect(state.coreQuery).toHaveBeenCalledOnce();
  });
  it("descarta o cache incompleto depois de erro do stream e permite uma leitura nova", async () => {
    state.stream.mockImplementationOnce(() =>
      Readable.from(
        (async function* () {
          yield row(1);
          throw new Error("stream indisponível");
        })()
      )
    );
    await expect(
      readV2LeadsForPeriod("2026-11-01", "2026-11-08")
    ).rejects.toThrow("stream indisponível");
    expect(await readV2LeadsForPeriod("2026-11-01", "2026-11-08")).toHaveLength(
      1
    );
    expect(state.coreQuery).toHaveBeenCalledTimes(2);
  });
});
