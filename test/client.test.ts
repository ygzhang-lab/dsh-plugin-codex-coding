import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  apply,
  CodingSettingsPage,
  installCardStyles,
  WorkflowModeCard,
  inject,
  NS,
} from "../src/client/index.js";

function form(
  value: Record<string, unknown> | undefined,
  options: { status?: string; writable?: boolean; revision?: number } = {},
) {
  return {
    getSnapshot: () => ({
      status: options.status ?? "ready",
      value,
      base: value,
      user: value,
      revision: options.revision ?? 1,
      writable: options.writable ?? true,
    }),
    subscribe: () => () => {},
    mutate: async () => true,
  };
}

function count(html: string, value: string): number {
  return html.split(value).length - 1;
}

/** Checked checkboxes regardless of where React places the attribute. */
function checkedBoxes(html: string): number {
  return [...html.matchAll(/<input[^>]*>/g)].filter(
    (match) =>
      match[0].includes('type="checkbox"') && match[0].includes('checked=""'),
  ).length;
}

const t = (key: string) => key;

describe("Coding settings page", () => {
  it("renders the reasoning, skills, and plugin controls", () => {
    const html = renderToStaticMarkup(
      createElement(CodingSettingsPage, {
        view: "page",
        t,
        form: form({
          reasoning: "auto",
          localSkills: true,
          disabledPlugins: [],
        }),
      }),
    );
    expect(html).toContain("dsh-plugin-coding-reasoning");
    expect(html).toContain('type="radio"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("@deepseek-ai/dsh-tool-web");
    expect(html).toContain("web_search, web_fetch");
  });

  it("reflects a fixed level and disabled plugins", () => {
    const html = renderToStaticMarkup(
      createElement(CodingSettingsPage, {
        view: "page",
        t,
        form: form({
          reasoning: "max",
          localSkills: false,
          disabledPlugins: ["@deepseek-ai/dsh-tool-web"],
        }),
      }),
    );
    expect(html).toMatch(/(?:value="max" checked=""|checked="" value="max")/);
    expect(checkedBoxes(html)).toBe(7);
    expect(count(html, 'type="checkbox"')).toBe(9);
  });

  it("locks core plugins on even when a stored config disables them", () => {
    const html = renderToStaticMarkup(
      createElement(CodingSettingsPage, {
        view: "page",
        t,
        form: form({
          reasoning: "auto",
          localSkills: true,
          // A hand-edited profile may still contain a core module.
          disabledPlugins: ["@deepseek-ai/dsh-tool-fs"],
        }),
      }),
    );
    expect(checkedBoxes(html)).toBe(9);
    expect(count(html, 'disabled=""')).toBe(4);
    expect(count(html, 'title="coreLocked"')).toBe(4);
  });

  it("renders the conversation language choice", () => {
    const html = renderToStaticMarkup(
      createElement(CodingSettingsPage, {
        view: "page",
        t,
        form: form({
          reasoning: "auto",
          localSkills: true,
          language: "en",
          disabledPlugins: [],
        }),
      }),
    );
    expect(html).toContain("dsh-plugin-coding-language");
    // Four reasoning levels plus three conversation-language choices.
    expect(count(html, 'type="radio"')).toBe(7);
    expect(html).toMatch(/(?:value="en" checked=""|checked="" value="en")/);
  });

  it("renders a compact summary for the plugin row", () => {
    const html = renderToStaticMarkup(
      createElement(CodingSettingsPage, {
        view: "summary",
        t,
        form: form({
          reasoning: "auto",
          localSkills: true,
          disabledPlugins: [],
        }),
      }),
    );
    expect(html).toBe("summary");
  });

  it("shows an unavailable configuration instead of stale controls", () => {
    const html = renderToStaticMarkup(
      createElement(CodingSettingsPage, {
        view: "page",
        t,
        form: form(undefined, {
          status: "unavailable",
          writable: false,
          revision: undefined,
        }),
      }),
    );
    expect(html).toContain("unavailable");
    expect(html).not.toContain('type="radio"');
  });

  it("disables every control for a read-only deployment", () => {
    const html = renderToStaticMarkup(
      createElement(CodingSettingsPage, {
        view: "page",
        t,
        form: form(
          { reasoning: "auto", localSkills: true, disabledPlugins: [] },
          { writable: false },
        ),
      }),
    );
    expect(html).toContain("readOnly");
    // Four reasoning levels, three language choices, one skills box, and five
    // locked core plugin boxes.
    expect(count(html, 'disabled=""')).toBe(16);
  });

  function harness() {
    const registrations: any[] = [];
    let dictionaries: any;
    const execute = vi.fn(async () => ({ ok: true, value: undefined }));
    const ctx = {
      locale: {
        bind: () => t,
        register: (_name: string, value: any) => {
          dictionaries = value;
          return () => {};
        },
      },
      configForms: {
        get: () =>
          form({ reasoning: "auto", localSkills: true, disabledPlugins: [] }),
      },
      slots: {
        inject: (_name: string, callback: () => unknown) => callback(),
        register: (options: any, component: any) => {
          registrations.push({ ...options, component });
          return () => {};
        },
      },
      remote: { commands: { execute } },
      effect: (callback: () => unknown) => callback(),
    };
    return { ctx, registrations, execute, dictionaries: () => dictionaries };
  }

  it("registers the configuration direct on the bundle page", () => {
    const { ctx, registrations, dictionaries } = harness();
    apply(ctx);
    expect(inject).toContain("configForms");
    expect(NS).toBe("settings.dshCoding");
    expect(registrations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "plugins.bundle.config",
          key: "dsh-plugin-codex-coding",
        }),
        expect.objectContaining({
          name: "conversation.chat.turnTail",
          id: "dsh-plugin-codex-coding/workflow-mode",
        }),
      ]),
    );
    expect(dictionaries().en.description).toContain("Codex Coding");
    expect(dictionaries().zh.description).toContain("Codex Coding");
    expect(dictionaries().en.summary).toContain("DSH Codex Coding");
    expect(dictionaries().zh.summary).toContain("DSH Codex Coding");
  });

  it("executes the workflow command through the injected Remote", async () => {
    const { ctx, registrations, execute } = harness();
    apply(ctx);
    // Reading an un-injected service throws in Cordis, so the card keeps a
    // failing switch until this declaration covers `remote`.
    expect(inject).toEqual(
      expect.arrayContaining(["remote", "remote.commands"]),
    );
    const card = registrations.find(
      (entry) => entry.name === "conversation.chat.turnTail",
    );
    const element = card.component({
      t,
      sessionId: "session-1",
      useProjection: () => ({ mode: "auto" }),
    });
    await expect(element.props.execute("/workflow review")).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(execute).toHaveBeenCalledWith("session-1", "/workflow review", []);
  });
});

