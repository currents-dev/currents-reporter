# Artifact Handling in Upload Command

This document describes how the `upload` command processes and uploads artifacts to the Currents dashboard.

## Overview

The `upload` command is responsible for sending test results and associated artifacts to the Currents cloud service. It handles artifacts by:

1.  **Extracting Metadata**: Reading artifact details from the generated `InstanceReport` files.
2.  **Requesting Upload URLs**: Sending metadata to the Director service to obtain pre-signed upload URLs.
3.  **Uploading Files**: Reading files from the local `.currents` directory and uploading them to the provided URLs.

## Artifact Processing Workflow

```mermaid
flowchart TD
    Start([Start Upload]) --> ReadReports[Read Instance Reports]
    ReadReports --> Batch[Batch Instances]
    
    Batch --> CreateRun[POST /v1/runs]
    note right of CreateRun: Sends artifact metadata\n(path, size, contentType)
    
    CreateRun --> Response{Receive Response}
    Response -->|Instructions| UploadLoop[Process Upload Instructions]
    
    UploadLoop --> ReadFile[Read Local File]
    ReadFile --> GetType[Resolve Content-Type]
    GetType --> PutS3[PUT to Pre-signed URL]
    
    PutS3 --> CheckTimeout{Timeout?}
    CheckTimeout -->|Yes| FailUpload[Log Warning & Continue]
    CheckTimeout -->|No| Success[Upload Complete]
    
    Success --> Next{More Instructions?}
    FailUpload --> Next
    
    Next -->|Yes| UploadLoop
    Next -->|No| Finish([Finish Batch])
```

### 1. Metadata Extraction

The command reads `InstanceReport` JSON files from `.currents/instances/`. It aggregates all artifacts associated with:
*   **Specs**: Top-level spec artifacts.
*   **Tests**: Artifacts attached to specific tests.
*   **Attempts**: Artifacts attached to specific attempts (retries).

It builds a map of `file_path -> content_type` to ensure the correct MIME type is set during upload.

### 2. Requesting Upload URLs

The command sends batches of `InstanceReport`s to the Director service via `POST /v1/runs`. The payload includes the artifact metadata.

The service responds with a list of `ArtifactUploadInstruction` objects, which contain:
*   `path`: The relative path of the artifact (e.g., `artifacts/hash-screenshot.png`).
*   `uploadUrl`: A pre-signed S3 URL for uploading the file.

### 3. Uploading Files

The command iterates through the received instructions:

1.  **Locate File**: Resolves the full path using the report directory (e.g., `.currents/artifacts/hash-screenshot.png`).
2.  **Verify Existence**: Checks if the file exists locally; logs a warning if missing.
3.  **Set Content-Type**: Retrieves the `contentType` from the metadata map created in step 1 (defaulting to `application/octet-stream`).
4.  **Upload**: Performs a `PUT` request to the `uploadUrl` with the file content and the specified `Content-Type` header.
    *   **Timeout**: The upload request has a configured timeout (default: 30 seconds) to prevent hanging processes.
