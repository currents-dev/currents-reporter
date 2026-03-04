# Artifact Handling in Convert Command

This document describes how the `convert` command processes and extracts artifact information from test reports (JUnit XML) to include in the generated Currents report.

## Artifact Discovery Mechanisms

The command discovers artifacts associated with tests using **XML Properties** within test cases.

### XML Properties (Structured)

The command looks for properties within `<testcase>` or `<testsuite>` elements with keys following specific patterns.

#### 1. Test Level Artifacts
`currents.artifact.test.{property} = {value}`

*   **Location**: Inside `<testcase>` element.
*   **Properties**: `path`, `type`, `contentType`, `name`.

#### 2. Attempt Level Artifacts
`currents.artifact.attempt.{property} = {value}`

*   **Location**: Inside `<testcase>` element.
*   **Behavior**:
    *   If `<attempts>` structure exists: Look for properties inside each `<attempt>` element.
    *   If no `<attempts>` structure: Assign artifacts to attempt 0.
*   **Properties**: `path`, `type`, `contentType`, `name`.

#### 3. Instance Level Artifacts
`currents.artifact.instance.{property} = {value}`

*   **Location**: Inside `<testsuite>` element.
*   **Properties**: `path`, `type`, `contentType`, `name`.

**Supported Properties:**
-   `path`: Relative or absolute path to the artifact file.
-   `type`: The type of artifact (e.g., `screenshot`, `video`, `trace`, `coverage`, `attachment`, `stdout`).
-   `contentType`: The MIME type of the file (e.g., `image/png`, `video/mp4`).
-   `name`: Optional display name for the artifact.

**Example XML:**

```xml
<testsuite name="auth">
  <properties>
    <!-- Instance level artifact -->
    <property name="currents.artifact.instance.path" value="spec-trace.zip" />
    <property name="currents.artifact.instance.type" value="trace" />
    <property name="currents.artifact.instance.contentType" value="application/zip" />
  </properties>

  <testcase classname="auth" name="login">
    <properties>
      <!-- Test level artifact -->
      <property name="currents.artifact.test.path" value="screenshots/login-fail.png" />
      <property name="currents.artifact.test.type" value="screenshot" />
      <property name="currents.artifact.test.contentType" value="image/png" />
      
      <!-- Attempt level artifact (assigned to attempt 0 if no attempts structure) -->
      <property name="currents.artifact.attempt.path" value="videos/login.mp4" />
      <property name="currents.artifact.attempt.type" value="video" />
      <property name="currents.artifact.attempt.contentType" value="video/mp4" />
    </properties>
    <failure message="Login failed" />
  </testcase>
</testsuite>
```

## Artifact Processing Workflow

When artifacts are discovered, the `convert` command performs the following steps:

```mermaid
flowchart TD
    Start([Start: Process Test Result]) --> ParseProps[Parse XML Properties]
    
    ParseProps --> Extract[Extract Metadata]

    Extract --> Validate{File Exists?}
    
    Validate -->|No| Skip[Skip & Log Debug]
    Validate -->|Yes| Hash[Generate Unique Hash]
    
    Hash --> Copy[Copy to .currents/artifacts/]
    Copy --> Update[Update Report JSON]
    Update --> End([End])
```

1.  **Discovery**: Parses XML properties to identify potential artifacts.
2.  **Validation**: Verifies that the referenced file exists at the specified path.
3.  **Copying**: Copies the valid artifact files to the `.currents/artifacts/` directory with a hashed filename to prevent collisions.
4.  **Reference**: Updates the generated report JSON to include the artifact metadata (path, type, contentType) linked to the corresponding test result or attempt.

**Note:** Artifacts with paths outside the workspace or that do not exist are skipped with a debug log.
