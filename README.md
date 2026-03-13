## 3/13 notes

### Testing the browser CLI

```bash
# from repo root
pnpm install --no-frozen-lockfile
cd packages/browser && pnpm build && cd ../..
cd packages/browser-tester-cli && pnpm build && cd ../..

# snapshot a page
bun packages/browser-tester-cli/dist/cli.js snapshot example.com

# interactive only + JSON
bun packages/browser-tester-cli/dist/cli.js snapshot example.com -i --json

# click a ref and see what changed
bun packages/browser-tester-cli/dist/cli.js click example.com e2 --diff

# annotated screenshot (numbered labels on elements)
bun packages/browser-tester-cli/dist/cli.js screenshot example.com /tmp/page.png --annotate

# record a video
bun packages/browser-tester-cli/dist/cli.js click example.com e2 --video /tmp/recording.webm

# run browser package tests
cd packages/browser && pnpm test
```

### Using with Claude Code

Tell Claude Code to use the CLI for browser testing:

```
Use browser-tester-cli to test the page. The CLI is at packages/browser-tester-cli/dist/cli.js.

Core workflow:
1. bun packages/browser-tester-cli/dist/cli.js snapshot <url> -i --json
2. Pick refs from the snapshot (e.g. e1, e2)
3. bun packages/browser-tester-cli/dist/cli.js click <url> <ref> --diff
4. Re-snapshot after page changes

Other commands: fill, type, select, hover, screenshot (--annotate), diff, --video
```

### 3/12 notes

**P0**: GET USERS

- little league football vs. NFL
  - football = https://en.wikipedia.org/wiki/American_football
  - little league teams have different problems than NFL teams, and thus must solve different problems
  - ~= to Cursor solving very long bg agents - this is an area every "NFL" agent and model lab is going to fight
    - as a little league team don't solve problems of NFL teams - pick fights you can win
  - there's an unspoken rule that every 6-18 months a company must raise a round to signal success.
    - if no VC round = no money, company dies
    - if no metrics (lots of users, revenue) = no round
    - if no successful product = no metrics
    - if no team focus = no successful product
- the point: as a company, our singular focus is to solve our users problem, not to solve irrelevant problems that may be hyper-relevant to the NBA teams

**P1**: TRUST YOUR TEAM

- in a well functioning, successful team, everyone knows what they are doing
  - in the most successful football teams (whether little league or NFL), the _most_ important thing is to rely on whatother teammates are doing
    - quarterback initates the ball
    - linebackers do defense
    - linemen just block the attackers
  - IF trust exists, each member must have clear boundaries on what they trust each other to do, and defer each other to do
    - flip side: you as a team member need to pull your weight to prove that you are worthy of that trust
- team:
  - Aiden: how to acquire users?
  - Nisarg: how to retain users?
  - Ben: how to ship a world class design?
  - Rasmus: how do we ship robust software, fast?

- how to avoid shit shovelling:
  - create markdown files or references for code
  - build systems to review (automations to review issues in new code that is introduced)
  - how do we introduce sane guardrails or scanning to proactively fix tech debt?
  - https://x.com/thdxr/status/2031377117007454421
    - how do we choose our product battles right (avoid dopaminemaxxing and shipping bad code)
    - actor/critic issue - person shipping code is incentivized to ship - not thinking as deep about
      code quality speed only maters, critic needs to take overhead over these
    - scoping + seeding

---

1. testing is the new frontier

- coderabbit, greptile, bugbot - look at the code, algo, knowledge base
- spur, momentic - b2b ai test companies
- testing ripe for disruption, review bots are enough
- line b/w codegen -(xyz)> ship
- review bots exists but they are not good
- co mission is to solve coding -> solve long horizon coding tasks
  - the area that is hardest and least care for model + agent labs to solve is deep testing

2. good testing requires insights

- every business has different values
- diff - how are review bots different from agent testing

3. diff between good and great testing is not(tech, price) but outcome for the end company

- for ecommerce it might be revenue -> user churn -> web performance (LCP/INP)
- for a SaaS it might be INP or dev velocity without increasing user churn
- great testing is mostly not a model or technology problem
- this is the problem with the current crop of "AI testing tools" like Momentic, Spur
  - big distance. currently require lots of fwd deployed engineers OR agent driven, a wide gap in thoroughlyness

---

the car:

PostHog, Sentry, Slack, Discord, GitHub, Twitter -> Simulated users (n) -> Insights -> Test insights

- use simulated users as verification

---

the skateboard:

- CLI that does test your current changes / issues / branch for regressions or potential next step usage
- browser recordings
- reuse
- abiltiy to add in Github Actions
- testie / tests / repair.dev
