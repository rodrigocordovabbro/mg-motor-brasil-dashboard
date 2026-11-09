import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type LoginInput = { username: string; password: string };
type SessionUser = { id: number; username: string; role: "admin" | "client" };

type HostNode = {
  type: string;
  props: Record<string, any>;
};
type TreeNode =
  | HostNode
  | TreeNode[]
  | string
  | number
  | boolean
  | null
  | undefined;

const state = vi.hoisted(() => ({
  session: null as SessionUser | null,
  sessionLoading: false,
  sessionError: false,
  mutationPending: false,
  mutationError: null as unknown,
  submission: null as LoginInput | null,
  refetch: vi.fn(),
  loginMutateAsync: vi.fn(),
}));

const hooks = vi.hoisted(() => ({
  cursor: 0,
  slots: [] as unknown[],
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  function useState<T>(initialState: T | (() => T)) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) {
      hooks.slots[index] =
        typeof initialState === "function"
          ? (initialState as () => T)()
          : initialState;
    }
    const setState = (next: T | ((previous: T) => T)) => {
      const previous = hooks.slots[index] as T;
      hooks.slots[index] =
        typeof next === "function"
          ? (next as (previous: T) => T)(previous)
          : next;
    };
    return [hooks.slots[index] as T, setState] as const;
  }

  return { ...actual, useState };
});

vi.mock("@/lib/trpc", () => ({
  trpc: {
    auth: {
      me: {
        useQuery: () => ({
          data: state.session,
          error: state.sessionError ? new Error("raw session failure") : null,
          isError: state.sessionError,
          isLoading: state.sessionLoading,
          isFetching: false,
          refetch: state.refetch,
        }),
      },
      login: {
        useMutation: () => ({
          isPending: state.mutationPending,
          mutateAsync: state.loginMutateAsync,
        }),
      },
    },
  },
}));

import Home from "../client/src/pages/Home";

function resetHarness() {
  state.session = null;
  state.sessionLoading = false;
  state.sessionError = false;
  state.mutationPending = false;
  state.mutationError = null;
  state.submission = null;
  hooks.cursor = 0;
  hooks.slots = [];

  state.refetch.mockReset();
  state.refetch.mockResolvedValue({ data: null });
  state.loginMutateAsync.mockReset();
  state.loginMutateAsync.mockImplementation(async (input: LoginInput) => {
    state.submission = input;
    if (state.mutationError) throw state.mutationError;
    return { success: true };
  });
}

function renderMarkup() {
  hooks.cursor = 0;
  return renderToStaticMarkup(React.createElement(Home));
}

function resolveTree(node: unknown): TreeNode {
  if (
    node === null ||
    node === undefined ||
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "boolean"
  ) {
    return node;
  }
  if (Array.isArray(node)) return node.map(resolveTree);
  if (!React.isValidElement(node)) return null;

  const element = node as React.ReactElement<Record<string, unknown>>;
  if (element.type === React.Fragment) {
    return resolveTree(element.props.children);
  }
  if (typeof element.type === "function") {
    const component = element.type as (props: Record<string, unknown>) => unknown;
    return resolveTree(component(element.props));
  }

  const props = { ...element.props } as Record<string, any>;
  props.children = resolveTree(props.children);
  return { type: element.type as string, props };
}

function renderTree() {
  hooks.cursor = 0;
  return resolveTree(React.createElement(Home));
}

function findAll(
  node: TreeNode,
  predicate: (host: HostNode) => boolean
): HostNode[] {
  if (Array.isArray(node)) return node.flatMap(child => findAll(child, predicate));
  if (!node || typeof node !== "object" || !("type" in node)) return [];

  const host = node as HostNode;
  const matches = predicate(host) ? [host] : [];
  return matches.concat(findAll(host.props.children as TreeNode, predicate));
}

function findInput(tree: TreeNode, name: string) {
  const input = findAll(
    tree,
    host => host.type === "input" && host.props.name === name
  )[0];
  if (!input) throw new Error(`Input not found: ${name}`);
  return input;
}

function findForm(tree: TreeNode) {
  const form = findAll(tree, host => host.type === "form")[0];
  if (!form) throw new Error("Login form not found");
  return form;
}

function findAlert(tree: TreeNode) {
  const alert = findAll(
    tree,
    host => host.type === "div" && host.props.role === "alert"
  )[0];
  if (!alert) throw new Error("Login alert not found");
  return alert;
}

function textContent(node: TreeNode): string {
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  return textContent(node.props.children as TreeNode);
}

function changeInput(tree: TreeNode, name: string, value: string) {
  const input = findInput(tree, name);
  const onChange = input.props.onChange as (event: {
    target: { value: string };
  }) => void;
  onChange({ target: { value } });
}

