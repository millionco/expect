import type { eventWithTime } from "@rrweb/types";
import type { ViewerRunState } from "@/types";

const BASE_TIMESTAMP = 1700000000000;

export const FIXTURE_EVENTS: eventWithTime[] = [
  {
    type: 4,
    data: { href: "https://example.com", width: 1280, height: 720 },
    timestamp: BASE_TIMESTAMP,
  },
  {
    type: 2,
    data: {
      node: {
        type: 0,
        childNodes: [
          {
            type: 1,
            name: "html",
            publicId: "",
            systemId: "",
            id: 1,
          },
          {
            type: 2,
            tagName: "html",
            attributes: { lang: "en" },
            childNodes: [
              {
                type: 2,
                tagName: "head",
                attributes: {},
                childNodes: [
                  {
                    type: 2,
                    tagName: "title",
                    attributes: {},
                    childNodes: [{ type: 3, textContent: "Example App", id: 5 }],
                    id: 4,
                  },
                  {
                    type: 2,
                    tagName: "style",
                    attributes: {},
                    childNodes: [
                      {
                        type: 3,
                        textContent:
                          "body { margin: 0; font-family: system-ui, sans-serif; background: #f5f5f5; } " +
                          ".container { max-width: 600px; margin: 40px auto; padding: 24px; } " +
                          "h1 { color: #1a1a1a; margin-bottom: 16px; } " +
                          "p { color: #555; line-height: 1.6; } " +
                          ".btn { display: inline-block; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin-top: 12px; } " +
                          ".btn:hover { background: #1d4ed8; } " +
                          ".card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 16px; } " +
                          ".input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; margin-bottom: 12px; box-sizing: border-box; }",
                        id: 7,
                      },
                    ],
                    id: 6,
                  },
                ],
                id: 3,
              },
              {
                type: 2,
                tagName: "body",
                attributes: {},
                childNodes: [
                  {
                    type: 2,
                    tagName: "div",
                    attributes: { class: "container" },
                    childNodes: [
                      {
                        type: 2,
                        tagName: "div",
                        attributes: { class: "card" },
                        childNodes: [
                          {
                            type: 2,
                            tagName: "h1",
                            attributes: {},
                            childNodes: [{ type: 3, textContent: "Welcome Back", id: 12 }],
                            id: 11,
                          },
                          {
                            type: 2,
                            tagName: "p",
                            attributes: {},
                            childNodes: [
                              {
                                type: 3,
                                textContent: "Sign in to your account to continue.",
                                id: 14,
                              },
                            ],
                            id: 13,
                          },
                          {
                            type: 2,
                            tagName: "input",
                            attributes: {
                              class: "input",
                              type: "email",
                              placeholder: "Email address",
                            },
                            childNodes: [],
                            id: 15,
                          },
                          {
                            type: 2,
                            tagName: "input",
                            attributes: {
                              class: "input",
                              type: "password",
                              placeholder: "Password",
                            },
                            childNodes: [],
                            id: 16,
                          },
                          {
                            type: 2,
                            tagName: "button",
                            attributes: { class: "btn" },
                            childNodes: [{ type: 3, textContent: "Sign In", id: 18 }],
                            id: 17,
                          },
                        ],
                        id: 10,
                      },
                    ],
                    id: 9,
                  },
                ],
                id: 8,
              },
            ],
            id: 2,
          },
        ],
        id: 0,
      },
      initialOffset: { left: 0, top: 0 },
    },
    timestamp: BASE_TIMESTAMP + 100,
  },
  {
    type: 3,
    data: { source: 5, id: 15, text: "user@example.com" },
    timestamp: BASE_TIMESTAMP + 2000,
  },
  {
    type: 3,
    data: { source: 5, id: 16, text: "••••••••" },
    timestamp: BASE_TIMESTAMP + 4000,
  },
  {
    type: 3,
    data: { source: 2, type: 2, id: 17, x: 80, y: 0 },
    timestamp: BASE_TIMESTAMP + 5500,
  },
  {
    type: 3,
    data: {
      source: 0,
      texts: [],
      attributes: [],
      removes: [],
      adds: [
        {
          parentId: 10,
          nextId: undefined,
          node: {
            type: 2,
            tagName: "p",
            attributes: { style: "color: #16a34a; margin-top: 16px; font-weight: 500;" },
            childNodes: [{ type: 3, textContent: "Login successful! Redirecting...", id: 20 }],
            id: 19,
          },
        },
      ],
    },
    timestamp: BASE_TIMESTAMP + 6500,
  },
] as unknown as eventWithTime[];

export const FIXTURE_STEP_STATE: ViewerRunState = {
  title: "Login Flow Test",
  status: "passed",
  summary: "All 3 steps passed in 6.5s",
  steps: [
    { stepId: "step-1", title: "Navigate to login page", status: "passed", summary: "200 OK" },
    {
      stepId: "step-2",
      title: "Fill in credentials and submit",
      status: "passed",
      summary: "Form submitted",
    },
    {
      stepId: "step-3",
      title: "Verify login success message",
      status: "passed",
      summary: 'Found "Login successful"',
    },
  ],
};
