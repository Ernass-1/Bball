#!/usr/bin/env bash
#
# ai_issue_handler.sh
#
# Orchestrates: issue -> Aider (Gemini) -> branch -> pull request.
# Called by .github/workflows/ai-issue-to-pr.yml with one of three stages:
#
#   prepare  - create the working branch and write the Aider prompt file
#   run      - invoke Aider against the Gemini model
#   finish   - push the branch (if changes exist) and open a PR, or
#              comment on the issue if nothing changed / something failed
#
# State is threaded between stages via $GITHUB_ENV (so later steps in the
# same job can see it) and a couple of files under /tmp.

set -euo pipefail

PROMPT_FILE="/tmp/aider_prompt.md"
LOG_FILE="/tmp/aider_output.log"
STAGE="${1:-}"

# ---------------------------------------------------------------------------
# Small helper: post a comment on the triggering issue. Used both for the
# happy path (link to the new PR) and for failure/no-op paths so the person
# who filed the issue always hears back from the bot.
# ---------------------------------------------------------------------------
comment_on_issue() {
  local body="$1"
  if [[ -n "${ISSUE_NUMBER:-}" ]]; then
    gh issue comment "${ISSUE_NUMBER}" --repo "${REPO}" --body "${body}" || true
  fi
}

# ---------------------------------------------------------------------------
# Stage: prepare
# ---------------------------------------------------------------------------
stage_prepare() {
  : "${ISSUE_NUMBER:?ISSUE_NUMBER not set}"
  : "${ISSUE_TITLE:?ISSUE_TITLE not set}"

  # ISSUE_BODY can legitimately be empty (issue with only a title), so don't
  # hard-require it — just default to a placeholder.
  local body="${ISSUE_BODY:-"(no description provided)"}"

  local branch="ai/issue-${ISSUE_NUMBER}"

  # If this branch already exists locally/remotely (e.g. the label was
  # toggled off and back on), start clean from the current default branch
  # rather than layering on top of a stale attempt.
  git fetch origin --prune
  local default_branch
  default_branch="$(git symbolic-ref --short refs/remotes/origin/HEAD | sed 's@^origin/@@')"
  git checkout -B "${branch}" "origin/${default_branch}"

  # Record the starting commit so the "run" stage can tell whether Aider
  # actually changed anything.
  local base_sha
  base_sha="$(git rev-parse HEAD)"

  {
    echo "BRANCH_NAME=${branch}"
    echo "BASE_SHA=${base_sha}"
  } >> "${GITHUB_ENV}"

  # Build the brief we hand to Aider. Keeping this in a file (rather than a
  # CLI argument) avoids shell-escaping headaches with arbitrary issue text
  # and lets us pass it with --message-file.
  cat > "${PROMPT_FILE}" <<EOF
You are working autonomously in this repository to resolve GitHub issue #${ISSUE_NUMBER}.

Issue title:
${ISSUE_TITLE}

Issue description:
${body}

Instructions:
- Implement a complete, working solution for what the issue describes.
- Follow the existing code style, structure, and conventions already used in this repository.
- Add or update tests if the repository has a test suite and the change warrants it.
- Update relevant documentation (README, docstrings, comments) if the change affects usage.
- Do not modify CI/CD workflow files (anything under .github/workflows/) unless the issue explicitly asks for that.
- Keep the change focused and minimal — solve this issue, don't refactor unrelated code.
- If the issue is too vague to implement safely, make the most reasonable, narrowly-scoped interpretation rather than guessing wildly.
EOF

  echo "Prepared branch '${branch}' and prompt file for issue #${ISSUE_NUMBER}."
}

# ---------------------------------------------------------------------------
# Stage: run
# ---------------------------------------------------------------------------
stage_run() {
  : "${GEMINI_API_KEY:?GEMINI_API_KEY secret is not set}"
  local model="${AIDER_MODEL:-gemini/gemini-3.1-pro-preview}"

  echo "Running Aider with model: ${model}"

  # --yes-always      : never block on interactive confirmations (e.g. when
  #                      Aider wants to touch a file it doesn't already have
  #                      open — expected, since we don't pre-select files).
  # --message-file     : the brief built in stage_prepare.
  # --no-check-update  : skip Aider's own "new version available" network
  #                      check, which just wastes time in CI.
  # --no-analytics      : don't phone home usage analytics from a CI runner.
  set +e
  aider \
    --model "${model}" \
    --message-file "${PROMPT_FILE}" \
    --yes-always \
    --no-check-update \
    --no-analytics \
    2>&1 | tee "${LOG_FILE}"
  local aider_exit=${PIPESTATUS[0]}
  set -e

  if [[ ${aider_exit} -ne 0 ]]; then
    echo "AIDER_FAILED=1" >> "${GITHUB_ENV}"
    echo "Aider exited with status ${aider_exit}."
    # Don't hard-fail the step here — let stage_finish decide what to tell
    # the user, so the workflow always ends with a clear comment instead of
    # just a red X with no explanation.
  fi

  local head_sha
  head_sha="$(git rev-parse HEAD)"
  if [[ "${head_sha}" == "${BASE_SHA}" ]]; then
    echo "HAS_CHANGES=0" >> "${GITHUB_ENV}"
  else
    echo "HAS_CHANGES=1" >> "${GITHUB_ENV}"
  fi
}

