# Mobile Web / Mini Program Closed-Loop Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the confirmed role-based mobile experience to the mini program while making question reporting, owner handling, and operations reminders safe and traceable.

**Architecture:** The Java service owns question creation and mutation authorization. The mobile Web preview and mini program consume the same pending-question and operations data, but expose role-specific navigation. Legacy mini-program management routes remain registered but are removed from the personal-page entry surface.

**Tech Stack:** Spring Boot 3 / JdbcTemplate / JUnit 5; Taro React / TypeScript / SCSS; Next.js mobile preview / TypeScript.

## Global Constraints

- Do not modify the PC preview, the production environment, Mini Program AppID, LAN address, Word-import behavior, or existing business data.
- Do not change global `CurrentUser.isAdmin()` to include `operator`.
- Do not write problem submissions directly to formal knowledge tables, chunks, standard answers, or experience-review candidates.
- Preserve all existing uncommitted mini-program and Java changes that are outside the files named below.
- Verification must not click any UI that writes real business data.
- Do not create Git commits in the current dirty worktrees.

---

### Task 1: Secure the pending-question service contract

**Files:**
- Modify: `/Users/wangkai/store-ai-server/src/main/java/com/storeai/risk/controller/PendingQuestionController.java`
- Modify: `/Users/wangkai/store-ai-server/src/main/java/com/storeai/risk/service/PendingQuestionService.java`
- Modify: `/Users/wangkai/store-ai-server/src/main/java/com/storeai/common/util/CurrentUser.java`
- Modify: `/Users/wangkai/store-ai-server/src/main/java/com/storeai/admin/service/OperationsMonitoringService.java`
- Create: `/Users/wangkai/store-ai-server/src/test/java/com/storeai/risk/service/PendingQuestionServiceTest.java`

**Interfaces:**
- Consumes: authenticated `CurrentUser` and `pending_questions` rows scoped by `store_id`.
- Produces: `POST /api/pending-questions` accepting `{ question }`, with a non-owner write rule; scoped mutation guards for assign/ack/resolve/escalate.

- [x] **Step 1: Write failing service tests**

```java
@Test
void createRejectsOwnerAndBlankOrTooLongQuestion() { /* assert BizException */ }

@Test
void createStoresCurrentStoreAndEmployeeWithoutKnowledgeWrites() { /* capture jdbc.update arguments */ }

@Test
void mutationRequiresAdminOrAssignedEmployee() { /* assert unassigned employee is forbidden */ }
```

- [x] **Step 2: Run the focused test class and confirm it fails before implementation**

Run: `cd /Users/wangkai/store-ai-server && ./mvnw -Dtest=PendingQuestionServiceTest test`

Expected: compilation or assertion failure because the creation and authorization methods do not exist.

- [x] **Step 3: Add the creation endpoint and service method**

```java
@PostMapping
public ApiResponse<Map<String, Object>> create(@RequestBody CreateRequest req) {
    return ApiResponse.ok(pendingQuestionService.create(req.question()));
}

public record CreateRequest(String question) {}
```

The service must trim input, require 2–2000 characters, reject `owner`, insert only a `pending_questions` row for `cur.storeId()` and `cur.employeeId()`, set `status` to `pending`, and return the inserted row.

- [x] **Step 4: Replace store-only mutation validation with action authorization**

```java
private Map<String, Object> requireActionable(String id) {
    Map<String, Object> row = getByIdInCurrentStore(id);
    if (!cur.isAdmin() && !cur.employeeId().equals(String.valueOf(row.get("assigned_to")))) {
        throw BizException.forbidden("只有负责人或管理者可以处理该问题");
    }
    return row;
}
```

Use `cur.isAdmin()` for full-store question management. Use the helper before `ack`, `resolve`, and `escalate`; require `cur.isAdmin()` for `assign`.

- [x] **Step 5: Add an operations-specific role helper and use it only for operations overview**

```java
public boolean canViewOperations() {
    return Set.of("owner", "manager", "admin", "operator").contains(role());
}
```

`OperationsMonitoringService.overview()` must call `cur.canViewOperations()` instead of `cur.isAdmin()`; no other service receives an operator privilege expansion.

- [x] **Step 6: Run focused and full Java verification**

Run: `cd /Users/wangkai/store-ai-server && ./mvnw -Dtest=PendingQuestionServiceTest test && ./mvnw test && ./mvnw -DskipTests compile`

Expected: all tests and compile pass.

### Task 2: Build the mini-program role-based personal and submission flows

**Files:**
- Modify: `/Users/wangkai/store-ai-miniprogram/src/app.config.ts`
- Modify: `/Users/wangkai/store-ai-miniprogram/src/pages/me/index.tsx`
- Modify: `/Users/wangkai/store-ai-miniprogram/src/pages/me/index.scss`
- Create: `/Users/wangkai/store-ai-miniprogram/src/pages/submit/index.tsx`
- Create: `/Users/wangkai/store-ai-miniprogram/src/pages/submit/index.scss`
- Create: `/Users/wangkai/store-ai-miniprogram/src/pages/submit/index.config.ts`
- Modify: `/Users/wangkai/store-ai-miniprogram/src/utils/api.ts`
- Modify: `/Users/wangkai/store-ai-miniprogram/src/pages/admin/inspect/index.tsx`

