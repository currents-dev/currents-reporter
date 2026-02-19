# Generic Reporter Artifact Upload – Implementation Report

**Purpose:** Handoff document for implementing the **client-side** artifact upload feature. The **backend (Currents)** changes are done; this report describes the API contract and behavior so another agent or developer can implement the feature in the client project (e.g. Jest reporter, JUnit→Currents converter, CLI).

---

## 1. Backend (Currents) – What Was Implemented

The following was added or changed in the Currents repo. No need to re-implement this on the server; it is for context only.

### 1.1 Schema (packages/lib)

- **Artifact reference** (client sends this in the create-run payload):
  - `path` (string, required) – Client-side path or key to the file.
  - `type` (required) – One of: `screenshot` | `video` | `trace` | `coverage` | `attachment` | `stdout`.
  - `contentType` (string, required) – MIME type (e.g. `image/png`, `video/mp4`).
  - `name` (string, optional) – Display name in dashboard.
  - `metadata` (object with `type: string`, optional).

- **Artifact levels** – Same shape above; level is determined by **where** it appears in the payload:
  - **Spec-level:** `instances[].artifacts[]` (whole spec run, e.g. coverage).
  - **Test-level:** `instances[].results.tests[].artifacts[]` (all attempts of one test).
  - **Attempt-level:** `instances[].results.tests[].attempts[].artifacts[]` (one attempt, e.g. failure screenshot).

- **Response type** – Each artifact ref yields one upload instruction:
  - `artifactId`, `path`, `uploadUrl`, `readUrl`.

### 1.2 API Response (packages/common)

- `CreateRunResponse` now has an optional field:
  - `artifactUploadUrls?: ArtifactUploadInstruction[]`
- Only present when the create-run request included at least one artifact reference. Not an empty array when there are no artifacts; the key may be absent.

### 1.3 Director (packages/director)

- On `POST /runs` (generic run creation), if the body contains any artifact refs (at any level):
  - For each ref, the server generates a signed S3/R2 upload URL and caches metadata.
  - The response includes `artifactUploadUrls` with one entry per ref (same order and `path` as in the request).
  - A delayed job syncs artifact metadata to the DB so artifacts show in the dashboard after uploads complete.

### 1.4 Client-Facing Docs (Currents repo)

- `docs/generic-reporter-artifacts-client-guide.md` – Full client integration guide (request/response/upload, examples, checklist).

---

## 2. API Contract for the Client

**Endpoint:** `POST /runs` (generic run creation; same as today).  
**Auth / headers:** Unchanged (e.g. API key, `Content-Type: application/json`).

### 2.1 Request Body Additions

The existing generic run payload is unchanged except for **optional** `artifacts` arrays. All new fields are optional; omit them to keep current behavior.

**Spec-level (per instance):**

```json
{
  "instances": [
    {
      "groupId": "...",
      "spec": "path/to/spec.js",
      "artifacts": [
        {
          "path": "./coverage/spec.coverage.json",
          "type": "coverage",
          "contentType": "application/json",
          "name": "Optional display name"
        }
      ],
      "results": { "stats": { ... }, "tests": [ ... ] }
    }
  ]
}
```

**Test-level (per test):**

```json
{
  "instances": [
    {
      "groupId": "...",
      "spec": "...",
      "results": {
        "tests": [
          {
            "testId": "...",
            "title": [ "..." ],
            "artifacts": [
              {
                "path": "./metadata/test-config.json",
                "type": "attachment",
                "contentType": "application/json"
              }
            ],
            "attempts": [ ... ]
          }
        ]
      }
    }
  ]
}
```

**Attempt-level (per attempt):**

```json
{
  "instances": [
    {
      "groupId": "...",
      "spec": "...",
      "results": {
        "tests": [
          {
            "testId": "...",
            "title": [ "..." ],
            "attempts": [
              {
                "attempt": 0,
                "status": "failed",
                "duration": 1234,
                "artifacts": [
                  {
                    "path": "./screenshots/fail-attempt-0.png",
                    "type": "screenshot",
                    "contentType": "image/png",
                    "name": "Failure screenshot"
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  ]
}
```

**Artifact reference object (repeated):**

| Field         | Required | Type   | Description |
|---------------|----------|--------|-------------|
| `path`        | Yes      | string | Client path/key used to find the file. Must match the same string in the response for upload. |
| `type`        | Yes      | string | One of: `screenshot`, `video`, `trace`, `coverage`, `attachment`, `stdout`. |
| `contentType` | Yes      | string | MIME type of the file (e.g. `image/png`, `video/mp4`, `application/json`). |
| `name`        | No       | string | Display name in dashboard. |
| `metadata`    | No       | object | Optional, e.g. `{ "type": "custom" }`. |

### 2.2 Response Body Additions

When at least one artifact reference is sent, the JSON response includes:

