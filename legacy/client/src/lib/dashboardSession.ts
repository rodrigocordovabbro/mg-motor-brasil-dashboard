export const DASHBOARD_SESSION_EXPIRED_MESSAGE = "Sessão inválida ou expirada";

type TrpcErrorShape = {
  message?: unknown;
  data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Distingue a expiração da sessão local do dashboard dos erros de autenticação
 * do Manus OAuth. As duas rotas devem continuar com fluxos de recuperação
 * independentes para não redirecionar usuários ao provedor errado.
 */
export function isDashboardSessionExpiredError(error: unknown) {
  if (!isRecord(error)) return false;
  const candidate = error as TrpcErrorShape;
  if (candidate.message !== DASHBOARD_SESSION_EXPIRED_MESSAGE) return false;

  if (!isRecord(candidate.data)) return true;
  const httpStatus = candidate.data.httpStatus;
  return httpStatus === undefined || httpStatus === 401;
}