describe("workflow mode card", () => {
  it("shows the projected mode and one button per mode", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowModeCard, {
        t,
        execute: async () => ({ ok: true }),
        useProjection: () => ({ mode: "review", active: true }),
      }),
    );
    expect(html).toContain("workflowTitle");
    expect(html).toContain("workflowModeReview");
    expect(count(html, "<button")).toBe(4);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("workflowManualStatus");
  });

  it("renders the automatic status for the default mode", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowModeCard, {
        t,
        execute: async () => ({ ok: true }),
        useProjection: () => ({ mode: "auto", active: true }),
      }),
    );
    expect(html).toContain("workflowAutoStatus");
    expect(html).toContain("workflowSwitchHint");
  });

  it("renders nothing for a session without the Coding projection", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowModeCard, {
        t,
        execute: async () => ({ ok: true }),
        useProjection: () => undefined,
      }),
    );
    expect(html).toBe("");
  });

  it("renders when only the published mode is present", () => {
    // Every session publishes the projection now; an older Host value that
    // omits `active` must still render.
    const html = renderToStaticMarkup(
      createElement(WorkflowModeCard, {
        t,
        execute: async () => ({ ok: true }),
        useProjection: () => ({ mode: "auto" }),
      }),
    );
    expect(html).toContain("workflowAutoStatus");
  });

  it("renders nothing for a session from another preset", () => {
    const html = renderToStaticMarkup(
      createElement(WorkflowModeCard, {
        t,
        execute: async () => ({ ok: true }),
        useProjection: () => ({ mode: "auto", active: false }),
      }),
    );
    expect(html).toBe("");
  });

  function renderCard(
    reasonings: Record<string, unknown>,
    settings?: () => unknown,
  ): string {
    return renderToStaticMarkup(
      createElement(WorkflowModeCard, {
        t,
        execute: async () => ({ ok: true }),
        settings,
        useProjection: (key: string) => reasonings[key],
      }),
    );
  }

  it("shows the effort the last request carried", () => {
    const html = renderCard({
      codingWorkflow: { mode: "auto", active: true },
      codingReasoning: { override: null, effort: "low", active: true },
    });
    expect(html).toContain("reasoningTitle");
    expect(html).toContain("Low");
    expect(html).toContain("reasoningSourceAuto");
  });

  it("shows a session override when the settings stay automatic", () => {
    const html = renderCard(
      {
        codingWorkflow: { mode: "auto", active: true },
        codingReasoning: { override: "max", effort: "low", active: true },
      },
      () => "auto",
    );
    expect(html).toContain("Max");
    expect(html).toContain("reasoningSourceOverride");
  });

  it("lets the settings pin win over a session override", () => {
    const html = renderCard(
      {
        codingWorkflow: { mode: "auto", active: true },
        codingReasoning: { override: "max", effort: "low", active: true },
      },
      () => "high",
    );
    expect(html).toContain("High");
    expect(html).toContain("reasoningSourceSettings");
  });

  it("shows a pending level before the first request", () => {
    const html = renderCard({
      codingWorkflow: { mode: "auto", active: true },
      codingReasoning: { override: null, effort: null, active: true },
    });
    expect(html).toContain("reasoningPending");
  });

  it("omits the reasoning line when the Host publishes no state", () => {
    const html = renderCard({
      codingWorkflow: { mode: "auto", active: true },
    });
    expect(html).toContain("workflowTitle");
    expect(html).not.toContain("reasoningTitle");
  });

  it("labels a chat-box pick as a session override", () => {
    const html = renderCard({
      codingWorkflow: { mode: "auto", active: true },
      codingReasoning: {
        override: null,
        userEffort: "medium",
        effort: "medium",
        active: true,
      },
    });
    expect(html).toContain("Medium");
    expect(html).toContain("reasoningSourceOverride");
  });

  it("renders the card with design-token classes instead of inline styles", () => {
    const html = renderCard({
      codingWorkflow: { mode: "auto", active: true },
      codingReasoning: { override: null, effort: "low", active: true },
    });
    expect(html).toContain('class="dsh-coding-card"');
    expect(html).toContain("dsh-coding-card-button");
    expect(html).not.toContain("style=");
  });
});