**Interfaces:**
- Consumes: `auth.UserInfo.role`, `taskApi.list()`, `pendingQuestionApi.list()/create()`, and `adminApi.operationsOverview()`.
- Produces: role-specific “我的” page, a standalone question form, and an operator-readable “经营提醒” page.

- [x] **Step 1: Register the submission page and extend the pending-question client**

```ts
create: (question: string) =>
  request<any>('/api/pending-questions', { method: 'POST', body: { question } }),
```

Add `pages/submit/index` to `app.config.ts`; do not change existing import or LAN-address sections in `api.ts` and `constants.ts`.

- [x] **Step 2: Add the standalone submission page**

The page must redirect an owner to `/pages/me/index`, choose `上报问题` for `manager/admin/operator` and `提交问题` for other staff, require nonblank text, call `pendingQuestionApi.create`, show a readable success/error toast, and return to the personal page only after a successful write.

- [x] **Step 3: Replace the mini-program “我的” shortcut grid with the confirmed role matrix**

```ts
const MANAGEMENT_ROLES = new Set(['owner', 'manager', 'admin', 'operator'])
const ESCALATION_ROLES = new Set(['manager', 'admin', 'operator'])
```

Remove duplicate AI-coach/meeting cards and legacy management/data-switch cards. Load each required count independently. Owner “待我处理” reads only active `pending`/`assigned`/`handling` questions and navigates to `/pages/admin/question/index`; management roles retain task-based “待我处理”; all management roles render the operations-reminder card.

- [x] **Step 4: Narrow the old inspect page into the mobile operating-reminder destination**

Rename its title and visible copy from “巡店监控” to “经营提醒”, allow `operator` into its view guard, load only the operations overview needed for reminders, and render failed, empty, and actionable states without treating a failed request as zero risk.

- [x] **Step 5: Run mini-program verification**

Run: `cd /Users/wangkai/store-ai-miniprogram && npm run typecheck && npm run build:weapp`

Expected: both commands pass and `dist/` contains the registered submit page.

### Task 3: Bring the mobile Web preview to the same closed-loop behavior

**Files:**
- Modify: `/Users/wangkai/store-ai-assistant-mobile-preview/lib/api-client.ts`
- Modify: `/Users/wangkai/store-ai-assistant-mobile-preview/app/me/page.tsx`
- Modify: `/Users/wangkai/store-ai-assistant-mobile-preview/app/admin/pending/page.tsx`
- Modify: `/Users/wangkai/store-ai-assistant-mobile-preview/lib/actions.ts`

**Interfaces:**
- Consumes: Java `GET/POST /api/pending-questions`, current JWT role, `homeApi.overview()`, and `operationsApi.overview()`.
- Produces: an owner “待我处理” count and destination that match the same pending-question queue used by the mini program.

- [x] **Step 1: Add a read-only pending-question API method**

```ts
export const pendingQuestionApi = {
  list: () => request<any[]>('/api/pending-questions'),
}
```

- [x] **Step 2: Make owner decision cards read the correct source**

For `owner`, load pending questions alongside operations, count only `pending`, `assigned`, and `handling`, and link “待我处理” to the existing `/admin/pending` review route. For manager/admin/operator, retain the existing task count and `/tasks?from=me` destination. Do not reintroduce task submission or legacy management cards for owners.

- [x] **Step 3: Verify the preview build**

Run: `cd /Users/wangkai/store-ai-assistant-mobile-preview && npm run typecheck && npm run build`

Expected: both commands pass.

### Task 4: Final regression review

**Files:**
- Modify: `/Users/wangkai/store-ai-miniprogram/docs/superpowers/plans/2026-08-22-mobile-web-mini-program-closed-loop-sync.md` to mark completed checks.

- [x] **Step 1: Compare final diffs against the protected local changes**

Run:

```bash
git -C /Users/wangkai/store-ai-miniprogram diff -- project.config.json src/pages/admin/customers/index.tsx src/utils/constants.ts
git -C /Users/wangkai/store-ai-server diff --stat
```

Expected: no intentional changes outside the plan’s files; existing Word-import, AppID and LAN-address edits remain intact.

- [x] **Step 2: Perform read-only browser route checks after builds**

Check without submitting forms: mobile preview `/me`, `/submit`, `/admin/pending`; PC-independent mini-program output only through compile artifacts.

- [x] **Step 3: Record verification results in the plan**

Mark only the commands and route checks that actually passed. State that no real business-writing form was clicked during verification.

## Verification record — 2026-08-22

- Java: `./mvnw -Dtest=PendingQuestionServiceTest test` (4 tests), `./mvnw test` (19 tests), and `./mvnw -DskipTests compile` all passed.
- Mini program: `npm run typecheck` and `npm run build:weapp` passed; `dist/pages/submit/index.wxml` and `dist/pages/submit/index.js` were generated.
- Mobile Web preview: `npm run typecheck` and `npm run build` passed.
- Read-only route checks: the live preview on port `3102` returned `307` for `/me`, `/submit`, and `/admin/pending` when unauthenticated, confirming the expected login guard. No page form or other business-writing control was used.
- Regression notes: existing local AppID, Word/Excel/CSV import selector, and LAN backend address changes remain untouched. No Git commit or production deployment was performed.
