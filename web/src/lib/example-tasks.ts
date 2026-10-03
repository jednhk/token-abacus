import type { RecentRun } from "./types";

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function task(
  task: string,
  model: string,
  tokens: number,
  cost: number,
  minutes: number,
  harness = "cursor",
  summary: string | null = null,
): RecentRun {
  return {
    task,
    summary,
    harness,
    primary_model: model,
    models: [{ model, total_tokens: tokens, cost_usd: cost }],
    total_tokens: tokens,
    cost_usd: cost,
    outcome: "success",
    duration_s: Math.round(minutes * 40),
    created_at: minutesAgo(minutes),
  };
}

export const promptTasks: RecentRun[] = [
  task(
    "Build a static tip calculator in a new folder. Vanilla HTML, CSS, and JavaScript only, no framework and no build step.",
    "claude-haiku-4-5",
    48_000,
    0.14,
    18,
    "cursor",
    `Build a static tip calculator in a new folder called tip-calculator. Vanilla HTML, CSS, and JavaScript only. No React, no npm, no build step. I want to open index.html and have it work.

The page needs a bill amount, tip choices of 10%, 15%, 20%, plus a custom percent field, and a split control for 1 to 8 people. Show the tip, the total, and the amount per person. Update as the person types. If the bill is empty or not a number, leave the results blank instead of showing NaN.

Keep it usable on a phone. Black text, white background, one column, labels above the fields. Don't add a logo, a gradient, or a second page. Round money to the nearest cent, and round the per-person amount so the parts still add up to the total.`,
  ),
  task(
    "Add Stripe Checkout for a single $29 product on the pricing page. Success and cancel URLs, and a webhook that marks the order paid.",
    "claude-sonnet-5-5",
    186_000,
    0.52,
    34,
    "cursor",
    `Add Stripe Checkout for one product, the $29 workshop seat, on the existing pricing page. Don't add a cart and don't take the card number on our site.

Use the price id already in the server env as STRIPE_PRICE_ID. The secret key is STRIPE_SECRET_KEY. Create the Checkout Session on the server, mode payment, quantity 1, then send the browser to the session URL. success_url should land on /thanks?session_id={CHECKOUT_SESSION_ID}. cancel_url should return to /pricing.

Also add a webhook at /api/stripe/webhook that checks the signature with STRIPE_WEBHOOK_SECRET and, on checkout.session.completed, writes the session id and the customer email to the orders table. If the signature is bad, return 400. Don't log the raw body.

Leave the rest of the pricing page alone. The button label stays "Reserve a seat".`,
  ),
  task(
    "Create a Next.js waitlist page. One email field, a thank-you state, and no account system.",
    "gpt-5",
    112_000,
    0.33,
    51,
    "cursor",
    `Create a waitlist page for an app called Fieldnote. Next.js App Router, one route at /. No auth, no database yet. Store emails by POSTing to /api/waitlist, which for now appends them to data/waitlist.json and rejects duplicates with a 409.

The page is a headline, one sentence, an email field, and a button that says "Join the list". After a successful submit, replace the form with "You're on the list. We'll write when the first build is ready." Don't redirect. If the email is invalid, show the error under the field and keep what they typed.

Use the fonts and the white page we already have in app/layout.tsx. No hero image, no feature grid, no footer links. Mobile first, the form should be full width under 640px.`,
  ),
  task(
    "The task list rerenders every row when one title changes. Fix that without changing the row design.",
    "claude-opus-5-5",
    440_000,
    1.12,
    76,
    "claude-code",
    `The task list in src/components/task-list.tsx rerenders every row when a single title changes. I can see it in React Scan: typing in the search box is fine, but editing one task title in the parent flashes all 50 rows.

Fix the rerender. Don't change the row markup, the cost column, or the pagination. The row component should only render again when its own task, cost, model, or token count changes. If the parent passes a new array each time, stabilize that with useMemo or pass the row what it needs so the others can bail out.

Leave the search filter behavior as it is. Add a short comment only if the reason isn't obvious from the code. Don't upgrade React and don't add a new state library.`,
  ),
  task(
    "Write a Python script that reads expenses.csv and prints a monthly total by category.",
    "claude-haiku-4-5",
    36_000,
    0.12,
    98,
    "cursor",
    `Write a Python script, expenses.py, that reads expenses.csv from the same folder and prints a monthly total by category.

Columns are date, category, amount, note. Dates are YYYY-MM-DD. Amounts are dollars and can be negative for refunds. The header row is present. Ignore blank lines. If a row has a bad date or a non-numeric amount, print it to stderr and skip it. Don't crash the whole file.

Output one block per month, oldest first, like:

2026-03
  groceries  184.20
  rent       2100.00
  total      2284.20

Categories alphabetically inside the month. Totals to two decimals. Standard library only, no pandas. Include a sample expenses.csv with about 15 rows so I can run python expenses.py and see the format.`,
  ),
  task(
    "After the session cookie expires, /app sends me to /login and /login sends me back. It loops.",
    "gpt-5",
    168_000,
    0.48,
    140,
    "codex",
    `Bug: after the session cookie expires, opening /app sends me to /login, and /login immediately sends me back to /app. The tab spins until the browser stops it.

Session check is in middleware.ts. The cookie name is abacus_session. /login is supposed to be public. Right now a stale cookie still counts as signed in, so the login page redirects to /app, and /app then rejects the expired token and sends me to /login again.

Fix the loop. An expired or unsigned cookie should be treated as signed out: clear it and stay on /login. A valid cookie on /login can still redirect to /app. Don't change the login form or the copy. Add a test that hits /app with an expired token and expects one redirect to /login, then a 200 from /login with no further redirect.`,
  ),
  task(
    "Turn the attached hero into a responsive section. Headline, one sentence, two buttons. No image.",
    "claude-sonnet-5-5",
    94_000,
    0.27,
    190,
    "cursor",
    `Turn the hero in the attached frame into a section I can drop into app/page.tsx. Headline, one supporting sentence, and two buttons. No photograph and no illustration.

Headline: "Meet Abacus, your token saver."
Sentence: "See the cost before you send it, then take the cheaper path."
Primary button: "Start", links to #workspace.
Secondary button: "Sign in", links to /login.

Desktop: the text is centered, the headline wraps to two lines, the buttons sit on one row with a small gap. Under 640px the buttons stack full width, primary first. Use the serif already loaded for the headline and the sans for everything else. Black text, white background, no card around the hero.

Match the spacing in the frame rather than inventing a new scale. Don't add a nav. The header is a separate component.`,
  ),
  task(
    "Add a GitHub Action that runs the test script on pull requests and posts a short summary comment.",
    "claude-haiku-4-5",
    62_000,
    0.18,
    260,
    "cursor",
    `Add a GitHub Action that runs on pull requests to main. It should install dependencies in web/, run npm test --prefix web, and post or update one comment on the pull request with the result.

The comment should be short. First line is "Tests passed" or "Tests failed". Then the last 30 lines of the test log inside a code block, not the whole log. If a comment from this action already exists, update it instead of adding another. Use the default GITHUB_TOKEN. Permissions: contents read, pull-requests write.

Cache npm by the lockfile in web/package-lock.json. Don't run on pushes to feature branches, only pull_request against main. Node 22. If the tests fail, the job should fail too, so the check goes red.`,
  ),
];

export const naturalTasks: RecentRun[] = [
  task("A calculator website", "claude-haiku-4-5", 22_000, 0.08, 12),
  task("A waitlist page for my app", "claude-sonnet-5-5", 140_000, 0.37, 28),
  task("Checkout for a $12 workshop", "claude-haiku-4-5", 90_000, 0.18, 44),
  task("A habit tracker I can open on my phone", "gpt-5", 120_000, 0.33, 63),
  task(
    "Fix the login so it stops looping",
    "claude-opus-5-5",
    380_000,
    0.86,
    88,
    "claude-code",
  ),
  task("A recipe box for weeknight meals", "claude-haiku-4-5", 36_000, 0.12, 110),
  task("An invoice I can send from my laptop", "gpt-5", 72_000, 0.21, 150, "codex"),
  task("A landing page for a weekend course", "claude-sonnet-5-5", 110_000, 0.29, 210),
];