```json
{
  "runId": "...",
  "runUrl": "...",
  "isNewRun": true,
  "artifactUploadUrls": [
    {
      "artifactId": "unique-id",
      "path": "./screenshots/fail-attempt-0.png",
      "uploadUrl": "https://... (signed PUT URL)",
      "readUrl": "https://... (signed read URL)"
    }
  ]
}
```

- **`artifactUploadUrls`** – Array of upload instructions. Order and `path` values correspond to the artifact refs in the request (flattened by level: spec → test → attempt).
- **`path`** – Same value as in the request; client uses this to **match which file to upload**.
- **`uploadUrl`** – Client must **PUT the file here** (see below). Time-limited (e.g. ~15 minutes).
- **`readUrl`** – For dashboard display only; client does not upload to this.

If **no** artifact refs were sent, **`artifactUploadUrls` is absent** (do not assume it exists or is `[]`).

### 2.3 Upload Step (Client Responsibility)

After a successful `POST /runs`:

1. If `artifactUploadUrls` is missing or has length 0, do nothing.
2. For each element in `artifactUploadUrls`:
   - Resolve the file using **`path`** (the same path/key you sent in the request).
   - **PUT** the file body to **`uploadUrl`**.
   - Set header **`Content-Type`** to the MIME type you sent for that artifact (e.g. `image/png`).
3. Do not block or fail run creation if an upload fails; log and optionally retry.

**Important:** Match files to response entries by **`path`** only. Do not use `artifactId` to locate the file.

---

## 3. Client Implementation Checklist

Hand this to the agent implementing the client:

- [ ] **Request building**
  - Add optional `artifacts` arrays where needed:
    - `instances[i].artifacts` (spec-level)
    - `instances[i].results.tests[j].artifacts` (test-level)
    - `instances[i].results.tests[j].attempts[k].artifacts` (attempt-level)
  - Each artifact has at least: `path`, `type`, `contentType`; optionally `name`, `metadata`.
  - Store or derive a mapping from `path` → actual file (path on disk, buffer, or stream) for the upload step.

- [ ] **Response handling**
  - After `POST /runs`, read `response.artifactUploadUrls`.
  - If absent or empty, skip uploads.

- [ ] **Upload loop**
  - For each `entry` in `artifactUploadUrls`:
    - Resolve file by `entry.path`.
    - `PUT entry.uploadUrl` with body = file contents and `Content-Type` = the contentType for that artifact.
  - Handle errors (e.g. log, retry) without failing the overall run.

- [ ] **Types / content types**
  - Use `type` and `contentType` consistently (e.g. screenshots → `screenshot` + `image/png` or `image/jpeg`; videos → `video` + `video/mp4` or `video/webm`).

---

## 4. Example Client Flow (Pseudocode)

```text
1. Build run payload (tests, instances, etc.) as today.
2. For each file to attach (e.g. failure screenshot):
   - Add { path, type, contentType, name? } to the right level (attempt/test/spec).
   - Remember path → local file path (or buffer) for later.
3. response = POST /runs with payload.
4. If response.artifactUploadUrls is missing or empty → done.
5. For each entry in response.artifactUploadUrls:
   - file = resolveFile(entry.path)   // your path → file
   - PUT entry.uploadUrl, body: file, header: Content-Type: <contentType for this path>
6. Done. Artifacts will appear in dashboard after uploads (and backend sync).
```

---

## 5. References in Currents Repo

- **Client guide (detailed):** `docs/generic-reporter-artifacts-client-guide.md`
- **Schema (reference):** `packages/lib/src/validation/artifact.ts` (`ArtifactReferenceSchema`), `packages/lib/src/validation/run/generic.ts` (where `artifacts` are added).
- **Response type:** `packages/common/src/run/types.ts` (`ArtifactUploadInstruction`, `CreateRunResponse.artifactUploadUrls`).
- **Server processing:** `packages/director/src/genericAPI/artifacts.ts`, `packages/director/src/genericAPI/create.run.ts`.

---

## 6. Summary for the Other Agent

**Goal:** Implement artifact upload in the **client** that uses the generic run API.

**What the server already does:** Accepts optional `artifacts` arrays at three levels (spec/test/attempt) in `POST /runs` and returns `artifactUploadUrls` with signed `uploadUrl` and matching `path`. Client must **PUT** each file to its `uploadUrl` with the correct `Content-Type`, using `path` to know which file to upload. No other API calls or auth are required for uploads; the create-run response is sufficient.

**What the client must do:** (1) Add artifact refs to the create-run payload when there are files to attach. (2) After create-run, if `artifactUploadUrls` is present, upload each file by `path` to `uploadUrl` via PUT with the right Content-Type. (3) Do not fail the run if an upload fails; log and optionally retry.

Use this report plus `docs/generic-reporter-artifacts-client-guide.md` for full request/response shapes, examples, and checklist.