describe("workflow card stylesheet", () => {
  function fakeDocument(existing: unknown) {
    const appended: any[] = [];
    return {
      doc: {
        querySelector: () => existing,
        createElement: () => ({ dataset: {}, textContent: "" }),
        head: {
          appendChild: (element: unknown) => {
            appended.push(element);
          },
        },
      } as unknown as Document,
      appended,
    };
  }

  it("injects one tagged stylesheet built from Desktop tokens", () => {
    const { doc, appended } = fakeDocument(null);
    installCardStyles(doc);
    expect(appended).toHaveLength(1);
    expect(appended[0].dataset.plugin).toBe("dsh-plugin-codex-coding");
    expect(appended[0].dataset.pluginCss).toBe(
      "dsh-plugin-codex-coding/WorkflowCard.css",
    );
    expect(appended[0].textContent).toContain(".dsh-coding-card{");
    expect(appended[0].textContent).toContain("var(--dsw-alias-border-l1)");
    expect(appended[0].textContent).toContain("var(--dsw-radius-lg)");
    expect(appended[0].textContent).toContain("body[data-ds-dark-theme]");
  });

  it("skips injection when the marker is already present", () => {
    const { doc, appended } = fakeDocument({});
    installCardStyles(doc);
    expect(appended).toHaveLength(0);
  });
});
