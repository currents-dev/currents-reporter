# Generic reporter artifact upload – client-side investigation

**Date:** 2026-02-13  
**Scope:** Client that uploads artifacts for generic (Jest) runs; server/director/API behavior is confirmed.

---

## Summary

Artifact **links and signing work**. The problem is **what gets uploaded**: the object stored at the artifact URL is plain text `"dummy screenshot content"` instead of the real file (e.g. PNG screenshot, MP4 video). Investigation should focus on the **client** that performs the PUT to the presigned `uploadUrl`.

---

## Context

- **Flow:** Generic reporter (e.g. currents-reporter for Jest) creates a run via director `POST /v1/runs`, receives `artifactUploadUrls[]` with `uploadUrl` and `readUrl` per artifact. The client must **PUT the file** to each `uploadUrl`. Later, the dashboard requests a signed URL from the API and loads the artifact (image/video) from R2.
- **Server side (this repo):** Director, artifact package, storage, and API signer were checked. Upload URL generation, read URL storage, and signing all use the same R2 config and domain. Logs confirm director and API use the same endpoint and bucket; signing uses R2 and the correct host.

---

## Observed behavior

- **Request:** GET to signed URL, e.g.  
  `https://currents-staging.e8d8fcf9734e9ea0a5c511fc6813faf3.r2.cloudflarestorage.com/6893758239b2717e8ea6496c/8e7f658269549490/test/lPiDn9hKGchS3jSs?X-Amz-...`
- **Response:** 200 OK.
- **Body:** Plain text `"dummy screenshot content"` instead of PNG (or other binary) image data.
- **Effect:** Dashboard shows broken image because the resource is text, not an image.

So the object at that key was **uploaded with that text content**. The client that did the PUT to the corresponding `uploadUrl` is the one that sent "dummy screenshot content".

---

## What the client must do (expected contract)

1. After creating a run, use the `artifactUploadUrls` (or equivalent) from the create-run response.
2. For each entry, **PUT the real artifact file** to `uploadUrl`:
   - Body: **binary file content** (screenshot PNG, video MP4, etc.), not a string like `"dummy screenshot content"`.
   - Headers: set `Content-Type` to the artifact’s type (e.g. `image/png`, `video/mp4`, `application/octet-stream` as appropriate).
3. Use the same artifact (same path / same file) that is declared in the run payload (e.g. in `instances[].artifacts` or `instances[].results.tests[].artifacts`).

---

## Where to look (client codebase)

- **Repo:** Likely `currents-dev/currents-reporter` or the repo that implements the generic/Jest reporter.
- **Search for:**
  - Usage of `uploadUrl` or `artifactUploadUrls` from the run-creation response.
  - The code that performs the HTTP PUT (or equivalent) to that URL.
  - Any place that sends **string or mock content** (e.g. "dummy screenshot content", "dummy", "placeholder") in the request body.
  - Test/mock implementations that might be used in local or Jest runs and that upload dummy content instead of real files.
- **Verify:**
  - That the body of the PUT is the **actual file buffer/stream** (e.g. from `fs.readFile` or the path reported in the artifact metadata).
  - That there is no branch (e.g. env flag, test mode) that substitutes dummy text for the real file when uploading.

---

## Useful references (server-side, this repo)

- Director generic run creation and artifact instructions:  
  `packages/director/src/genericAPI/artifacts.ts`  
  `packages/director/src/genericAPI/create.run.ts` (where `processArtifacts` is used).
- Artifact creation (returns `uploadUrl` and `readUrl`):  
  `packages/artifact/src/createArtifact.ts`,  
  `packages/artifact/src/handler.ts` (`createInstanceArtifactAndCache`).
- Run response shape (e.g. `artifactUploadUrls`) is defined by the API/director contract used by the client.

---

## Request for the client-side agent

1. Locate where the generic reporter (or client) **uploads** artifact files using the `uploadUrl` from the run-creation response.
2. Confirm whether the **body of that PUT** is the real file content or a placeholder string (e.g. "dummy screenshot content").
3. If it is placeholder/mock content, change it to upload the **actual artifact file** (correct path, binary body, correct `Content-Type`) and ensure no test/local path keeps uploading dummy content for these artifacts.
