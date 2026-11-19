# Issue Tracker

Issues and specs live in **GitHub Issues** on `ngxccc/greenroots-farm`. Use the `gh` CLI, with heredocs for structured bodies and `--comments` when reading a ticket.

## Labels

**Lifecycle:** `status:blocked` (external dependency, credential, or upstream issue), `needs-split` (a bundle that must be split before implementation), `wontfix` (out of scope, superseded, or rejected). Everything else follows from the pull request or the project board.

**Type:** `type:epic`, `type:feat`, `type:fix`, `type:bug`, `type:refactor`, `type:perf`, `type:test`, `type:docs`, `type:chore`, `type:ci`, `type:style`, `type:task`.

**Area:** `area:api`, `area:storefront`, `area:backoffice`, `area:shared`, `area:ui`, `area:ci`, `area:docs`.

**Priority:** `priority:p0` (emergency), `priority:p1` (blocks a release), `priority:p2` (default). Dependency automation adds `dependencies`, `github_actions`, and `security`.

## Issue Body Contract

Every body uses these four H3 headings in this order:

```markdown
### Outcome

One verifiable result in domain language.

### Context

Epic, related issues, ADRs, standards, and the files or symbols involved.

### Acceptance Criteria

- [ ] Observable, testable statement, with the proving command when one exists.
- [ ] Generated contracts committed when a route or DTO surface changes.

### Non-goals

Boundaries that keep the issue from absorbing sibling work.
```

An issue that cannot name a single verifiable outcome is not ready; split it first.

## Atomicity

An issue is **atomic** with one outcome, one trust boundary, one transaction or contract, such that one reviewer can verify it without a second issue's diff. It is a **bundle** when any of these hold:

- It mutates and reads different resources with independent migrations or RBAC rules.
- It mixes a financial or auth mutation with a read-only projection.
- It spans more than one role matrix or aggregate.
- Its acceptance criteria cannot all pass or fail together.

| Situation                            | Action                                                              |
| :----------------------------------- | :------------------------------------------------------------------ |
| Bundle in the current milestone      | Split now; close the parent as `not planned` and link the children. |
| Bundle deferred to a later milestone | Apply `needs-split` and add it to the split register below.         |
| Issue already atomic                 | Leave it alone; do not split for symmetry.                          |

Do not split a deferred bundle whose downstream feature does not exist yet: its acceptance criteria would be speculative. Record it and split when the milestone opens.

## Split Procedure

1. Create one child per atomic outcome with the body contract and `type:*`, `area:*`, and `priority:*` labels. Titles follow `<type>(<area>): <summary>`.
2. Attach each child to the existing epic through native sub-issues. Do not add a second epic layer.
3. Close the parent with `--reason "not planned"` and a comment listing the children plus the reason for the split.
4. Drop `needs-split` from the parent and tick it off in the register.

## Split Register

The open `needs-split` issues are the only list of deferred batches. Query it at the start of planning and before starting any `needs-split` ticket:

```bash
gh issue list --state open --label needs-split --limit 100 \
  --json number,title --jq '.[] | "#\(.number) \(.title)"'
```

- Do not copy the list into ADRs, standards, or chat.
- A pull request that resolves a `needs-split` issue splits it first and resolves the children.
- When a milestone opens, drain its `needs-split` issues before neighbouring work.
- The tracking issue closes only when the register is empty.

Pick the next split by the first rule that applies:

1. **The bundle in front of you** — about to implement a `needs-split` issue: split that one, while its context is loaded.
2. **The open milestone** — the lowest-numbered `needs-split` issue in the epic whose milestone is open.
3. **The batch order** — the checklist in the tracking issue.
4. **Nothing applies** — leave the register alone.

## Epics

- Title: `epic(<area>): <summary>`, label `type:epic`. An epic is a container, not a commit, so it carries no Conventional Commits body and no work-type label. `<area>` in the title is a domain scope, not an `area:*` label.
- Epics carry exactly the `area:*` labels of their children, updated in the same edit that introduces a new area.
- Every implementation issue belongs to exactly one epic through native sub-issues. An epic closes when all of its sub-issues close.
- A split parent closes as `not planned`; the epic stays open and owns the children.

## Triage Vocabulary

The `triage` skill is not installed here. Until it is, these labels are the manual vocabulary:

| Role              | Repo label                     |
| :---------------- | :----------------------------- |
| `needs-triage`    | open issue with no extra label |
| `needs-info`      | `status:blocked`               |
| `ready-for-agent` | `type:*` + `area:*`            |
| `ready-for-human` | `priority:p0` / `priority:p1`  |
| `wontfix`         | `wontfix`                      |

## Issue Forms

`.github/ISSUE_TEMPLATE/` provides `feature_request.yml` (feature, architectural change, RFC), `bug_report.yml` (reproducible defect), and `task.yml` (task, chore, refactor, docs, dependency). `config.yml` disables free-form issues. All templates require an `area:*` selection; the bug and feature templates apply `type:fix` and `type:feat`, and the task template applies `type:task` while the author picks the precise type.

## Native Sub-Issues and Dependencies

```bash
# Create the child, then link it to the parent.
gh issue create --title "<type>(<area>): <title>" --body "..." --label "<labels>"
CHILD_ID=$(gh api repos/ngxccc/greenroots-farm/issues/<child_number> --jq .id)
gh api --method POST repos/ngxccc/greenroots-farm/issues/<parent_number>/sub_issues \
  -F sub_issue_id=$CHILD_ID

# Read the children.
gh api repos/ngxccc/greenroots-farm/issues/<parent_number>/sub_issues \
  --jq '.[] | "#\(.number): \(.title)"'

# Block a ticket on another issue; it unblocks when the blocker closes.
gh api --method POST \
  repos/ngxccc/greenroots-farm/issues/<child_number>/dependencies/blocked_by \
  -F issue_id=<blocker_database_id>
```

Labels used by automation must exist before the workflow runs (`gh label create`). Workflow ownership and the labeler rules live in `ci-and-release.md`.
