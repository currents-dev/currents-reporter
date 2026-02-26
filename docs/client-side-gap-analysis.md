# Client-Side Artifact Implementation: Plan vs. Reality Gap Analysis

This document compares the implemented client-side artifact support in `@currents/jest` and `@currents/cmd` against the original design specifications outlined in the documentation.

## Summary

| Feature | Plan (Docs) | Implementation (Current State) | Status |
| :--- | :--- | :--- | :--- |
| **Artifact Levels** | Support **Spec**, **Test**, and **Attempt** levels. | Only **Attempt-level** is fully implemented. | ⚠️ Partial |
| **Discovery Mechanism** | Parse custom **JUnit XML properties** (e.g., `currents.artifact.path`). | Parses **Console Logs** for markers (`[[ATTACHMENT|path]]`). | ⚠️ Changed |
| **Log Handling** | Separate `stdout` and `stderr` artifacts. | Merged into a single `stdout` artifact with `[stderr]` prefixes. | ✅ Improved |
| **File Types** | Screenshots, Videos, Traces, Coverage. | Screenshots, Videos, Logs. | ✅ Mostly Complete |

---

## Detailed Gaps

### 1. Missing Artifact Levels

**Plan:**
The documentation (`generic-reporter-artifact-levels.md`) explicitly defines three levels:
*   **Spec-level**: Attached to the entire spec file (e.g., coverage reports, full execution logs).
*   **Test-level**: Attached to a test case across all attempts (e.g., metadata, shared config).
*   **Attempt-level**: Unique to each retry (e.g., failure screenshots).

**Implementation:**
*   **@currents/jest**: The `prepareArtifacts` and `createAttemptArtifacts` functions only process artifacts within the context of a specific test attempt. There is no logic to attach artifacts to the `InstanceReport` (spec level) or `Test` (test case level).
*   **@currents/cmd (convert)**: The loop in `handleConvert` iterates through `test.attempts` to extract artifacts. Spec-level and Test-level scopes are bypassed.

**Impact:** Users cannot attach file-level reports like coverage or shared test metadata.

### 2. Divergent Discovery Strategy

**Plan:**
The design (`generic-reporter-artifact-summary.md`) proposed using standard JUnit XML properties:
```xml
<testcase>
  <properties>
    <property name="currents.artifact.0.path" value="/path/to/screenshot.png"/>
    <property name="currents.artifact.0.type" value="screenshot"/>
  </properties>
</testcase>
```

**Implementation:**
The implementation relies on parsing console output for a specific marker pattern:
```text
[[ATTACHMENT|/path/to/screenshot.png]]
```
This logic is hardcoded in `extractAttachmentsFromLog` (`packages/cmd/src/services/convert/index.ts`) and `parseAttachmentLogs` (`packages/jest/src/artifacts.ts`).

**Impact:**
*   **Pros:** Simpler for users who can just `console.log` from their tests without needing a specialized JUnit reporter configuration.
*   **Cons:** Less structured; relies on string parsing which can be fragile. Does not support the explicit metadata (type, content-type) that the XML property approach offered.

### 3. Log merging strategy

**Plan:**
Implicitly suggested separate handling or preservation of `stdout` and `stderr` streams as distinct artifacts.

**Implementation:**
The implementation actively **merges** `stdout` and `stderr` into a single file artifact (`type: 'stdout'`). `stderr` lines are prefixed with `[stderr]`.

**Impact:**
*   **Positive:** Simplifies the upload process (one file vs. two) and aligns with the backend's "single console blob" expectation.
*   **Negative:** Original stream separation is lost in the raw artifact, though the prefix preserves semantic distinction.

## Recommendations

1.  **Implement Spec-Level Support**: Add a mechanism (e.g., a specific console log marker like `[[SPEC_ARTIFACT|path]]` or a configuration option) to attach files to the root `InstanceReport`.
2.  **Support XML Properties**: For the `convert` command, add support for the planned JUnit XML properties. This provides a cleaner integration for tools that can generate structured XML but cannot easily inject console logs.
3.  **Update Documentation**: Reflect the "Console Marker" approach in the official docs, as it is the current de-facto standard for this reporter.
