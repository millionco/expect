import { useEffect, useState } from "react";

const CONTAINER_ID = "__expect_agent_overlay__";

interface ExpectRuntime {
  initAgentOverlay: (containerId: string) => void;
  destroyAgentOverlay: (containerId: string) => void;
  showAgentOverlay: (containerId: string) => void;
  hideAgentOverlay: (containerId: string) => void;
  updateCursor: (
    containerId: string,
    x: number,
    y: number,
    label: string,
    selector?: string,
  ) => void;
  highlightRefs: (containerId: string, selectors: string[]) => void;
  clearHighlights: (containerId: string) => void;
  logAction: (containerId: string, description: string, code: string) => void;
  cssSelector: (element: Element) => string;
}

declare global {
  interface Window {
    __EXPECT_RUNTIME__?: ExpectRuntime;
  }
}

const loadRuntime = async (): Promise<boolean> => {
  try {
    const response = await fetch("/runtime.js");
    if (!response.ok) return false;
    const code = await response.text();
    const script = document.createElement("script");
    script.textContent = code;
    document.head.appendChild(script);
    return Boolean(window.__EXPECT_RUNTIME__);
  } catch {
    return false;
  }
};

const rt = () => window.__EXPECT_RUNTIME__;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let cursorX = 400;
let cursorY = 300;

const moveTo = async (
  targetX: number,
  targetY: number,
  durationMs: number,
  label: string,
  selector?: string,
) => {
  cursorX = targetX;
  cursorY = targetY;
  rt()?.updateCursor(CONTAINER_ID, targetX, targetY, label, selector);
  await sleep(durationMs);
};

const DUMMY_LABELS = [
  'click("Sign In")',
  'fill("Email", "alex@example.com")',
  'click("Dashboard")',
  'assertText("Welcome back")',
  'click("Settings")',
  "screenshot()",
  'click("Save Changes")',
  'assertVisible(".success-toast")',
  'click("Profile")',
  'fill("Name", "Alex Rivera")',
  'click("Update")',
  'navigate("/logout")',
];

const clickElement = async (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const targetX = rect.x + rect.width / 2;
  const targetY = rect.y + rect.height / 2;

  rt()?.highlightRefs(CONTAINER_ID, [selector]);
  await moveTo(targetX, targetY, 600, `click("${selector}")`, selector);
  rt()?.logAction(CONTAINER_ID, `Click ${selector}`, `page.click('${selector}')`);
  await sleep(300);
  rt()?.clearHighlights(CONTAINER_ID);
};

const typeInto = async (selector: string, text: string) => {
  const element = document.querySelector(selector) as HTMLInputElement | undefined;
  if (!element) return;
  const rect = element.getBoundingClientRect();
  const targetX = rect.x + rect.width / 2;
  const targetY = rect.y + rect.height / 2;

  rt()?.highlightRefs(CONTAINER_ID, [selector]);
  await moveTo(targetX, targetY, 600, `fill("${selector}")`, selector);
  await sleep(200);

  for (let charIndex = 0; charIndex < text.length; charIndex++) {
    element.value = text.slice(0, charIndex + 1);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    rt()?.updateCursor(
      CONTAINER_ID,
      targetX,
      targetY,
      `typing "${text.slice(0, charIndex + 1)}"`,
      selector,
    );
    await sleep(60 + Math.random() * 40);
  }

  rt()?.logAction(CONTAINER_ID, `Fill ${selector}`, `page.fill('${selector}', '${text}')`);
  await sleep(300);
  rt()?.clearHighlights(CONTAINER_ID);
};

const inspectElement = async (selector: string) => {
  const element = document.querySelector(selector);
  if (!element) return;
  const rect = element.getBoundingClientRect();

  rt()?.highlightRefs(CONTAINER_ID, [selector]);
  await moveTo(rect.x + rect.width / 2, rect.y + 30, 600, `inspecting ${selector}`, selector);
  rt()?.logAction(CONTAINER_ID, `Inspect ${selector}`, `page.locator('${selector}').screenshot()`);
  await sleep(600);
  rt()?.clearHighlights(CONTAINER_ID);
};

const SCENARIOS: Record<string, () => Promise<void>> = {
  "Login flow": async () => {
    await typeInto("#email", "alex@example.com");
    await sleep(400);
    await clickElement(".primary");
    await sleep(500);
    await clickElement("#card-nav a:nth-child(1)");
  },
  "Browse navigation": async () => {
    await clickElement("#card-nav a:nth-child(1)");
    await sleep(300);
    await clickElement("#card-nav a:nth-child(2)");
    await sleep(300);
    await clickElement("#card-nav a:nth-child(3)");
  },
  "Fill and submit": async () => {
    await typeInto("#email", "test@expect.dev");
    await sleep(300);
    await clickElement(".primary");
    await sleep(400);
    await clickElement("#card-content button");
  },
  "Scan the page": async () => {
    for (const selector of ["#card-login", "#card-nav", "#card-content", "#card-table"]) {
      await inspectElement(selector);
    }
  },
};