async function submitLogin(tree: TreeNode) {
  const form = findForm(tree);
  const onSubmit = form.props.onSubmit as (event: {
    preventDefault: () => void;
  }) => Promise<void>;
  await onSubmit({ preventDefault: vi.fn() });
}

beforeEach(resetHarness);

describe("login English UI", () => {
  it("renders English pre-login copy for desktop and mobile layouts with accessible fields", () => {
    const html = renderMarkup();

    expect(html).toContain("Staging environment");
    expect(html).toContain("Performance dashboard");
    expect(html).toContain("Performance at a glance.");
    expect(html).toContain("Secure session");
    expect(html).toContain("MG Motor Brasil");
    expect(html).toContain("Sign in with your username and password");
    expect(html).toContain("Username");
    expect(html).toContain("Password");
    expect(html).toContain("Enter your username");
    expect(html).toContain("Enter your password");
    expect(html).toContain("Access is restricted to authorized users.");
    expect(html).toMatch(/aria-label="MG Motor Brasil[^"]*"/);
    expect(html).toMatch(/<div class="hidden[^\"]*lg:flex/);
    expect(html).toContain('class="lg:hidden"');
    expect(html).toContain('name="username"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('name="password"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toMatch(/<form[^>]*noValidate/);
    expect(html).toContain("Sign in");

    for (const portugueseCopy of [
      "Usuário",
      "Senha",
      "Entrar",
      "Entrando",
      "Digite seu",
      "Acesso restrito",
      "Ambiente de homologação",
      "Acompanhamento",
    ]) {
      expect(html).not.toContain(portugueseCopy);
    }
  });

  it("keeps the session-loading screen in English", () => {
    state.sessionLoading = true;

    const html = renderMarkup();

    expect(html).toContain("Checking your session…");
    expect(html).not.toContain("Verificando sessão");
    expect(html).not.toContain("Usuário");
    expect(html).not.toContain("Senha");
  });

  it("validates missing username and missing password in English without sending credentials", async () => {
    for (const { username, password } of [
      { username: "   ", password: "secret" },
      { username: "alice", password: "" },
    ]) {
      resetHarness();
      changeInput(renderTree(), "username", username);
      changeInput(renderTree(), "password", password);

      await submitLogin(renderTree());

      expect(state.loginMutateAsync).not.toHaveBeenCalled();
      expect(textContent(findAlert(renderTree()))).toBe(
        "Enter your username and password to continue."
      );
    }
  });

  it("maps authentication, request, rate-limit, and network failures to safe English copy", async () => {
    for (const { code, raw, expected } of [
      {
        code: "UNAUTHORIZED",
        raw: "raw unauthorized server detail",
        expected: "Incorrect username or password",
      },
      {
        code: "BAD_REQUEST",
        raw: "raw bad-request server detail",
        expected: "Please check your username and password",
      },
      {
        code: "TOO_MANY_REQUESTS",
        raw: "raw rate-limit server detail",
        expected: "Too many sign-in attempts",
      },
      {
        code: "NETWORK",
        raw: "raw network timeout from backend",
        expected: "Unable to sign in",
      },
    ]) {
      resetHarness();
      state.mutationError = Object.assign(new Error(raw), {
        data: code === "NETWORK" ? undefined : { code },
      });
      changeInput(renderTree(), "username", "alice");
      changeInput(renderTree(), "password", "secret");

      await submitLogin(renderTree());

      const alertText = textContent(findAlert(renderTree()));
      expect(alertText).toContain(expected);
      expect(alertText).not.toContain(raw);
      expect(alertText).not.toContain("server detail");
      expect(alertText).not.toContain("backend");
    }
  });

  it("trims only username, preserves password exactly, clears password after success, and refreshes the session", async () => {
    state.refetch.mockResolvedValue({ data: null });
    changeInput(renderTree(), "username", "  alice  ");
    changeInput(renderTree(), "password", "p@ ss! with spaces ");

    await submitLogin(renderTree());

    expect(state.submission).toEqual({
      username: "alice",
      password: "p@ ss! with spaces ",
    });
    expect(state.refetch).toHaveBeenCalledTimes(1);
    expect(findInput(renderTree(), "password").props.value).toBe("");
  });

  it("shows Signing in… and disables the submit button while login is pending", () => {
    state.mutationPending = true;

    const tree = renderTree();
    const button = findAll(tree, host => host.type === "button")[0];

    expect(button?.props.type).toBe("submit");
    expect(button?.props.disabled).toBe(true);
    expect(textContent(button)).toContain("Signing in…");
    expect(textContent(button)).not.toContain("Sign in");
  });
});
