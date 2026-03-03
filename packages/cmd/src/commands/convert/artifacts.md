# Artifact Handling in Convert Command

This document describes how the `convert` command processes and extracts artifact information from test reports (JUnit XML) to include in the generated Currents report.

## Artifact Discovery Mechanisms

The command supports two mechanisms for discovering artifacts associated with tests:
1.  **XML Properties**: Structured `<property>` elements within test cases.
2.  **Console Output**: Special marker strings in `<system-out>` logs.

### 1. XML Properties (Structured)

The command looks for properties within `<testcase>` elements with keys following the pattern:

`currents.artifact.{level}.{index}.{key} = {value}`

*   **level**: `attempt` | `test` | `spec`
*   **index**: Integer index (0, 1, 2...) - used to group properties for a single artifact.
*   **key**: `path` | `type` | `contentType` | `name`

**Supported Keys:**
-   `path`: Relative or absolute path to the artifact file.
-   `type`: The type of artifact (e.g., `screenshot`, `video`, `trace`, `coverage`, `attachment`, `stdout`).
-   `contentType`: The MIME type of the file (e.g., `image/png`, `video/mp4`).
-   `name`: Optional display name for the artifact.

**Example XML:**

```xml
<testcase classname="auth" name="login">
  <properties>
    <!-- Screenshot for the first attempt -->
    <property name="currents.artifact.attempt.0.path" value="screenshots/login-fail.png" />
    <property name="currents.artifact.attempt.0.type" value="screenshot" />
    <property name="currents.artifact.attempt.0.contentType" value="image/png" />
    
    <!-- Video for the first attempt -->
    <property name="currents.artifact.attempt.0.path" value="videos/login.mp4" />
    <property name="currents.artifact.attempt.0.type" value="video" />
    <property name="currents.artifact.attempt.0.contentType" value="video/mp4" />
  </properties>
  <failure message="Login failed" />
</testcase>
```

### 2. Console Output Markers (Universal Fallback)

The command scans standard output (`<system-out>`) for markers in the format:

`[[CURRENTS.ATTACHMENT|path|level]]`

*   **path**: Absolute or relative path to the artifact file.
*   **level** (Optional): `attempt` | `test` | `spec`. Defaults to `attempt`.

The CLI infers the artifact type and content type from the file extension.

**Example Output:**

```text
Starting test...
Error: Element not found
[[CURRENTS.ATTACHMENT|/app/test-results/screenshots/failure.png|attempt]]
[[CURRENTS.ATTACHMENT|/app/test-results/logs/metadata.json|test]]
Test failed.
```

## Artifact Processing Workflow

When artifacts are discovered, the `convert` command performs the following steps:

```mermaid
flowchart TD
    Start([Start: Process Test Result]) --> Sources{Check Sources}
    
    Sources -->|XML Properties| ParseProps[Parse 'currents.artifact.*']
    Sources -->|Console Logs| ParseLogs[Parse '[[CURRENTS.ATTACHMENT]]']
    
    ParseProps --> Extract[Extract Metadata]
    ParseLogs --> Infer[Infer Type from Extension] --> Extract

    Extract --> Validate{File Exists?}
    
    Validate -->|No| Skip[Skip & Log Debug]
    Validate -->|Yes| Hash[Generate Unique Hash]
    
    Hash --> Copy[Copy to .currents/artifacts/]
    Copy --> Update[Update Report JSON]
    Update --> End([End])
```

1.  **Discovery**: Parses XML properties and console logs to identify potential artifacts.
2.  **Validation**: Verifies that the referenced file exists at the specified path.
3.  **Copying**: Copies the valid artifact files to the `.currents/artifacts/` directory with a hashed filename to prevent collisions.
4.  **Reference**: Updates the generated report JSON to include the artifact metadata (path, type, contentType) linked to the corresponding test result or attempt.

**Note:** Artifacts with paths outside the workspace or that do not exist are skipped with a debug log.