# ---------------------------------------------------------------------------
# Stage: finish
# ---------------------------------------------------------------------------
stage_finish() {
  : "${ISSUE_NUMBER:?ISSUE_NUMBER not set}"
  : "${REPO:?REPO not set}"

  local log_tail=""
  if [[ -f "${LOG_FILE}" ]]; then
    log_tail="$(tail -n 60 "${LOG_FILE}")"
  fi

  if [[ "${AIDER_FAILED:-0}" == "1" ]]; then
    comment_on_issue "$(cat <<EOF
🤖 I tried to work on this issue automatically but Aider hit an error before finishing. Here's the tail of the log:

\`\`\`
${log_tail}
\`\`\`

You may need to refine the issue description or check the Gemini API key/quota, then re-add the \`ai-task\` label to retry.
EOF
)"
    echo "Aider failed; posted a comment on issue #${ISSUE_NUMBER}. Not opening a PR."
    exit 0
  fi

  if [[ "${HAS_CHANGES:-0}" == "0" ]]; then
    comment_on_issue "🤖 I looked at this issue but didn't make any code changes — either I couldn't find a safe, concrete change to make, or the request needs more detail. Feel free to add more context and re-apply the \`ai-task\` label to try again."
    echo "No changes produced by Aider. Not opening a PR."
    exit 0
  fi

  echo "Pushing branch ${BRANCH_NAME}..."
  git push --force-with-lease origin "${BRANCH_NAME}"

  local issue_title
  issue_title="$(gh issue view "${ISSUE_NUMBER}" --repo "${REPO}" --json title --jq .title)"

  local pr_body
  pr_body="$(cat <<EOF
This pull request was generated automatically by Aider (using Gemini) in response to issue #${ISSUE_NUMBER}.

Closes #${ISSUE_NUMBER}

---

### Summary of what the AI did
\`\`\`
$(tail -n 80 "${LOG_FILE}" 2>/dev/null || echo "(no log captured)")
\`\`\`

**Please review this diff carefully before merging** — it was written without a human in the loop.
EOF
)"

  # Reuse an existing open PR for this branch if one is already there
  # (relevant when the label gets toggled off/on more than once).
  local existing_pr
  existing_pr="$(gh pr list --repo "${REPO}" --head "${BRANCH_NAME}" --state open --json number --jq '.[0].number // empty')"

  if [[ -n "${existing_pr}" ]]; then
    gh pr edit "${existing_pr}" --repo "${REPO}" --body "${pr_body}"
    comment_on_issue "🤖 Updated the existing pull request: #${existing_pr}"
    echo "Updated existing PR #${existing_pr}."
  else
    local default_branch
    default_branch="$(gh repo view "${REPO}" --json defaultBranchRef --jq .defaultBranchRef.name)"

    local pr_url=""
    set +e
    pr_url="$(gh pr create \
      --repo "${REPO}" \
      --base "${default_branch}" \
      --head "${BRANCH_NAME}" \
      --title "Fix #${ISSUE_NUMBER}: ${issue_title}" \
      --body "${pr_body}" \
      --label "ai-generated" 2>/tmp/pr_create_err.log)"
    local create_status=$?
    set -e

    if [[ ${create_status} -ne 0 ]]; then
      # Most common cause: the "ai-generated" label doesn't exist in this
      # repo yet. Retry once without it rather than losing the whole PR.
      echo "First PR creation attempt failed (label missing?), retrying without --label:"
      cat /tmp/pr_create_err.log || true
      pr_url="$(gh pr create \
        --repo "${REPO}" \
        --base "${default_branch}" \
        --head "${BRANCH_NAME}" \
        --title "Fix #${ISSUE_NUMBER}: ${issue_title}" \
        --body "${pr_body}")"
    fi

    comment_on_issue "🤖 Opened a pull request with a proposed fix: ${pr_url}"
    echo "Opened PR: ${pr_url}"
  fi
}

case "${STAGE}" in
  prepare) stage_prepare ;;
  run)     stage_run ;;
  finish)  stage_finish ;;
  *)
    echo "Usage: $0 {prepare|run|finish}" >&2
    exit 1
    ;;
esac