export const App = () => {
  const [loaded, setLoaded] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [running, setRunning] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [labelIndex, setLabelIndex] = useState(0);

  useEffect(() => {
    loadRuntime().then((success) => {
      setLoaded(success);
      if (success) {
        setTimeout(() => {
          rt()?.initAgentOverlay(CONTAINER_ID);
          rt()?.showAgentOverlay(CONTAINER_ID);
          rt()?.updateCursor(CONTAINER_ID, 400, 300, "Ready");
          cursorX = 400;
          cursorY = 300;
          setInitialized(true);
          setInteractive(true);
        }, 500);
      }
    });
  }, []);

  const init = () => {
    rt()?.initAgentOverlay(CONTAINER_ID);
    rt()?.showAgentOverlay(CONTAINER_ID);
    rt()?.updateCursor(CONTAINER_ID, 400, 300, "Ready");
    cursorX = 400;
    cursorY = 300;
    setInitialized(true);
  };

  const destroy = () => {
    rt()?.destroyAgentOverlay(CONTAINER_ID);
    setInitialized(false);
    setInteractive(false);
  };

  const runScenario = async (name: string) => {
    if (running) return;
    if (!initialized) init();
    setInteractive(false);
    setRunning(true);
    await sleep(300);
    await SCENARIOS[name]?.();
    setRunning(false);
  };

  const toggleInteractive = () => {
    if (!initialized) init();
    setInteractive((previous) => !previous);
    setLabelIndex(0);
  };

  useEffect(() => {
    if (!interactive) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest(".controls-sidebar")) return;
      if (target.closest(`#${CONTAINER_ID}`)) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = target.getBoundingClientRect();
      const targetX = rect.x + rect.width / 2;
      const targetY = rect.y + rect.height / 2;

      const label = DUMMY_LABELS[labelIndex % DUMMY_LABELS.length];
      const selector = rt()?.cssSelector(target) ?? target.tagName.toLowerCase();

      rt()?.highlightRefs(CONTAINER_ID, [selector]);
      cursorX = targetX;
      cursorY = targetY;
      rt()?.updateCursor(CONTAINER_ID, targetX, targetY, label, selector);
      rt()?.logAction(CONTAINER_ID, label, `page.click('${selector}')`);

      setLabelIndex((previous) => previous + 1);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [interactive, labelIndex]);

  return (
    <div className="flex min-h-screen">
      <div className="controls-sidebar w-72 bg-gray-900 text-white p-5 flex flex-col gap-4 fixed top-0 left-0 h-screen overflow-y-auto z-[999999]">
        <h2 className="text-lg font-bold text-gray-300">Overlay Harness</h2>
        <div className={`text-sm ${loaded ? "text-green-400" : "text-red-400"}`}>
          Runtime: {loaded ? "loaded ✓" : "not found ✗"}
        </div>

        <Section title="Lifecycle">
          <Btn onClick={init} disabled={!loaded || initialized}>
            Init + Show
          </Btn>
          <Btn onClick={destroy} disabled={!initialized}>
            Destroy
          </Btn>
        </Section>

        <Section title="Interactive">
          <Btn onClick={toggleInteractive} disabled={!loaded || running} active={interactive}>
            {interactive ? "✓ Click Mode ON" : "Click Mode"}
          </Btn>
          {interactive && (
            <div className="text-xs text-gray-400 mt-1">
              Click any element on the page. The cursor will move to it with a dummy action label.
            </div>
          )}
        </Section>

        <Section title="Scenarios">
          {Object.keys(SCENARIOS).map((name) => (
            <Btn
              key={name}
              onClick={() => runScenario(name)}
              disabled={!loaded || running || interactive}
            >
              {running ? "Running..." : name}
            </Btn>
          ))}
        </Section>

        {running && (
          <div className="text-xs text-yellow-400 animate-pulse">▶ Scenario running...</div>
        )}
      </div>

      <div className="ml-72 flex-1 p-10">
        <h1 className="text-3xl font-bold mb-2">Sample Page</h1>
        <p className="text-gray-500 mb-8">
          {interactive
            ? "Click mode is on — click any element and the cursor will move to it."
            : "Click a scenario on the left, or enable Click Mode to control the cursor manually."}
        </p>

        <div
          id="card-login"
          className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-4"
        >
          <h3 className="text-lg font-semibold mb-3">Login Form</h3>
          <div className="flex gap-2">
            <input
              id="email"
              type="email"
              placeholder="Email address"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm flex-1"
            />
            <button className="primary bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-600">
              Sign In
            </button>
          </div>
        </div>

        <div
          id="card-nav"
          className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-4"
        >
          <h3 className="text-lg font-semibold mb-3">Navigation</h3>
          <div className="flex gap-4">
            <a href="#" className="text-blue-500 hover:underline">
              Dashboard
            </a>
            <a href="#" className="text-blue-500 hover:underline">
              Settings
            </a>
            <a href="#" className="text-blue-500 hover:underline">
              Profile
            </a>
          </div>
        </div>

        <div
          id="card-content"
          className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-4"
        >
          <h3 className="text-lg font-semibold mb-3">Content</h3>
          <p className="text-gray-600 mb-3">
            Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </p>
          <button className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800">
            Take Action
          </button>
        </div>

        <div
          id="card-table"
          className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm mb-4"
        >
          <h3 className="text-lg font-semibold mb-3">Table</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Status</th>
                <th className="text-left py-2">Role</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-2">Alex Rivera</td>
                <td className="py-2 text-green-600">Active</td>
                <td className="py-2">Admin</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2">Sam Chen</td>
                <td className="py-2 text-green-600">Active</td>
                <td className="py-2">Editor</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-2">Jordan Lee</td>
                <td className="py-2 text-gray-400">Inactive</td>
                <td className="py-2">Viewer</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <div className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">{title}</div>
    <div className="flex flex-col gap-1.5">{children}</div>
  </div>
);

const Btn = ({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  active?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`border text-white px-3 py-1.5 rounded-md text-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed text-left ${
      active
        ? "bg-blue-600 border-blue-500 hover:bg-blue-500"
        : "bg-gray-700 border-gray-600 hover:bg-gray-600"
    }`}
  >
    {children}
  </button>
);
