# Changelog

## [2.0.1](https://github.com/currents-dev/currents-reporter/compare/%40currents%2Fcmd-v2.0.0...%40currents%2Fcmd-v2.0.1) (2026-10-06)

`@currents/cmd` no longer installs Jest, which removes about 250 packages and all moderate `npm audit` findings from the install. To upload `@currents/jest` results, `currents run upload` runs the Jest installed in the current folder to list every test of the suite. That needs Jest 29.5 or later in that folder; without it, the upload fails with a message that names the install command. Uploads of Detox runs that are not sharded or filtered, and all other commands, do not need Jest.

### Bug Fixes

* **cmd:** load Jest from the project instead of shipping it ([909ae4b](https://github.com/currents-dev/currents-reporter/commit/909ae4b3f83f7bd985ed4b10e77fe740b9f5ed22))
* **cmd:** load jest-cli through the project's jest, and need Jest 29.5 ([5c33cd7](https://github.com/currents-dev/currents-reporter/commit/5c33cd74dbe266647f70913c55699867b05e7201))
* **cmd:** run the Jest that `npx jest` runs in the upload folder ([71132a2](https://github.com/currents-dev/currents-reporter/commit/71132a26c410d1d772f890fb5003519cd27ade76))
* update axios, vitest and lockfile packages with security fixes ([b00ce45](https://github.com/currents-dev/currents-reporter/commit/b00ce453b1a3172330afb83ffcbcc533b704a79a))

## [2.0.0](https://github.com/currents-dev/currents-reporter/compare/%40currents%2Fcmd-v1.11.0...%40currents%2Fcmd-v2.0.0) (2026-10-06)

### ⚠ BREAKING CHANGES

* **cmd:** `currents api get-run` is replaced by `currents run get`.
  `currents api get-run` still works, with the same options, environment
  variables and exit codes, but is not listed in the help.
* **cmd:** `currents api` takes a REST API path and no longer prints
  the run commands' help. `currents api get-run` still works as a hidden
  command with the same options as `currents run get`.
* **cmd:** `currents cancel` is deprecated in favor of
  `currents run cancel`. It still works, with the same options, environment
  variables and exit codes, until the next major version.
* **cmd:** `currents convert` is not listed in the root help. Use
  `currents run upload --input-format ...` to convert and upload in one
  command. `currents convert` still works, with the same options and exit codes.
* **cmd:** `currents upload` is replaced by `currents run upload`.
  `currents upload` still works, with the same options, environment variables
  and exit codes, but is not listed in the help.
* **cmd:** `upload` is no longer the default command. Change
  `currents ...` to `currents upload ...` in scripts and CI jobs.
* **cmd:** Command-line options now override environment variables.
* **cmd:** Node 20 or later is required.
* **cmd:** run upload --input-format and convert fail when
  --output-dir or --report-dir names a folder that is not empty.

### Features

* **cmd:** add the skill command ([26961b7](https://github.com/currents-dev/currents-reporter/commit/26961b764b989cd9743d50c13144f0d7f4563c8e))
* **cmd:** API client and upload for sessions and run attachments ([adcf3d3](https://github.com/currents-dev/currents-reporter/commit/adcf3d3276dad16eceb5d7517766f5679dd2ace3))
* **cmd:** convert reports in run upload and hide convert ([83ea3b6](https://github.com/currents-dev/currents-reporter/commit/83ea3b6d193d0bfe718386d17569dcf8fc79746a))
* **cmd:** currents session and currents run attach ([52fab58](https://github.com/currents-dev/currents-reporter/commit/52fab587c784b5e07f029f60207d088024e6efc6))
* **cmd:** find and pack the files to attach ([55d9e0e](https://github.com/currents-dev/currents-reporter/commit/55d9e0e5bcd5832221df34f9747e639713adc16b))
* **cmd:** group the commands in the root help ([437ef65](https://github.com/currents-dev/currents-reporter/commit/437ef65f5aa03eb7e0caec423a3efa5b7ad4689c))
* **cmd:** list one line per command in the root help ([821a46c](https://github.com/currents-dev/currents-reporter/commit/821a46c3d635a97ea6450ab885124db27bdf4704))
* **cmd:** make currents api a request command for any REST API route ([dafa03a](https://github.com/currents-dev/currents-reporter/commit/dafa03a0d0058853d27f7621d60105ddc62d45d9))
* **cmd:** move api get-run to run get ([3244b11](https://github.com/currents-dev/currents-reporter/commit/3244b1168cc18a1b36ce99f7b029a05786e57ae9))
* **cmd:** move cancel under run ([457b495](https://github.com/currents-dev/currents-reporter/commit/457b495a890ec670b5892da6d684935016cf8411))
* **cmd:** move upload under run ([947a31c](https://github.com/currents-dev/currents-reporter/commit/947a31c6e15a57cfe07f1356706745d2b79cb3a9))
* **cmd:** show an example of each common command in the root help ([d7393e5](https://github.com/currents-dev/currents-reporter/commit/d7393e5693dbb1c2385797a4312889796ba8bea2))
* **cmd:** show an example of each run command in run --help ([ce3bc70](https://github.com/currents-dev/currents-reporter/commit/ce3bc709b5306e3f115e0b73e074988e948118b6))
* **cmd:** stop running upload when no command is given ([d51013e](https://github.com/currents-dev/currents-reporter/commit/d51013eacfc08bb2895c0ac097560272ef3949f2))
* **cmd:** warn when the default cache ID will be random ([6c64cf3](https://github.com/currents-dev/currents-reporter/commit/6c64cf3c97a0de0a1582201a1bd98ea803d3f06a))

### Bug Fixes

* refresh brace-expansion to the patched releases on every major ([2d1fd31](https://github.com/currents-dev/currents-reporter/commit/2d1fd31b1b55b3c4bfbb0e7813e29145385a51a0))
* **cmd:** a saved session without an ID is no session; run attach checks its target fields ([8b1f7d2](https://github.com/currents-dev/currents-reporter/commit/8b1f7d2f836092073013eb1592b9749a383e8362))
* **cmd:** attachFiles requires a key, takes a target only for a run, keeps every meta key ([e46284b](https://github.com/currents-dev/currents-reporter/commit/e46284b9e82817e80282984fe2f95b64de2a7376))
* **cmd:** attachFiles returns name, type and size, not the path of a removed temporary zip ([3c77f78](https://github.com/currents-dev/currents-reporter/commit/3c77f7856078493f0c901bc9074bf2d88dde1531))
* **cmd:** bound Retry-After, retry transient S3 4xx, send exactly the measured file size ([b1a4cf3](https://github.com/currents-dev/currents-reporter/commit/b1a4cf3e16d0a5ee33c4a0fa3070724cbd88c632))
* **cmd:** compare a single-value option and its variable exactly; only list options compare as lists ([27cd19e](https://github.com/currents-dev/currents-reporter/commit/27cd19e4f20dc7e4a6b2b0a652d30752d3f9a717))
* **cmd:** convert checks every file in the output folder; list options compare as lists; --group needs --spec ([6058843](https://github.com/currents-dev/currents-reporter/commit/605884370f8224b95bcc56fb9802949e5a0aec31))
* **cmd:** convert reports only into an empty folder ([1be0105](https://github.com/currents-dev/currents-reporter/commit/1be0105e6f4dba8ddc24b4d29c8a22698a345b70))
* **cmd:** currents api does not repeat a PATCH, keeps a __proto__ field; GitLab examples pin Node ([be1947f](https://github.com/currents-dev/currents-reporter/commit/be1947f43b02c9d3ce5d547846f5204ab2940e28))
* **cmd:** currents api refuses . and .. path segments; JSON content types match in any case ([840ef2f](https://github.com/currents-dev/currents-reporter/commit/840ef2f50fb1b74c72f6ac85a6e75975e27e07fb))
* **cmd:** currents api refuses an empty field name, keeps unsafe integers as strings, prints help for api help ([3e59e6a](https://github.com/currents-dev/currents-reporter/commit/3e59e6a4dc2861ada82dbbef7e5b421a7a96bc7a))
* **cmd:** currents api refuses encoded dot segments, keeps field values as written, keeps keys out of debug output ([6e4ac65](https://github.com/currents-dev/currents-reporter/commit/6e4ac65681fe2e58b49858b0eabee9ddb52cae52))
* **cmd:** declare at most 100 MiB per attachments request; cleanup errors do not hide the result ([b366d89](https://github.com/currents-dev/currents-reporter/commit/b366d898941600a1f0e79487dafbd31482720152))
* **cmd:** do not require --machine-id to attach files to a whole run ([1c2fa45](https://github.com/currents-dev/currents-reporter/commit/1c2fa4531736d08467f1c2d9e46dc1333522d3c6))
* **cmd:** do not save cache paths outside the current folder ([871cb7b](https://github.com/currents-dev/currents-reporter/commit/871cb7beb80da67b0f6dc609fc10fd075de40f70))
* **cmd:** explain a bare currents with upload variables set; parse ! in the changelog ([4282b7e](https://github.com/currents-dev/currents-reporter/commit/4282b7e99c707fb7279e6bb5e1e04f9e50646c60))
* **cmd:** hide keys in every debug line ([b03b220](https://github.com/currents-dev/currents-reporter/commit/b03b220d19b44b2d35eda3c9ec35c57159147dd2))
* **cmd:** keep signed URLs and proxy credentials out of debug output; storage review fixes ([7aff9bc](https://github.com/currents-dev/currents-reporter/commit/7aff9bc3e6660554e4461e3d79374b53c8178e06))
* **cmd:** keep the JSON of run get alone on stdout ([3757281](https://github.com/currents-dev/currents-reporter/commit/37572811677e89a4dbdbb87953f8fe4790b7aec6))
* **cmd:** let command-line options win over environment variables ([e389b65](https://github.com/currents-dev/currents-reporter/commit/e389b655eb988f4e25d36cafc851332b345bef2c))
* **cmd:** point to run upload only for upload options ([0951215](https://github.com/currents-dev/currents-reporter/commit/095121506c45d677fbf0da8403622df667fbd395))
* **cmd:** refuse --expires-in-days values other than 1, 3 or 7 ([0e71986](https://github.com/currents-dev/currents-reporter/commit/0e71986083caed65bb6b100a1dc59d576d4aaaa4))
* **cmd:** refuse more environment file names and skip keys in attached folders ([c04ec91](https://github.com/currents-dev/currents-reporter/commit/c04ec91db315536d3df1e7716f5f0a4a340530f6))
* **cmd:** remove the stray brace from the 401 warning ([16e426e](https://github.com/currents-dev/currents-reporter/commit/16e426e6dc0a866918a6c1f0d37a7aef5dabfdb5))
* **cmd:** retries, storage errors and credential removal ([9785712](https://github.com/currents-dev/currents-reporter/commit/978571283b164c741230373fe96b3ab2fe086657))
* **cmd:** retry requests that got 408 ([f622777](https://github.com/currents-dev/currents-reporter/commit/f622777edb725564462e5968b54f7544ddb95aaa))
* **cmd:** say where run upload looked for reports ([46c0bc9](https://github.com/currents-dev/currents-reporter/commit/46c0bc9bb6300c4a36d3a7a44e362e8efee53be5))
* **cmd:** storage error text reaches the terminal without control characters or signed queries ([5ee6306](https://github.com/currents-dev/currents-reporter/commit/5ee6306b4bd5cd2cd7e73a0f9efaa77705d34d19))
* **cmd:** take the commit and its CI fallback from commit-info ([8870c17](https://github.com/currents-dev/currents-reporter/commit/8870c179936f91b9a73512435f6b7825929de8a1))
* **cmd:** the output folder check stops at the first other file; help and README say what the folder may hold ([bc08819](https://github.com/currents-dev/currents-reporter/commit/bc088195f33848228d8173cb0d1023a0e0a34db0))
* **cmd:** the saved session state types projectId as optional and returns only known fields ([6d9a062](https://github.com/currents-dev/currents-reporter/commit/6d9a062960dd900dd256fdf18865ba5f555aba8b))
* **cmd:** warn when an option overrides its environment variable; convert next to the input reports ([f3c5791](https://github.com/currents-dev/currents-reporter/commit/f3c57914d33acf8a008f6c11496fe4c03b811e03))

### Miscellaneous Chores

* **cmd:** upgrade commander to 14 ([726441a](https://github.com/currents-dev/currents-reporter/commit/726441ab2d8a56fdcef539a80b6ccfc81724ff41))

## [2.0.0-beta.0](https://github.com/currents-dev/currents-reporter/compare/%40currents%2Fcmd-v1.11.0...%24%7Bnpm.name%7D-v2.0.0-beta.0) (2026-10-03)

### ⚠ BREAKING CHANGES

* **cmd:** `currents api get-run` is replaced by `currents run get`.
  `currents api get-run` still works, with the same options, environment
  variables and exit codes, but is not listed in the help.
* **cmd:** `currents api` takes a REST API path and no longer prints
  the run commands' help. `currents api get-run` still works as a hidden
  command with the same options as `currents run get`.
* **cmd:** `currents cancel` is deprecated in favor of
  `currents run cancel`. It still works, with the same options, environment
  variables and exit codes, until the next major version.
* **cmd:** `currents convert` is not listed in the root help. Use
  `currents run upload --input-format ...` to convert and upload in one
  command. `currents convert` still works, with the same options and exit codes.
* **cmd:** `currents upload` is replaced by `currents run upload`.
  `currents upload` still works, with the same options, environment variables
  and exit codes, but is not listed in the help.
* **cmd:** `upload` is no longer the default command. Change
  `currents ...` to `currents upload ...` in scripts and CI jobs.
* **cmd:** Command-line options now override environment variables.
* **cmd:** Node 20 or later is required.
* **cmd:** run upload --input-format and convert fail when
  --output-dir or --report-dir names a folder that is not empty.

### Features

* **cmd:** add the skill command ([26961b7](https://github.com/currents-dev/currents-reporter/commit/26961b764b989cd9743d50c13144f0d7f4563c8e))
* **cmd:** API client and upload for sessions and run attachments ([adcf3d3](https://github.com/currents-dev/currents-reporter/commit/adcf3d3276dad16eceb5d7517766f5679dd2ace3))
* **cmd:** convert reports in run upload and hide convert ([83ea3b6](https://github.com/currents-dev/currents-reporter/commit/83ea3b6d193d0bfe718386d17569dcf8fc79746a))
* **cmd:** currents session and currents run attach ([52fab58](https://github.com/currents-dev/currents-reporter/commit/52fab587c784b5e07f029f60207d088024e6efc6))
* **cmd:** find and pack the files to attach ([55d9e0e](https://github.com/currents-dev/currents-reporter/commit/55d9e0e5bcd5832221df34f9747e639713adc16b))
* **cmd:** group the commands in the root help ([437ef65](https://github.com/currents-dev/currents-reporter/commit/437ef65f5aa03eb7e0caec423a3efa5b7ad4689c))
* **cmd:** list one line per command in the root help ([821a46c](https://github.com/currents-dev/currents-reporter/commit/821a46c3d635a97ea6450ab885124db27bdf4704))
* **cmd:** make currents api a request command for any REST API route ([dafa03a](https://github.com/currents-dev/currents-reporter/commit/dafa03a0d0058853d27f7621d60105ddc62d45d9))
* **cmd:** move api get-run to run get ([3244b11](https://github.com/currents-dev/currents-reporter/commit/3244b1168cc18a1b36ce99f7b029a05786e57ae9))
* **cmd:** move cancel under run ([457b495](https://github.com/currents-dev/currents-reporter/commit/457b495a890ec670b5892da6d684935016cf8411))
* **cmd:** move upload under run ([947a31c](https://github.com/currents-dev/currents-reporter/commit/947a31c6e15a57cfe07f1356706745d2b79cb3a9))
* **cmd:** show an example of each common command in the root help ([d7393e5](https://github.com/currents-dev/currents-reporter/commit/d7393e5693dbb1c2385797a4312889796ba8bea2))
* **cmd:** show an example of each run command in run --help ([ce3bc70](https://github.com/currents-dev/currents-reporter/commit/ce3bc709b5306e3f115e0b73e074988e948118b6))
* **cmd:** stop running upload when no command is given ([d51013e](https://github.com/currents-dev/currents-reporter/commit/d51013eacfc08bb2895c0ac097560272ef3949f2))
* **cmd:** warn when the default cache ID will be random ([6c64cf3](https://github.com/currents-dev/currents-reporter/commit/6c64cf3c97a0de0a1582201a1bd98ea803d3f06a))

### Bug Fixes

* **cmd:** a saved session without an ID is no session; run attach checks its target fields ([8b1f7d2](https://github.com/currents-dev/currents-reporter/commit/8b1f7d2f836092073013eb1592b9749a383e8362))
* **cmd:** attachFiles requires a key, takes a target only for a run, keeps every meta key ([e46284b](https://github.com/currents-dev/currents-reporter/commit/e46284b9e82817e80282984fe2f95b64de2a7376))
* **cmd:** attachFiles returns name, type and size, not the path of a removed temporary zip ([3c77f78](https://github.com/currents-dev/currents-reporter/commit/3c77f7856078493f0c901bc9074bf2d88dde1531))
* **cmd:** bound Retry-After, retry transient S3 4xx, send exactly the measured file size ([b1a4cf3](https://github.com/currents-dev/currents-reporter/commit/b1a4cf3e16d0a5ee33c4a0fa3070724cbd88c632))
* **cmd:** compare a single-value option and its variable exactly; only list options compare as lists ([27cd19e](https://github.com/currents-dev/currents-reporter/commit/27cd19e4f20dc7e4a6b2b0a652d30752d3f9a717))
* **cmd:** convert checks every file in the output folder; list options compare as lists; --group needs --spec ([6058843](https://github.com/currents-dev/currents-reporter/commit/605884370f8224b95bcc56fb9802949e5a0aec31))
* **cmd:** convert reports only into an empty folder ([1be0105](https://github.com/currents-dev/currents-reporter/commit/1be0105e6f4dba8ddc24b4d29c8a22698a345b70))
* **cmd:** currents api does not repeat a PATCH, keeps a __proto__ field; GitLab examples pin Node ([be1947f](https://github.com/currents-dev/currents-reporter/commit/be1947f43b02c9d3ce5d547846f5204ab2940e28))
* **cmd:** currents api refuses . and .. path segments; JSON content types match in any case ([840ef2f](https://github.com/currents-dev/currents-reporter/commit/840ef2f50fb1b74c72f6ac85a6e75975e27e07fb))
* **cmd:** currents api refuses an empty field name, keeps unsafe integers as strings, prints help for api help ([3e59e6a](https://github.com/currents-dev/currents-reporter/commit/3e59e6a4dc2861ada82dbbef7e5b421a7a96bc7a))
* **cmd:** currents api refuses encoded dot segments, keeps field values as written, keeps keys out of debug output ([6e4ac65](https://github.com/currents-dev/currents-reporter/commit/6e4ac65681fe2e58b49858b0eabee9ddb52cae52))
* **cmd:** declare at most 100 MiB per attachments request; cleanup errors do not hide the result ([b366d89](https://github.com/currents-dev/currents-reporter/commit/b366d898941600a1f0e79487dafbd31482720152))
* **cmd:** do not require --machine-id to attach files to a whole run ([1c2fa45](https://github.com/currents-dev/currents-reporter/commit/1c2fa4531736d08467f1c2d9e46dc1333522d3c6))
* **cmd:** do not save cache paths outside the current folder ([871cb7b](https://github.com/currents-dev/currents-reporter/commit/871cb7beb80da67b0f6dc609fc10fd075de40f70))
* **cmd:** explain a bare currents with upload variables set; parse ! in the changelog ([4282b7e](https://github.com/currents-dev/currents-reporter/commit/4282b7e99c707fb7279e6bb5e1e04f9e50646c60))
* **cmd:** hide keys in every debug line ([b03b220](https://github.com/currents-dev/currents-reporter/commit/b03b220d19b44b2d35eda3c9ec35c57159147dd2))
* **cmd:** keep signed URLs and proxy credentials out of debug output; storage review fixes ([7aff9bc](https://github.com/currents-dev/currents-reporter/commit/7aff9bc3e6660554e4461e3d79374b53c8178e06))
* **cmd:** keep the JSON of run get alone on stdout ([3757281](https://github.com/currents-dev/currents-reporter/commit/37572811677e89a4dbdbb87953f8fe4790b7aec6))
* **cmd:** let command-line options win over environment variables ([e389b65](https://github.com/currents-dev/currents-reporter/commit/e389b655eb988f4e25d36cafc851332b345bef2c))
* **cmd:** point to run upload only for upload options ([0951215](https://github.com/currents-dev/currents-reporter/commit/095121506c45d677fbf0da8403622df667fbd395))
* **cmd:** refuse --expires-in-days values other than 1, 3 or 7 ([0e71986](https://github.com/currents-dev/currents-reporter/commit/0e71986083caed65bb6b100a1dc59d576d4aaaa4))
* **cmd:** refuse more environment file names and skip keys in attached folders ([c04ec91](https://github.com/currents-dev/currents-reporter/commit/c04ec91db315536d3df1e7716f5f0a4a340530f6))
* **cmd:** remove the stray brace from the 401 warning ([16e426e](https://github.com/currents-dev/currents-reporter/commit/16e426e6dc0a866918a6c1f0d37a7aef5dabfdb5))
* **cmd:** retries, storage errors and credential removal ([9785712](https://github.com/currents-dev/currents-reporter/commit/978571283b164c741230373fe96b3ab2fe086657))
* **cmd:** retry requests that got 408 ([f622777](https://github.com/currents-dev/currents-reporter/commit/f622777edb725564462e5968b54f7544ddb95aaa))
* **cmd:** say where run upload looked for reports ([46c0bc9](https://github.com/currents-dev/currents-reporter/commit/46c0bc9bb6300c4a36d3a7a44e362e8efee53be5))
* **cmd:** storage error text reaches the terminal without control characters or signed queries ([5ee6306](https://github.com/currents-dev/currents-reporter/commit/5ee6306b4bd5cd2cd7e73a0f9efaa77705d34d19))
* **cmd:** take the commit and its CI fallback from commit-info ([8870c17](https://github.com/currents-dev/currents-reporter/commit/8870c179936f91b9a73512435f6b7825929de8a1))
* **cmd:** the output folder check stops at the first other file; help and README say what the folder may hold ([bc08819](https://github.com/currents-dev/currents-reporter/commit/bc088195f33848228d8173cb0d1023a0e0a34db0))
* **cmd:** the saved session state types projectId as optional and returns only known fields ([6d9a062](https://github.com/currents-dev/currents-reporter/commit/6d9a062960dd900dd256fdf18865ba5f555aba8b))
* **cmd:** warn when an option overrides its environment variable; convert next to the input reports ([f3c5791](https://github.com/currents-dev/currents-reporter/commit/f3c57914d33acf8a008f6c11496fe4c03b811e03))

### Miscellaneous Chores

* **cmd:** upgrade commander to 14 ([726441a](https://github.com/currents-dev/currents-reporter/commit/726441ab2d8a56fdcef539a80b6ccfc81724ff41))

# [1.11.0](https://github.com/currents-dev/currents-reporter/compare/%40currents%2Fcmd-v1.10.0...%40currents%2Fcmd-v1.11.0) (2026-09-24)

### Bug Fixes

* bump turbo to 2.9.18 to patch GHSA-hcf7-66rw-9f5r and GHSA-3qcw-2rhx-2726 ([#410](https://github.com/currents-dev/currents-reporter/issues/410)) ([48a6a25](https://github.com/currents-dev/currents-reporter/commit/48a6a253ab2fbb10b86ab61acddceb58b4cb1396))
* count skipped tests once when merging a Detox rerun, omit an unknown Detox version ([40a619c](https://github.com/currents-dev/currents-reporter/commit/40a619cc7dc85df2217e37fd607f828a7ca44d15))
* ignore a Detox manifest without a list of tests ([6fb380c](https://github.com/currents-dev/currents-reporter/commit/6fb380c9ebc2a21764d081d1aab77f6527da30e3))
* keep the reruns of a Detox session in one report directory ([0c7e46c](https://github.com/currents-dev/currents-reporter/commit/0c7e46ca2a8689f67b29aaea6f7242206b3dad08))
* read the steps of tests with hooks from a Detox trace ([f2a0d1e](https://github.com/currents-dev/currents-reporter/commit/f2a0d1ea39fcd8516c1bb38f415e6ec0618a77a5))
* record the pull request's commit when CI checks out a merge commit ([3f9bda4](https://github.com/currents-dev/currents-reporter/commit/3f9bda41b25c05e9eab1eaed73a9bf6f0a0550d6))

### Features

* attach Detox artifacts to the results of a Jest run ([0758bde](https://github.com/currents-dev/currents-reporter/commit/0758bdec531fd54262dfd2bebd0af96d29aa9a22))
* merge Detox reruns and report its trace as steps ([7e49e86](https://github.com/currents-dev/currents-reporter/commit/7e49e863e5fb11be38c0da5f1cab6d24ca153c3e))
* upload detox.trace.json with the results of a Detox run ([498ee5a](https://github.com/currents-dev/currents-reporter/commit/498ee5a34cf58187bc6e449fa10e47cd36637b13))

# [1.11.0-beta.2](https://github.com/currents-dev/currents-reporter/compare/%40currents%2Fcmd-v1.11.0-beta.1...%24%7Bnpm.name%7D-v1.11.0-beta.2) (2026-09-24)

### Bug Fixes

* record the pull request's commit when CI checks out a merge commit ([3f9bda4](https://github.com/currents-dev/currents-reporter/commit/3f9bda41b25c05e9eab1eaed73a9bf6f0a0550d6))

# [1.11.0-beta.1](https://github.com/currents-dev/currents-reporter/compare/%40currents%2Fcmd-v1.11.0-beta.0...%24%7Bnpm.name%7D-v1.11.0-beta.1) (2026-09-23)

### Bug Fixes

* count skipped tests once when merging a Detox rerun, omit an unknown Detox version ([40a619c](https://github.com/currents-dev/currents-reporter/commit/40a619cc7dc85df2217e37fd607f828a7ca44d15))
* ignore a Detox manifest without a list of tests ([6fb380c](https://github.com/currents-dev/currents-reporter/commit/6fb380c9ebc2a21764d081d1aab77f6527da30e3))
* read the steps of tests with hooks from a Detox trace ([f2a0d1e](https://github.com/currents-dev/currents-reporter/commit/f2a0d1ea39fcd8516c1bb38f415e6ec0618a77a5))

# [1.11.0-beta.0](https://github.com/currents-dev/currents-reporter/compare/%40currents%2Fcmd-v1.10.0...%24%7Bnpm.name%7D-v1.11.0-beta.0) (2026-09-23)

### Bug Fixes

* bump turbo to 2.9.18 to patch GHSA-hcf7-66rw-9f5r and GHSA-3qcw-2rhx-2726 ([#410](https://github.com/currents-dev/currents-reporter/issues/410)) ([48a6a25](https://github.com/currents-dev/currents-reporter/commit/48a6a253ab2fbb10b86ab61acddceb58b4cb1396))
* keep the reruns of a Detox session in one report directory ([0c7e46c](https://github.com/currents-dev/currents-reporter/commit/0c7e46ca2a8689f67b29aaea6f7242206b3dad08))

### Features

* attach Detox artifacts to the results of a Jest run ([0758bde](https://github.com/currents-dev/currents-reporter/commit/0758bdec531fd54262dfd2bebd0af96d29aa9a22))
* merge Detox reruns and report its trace as steps ([7e49e86](https://github.com/currents-dev/currents-reporter/commit/7e49e863e5fb11be38c0da5f1cab6d24ca153c3e))
* upload detox.trace.json with the results of a Detox run ([498ee5a](https://github.com/currents-dev/currents-reporter/commit/498ee5a34cf58187bc6e449fa10e47cd36637b13))

# [1.10.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.9...${npm.name}-v1.10.0) (2026-07-30)


### Bug Fixes

* ai feedback ([aef0f44](https://github.com/currents-dev/currents-reporter/commit/aef0f443add2368414202ae7fe53d020829cff47))
* use .cjs extension for temp jest scanner config ([#362](https://github.com/currents-dev/currents-reporter/issues/362)) ([ee7082c](https://github.com/currents-dev/currents-reporter/commit/ee7082c74d6ec53368bada3b9e23a795982cc365))

## [1.9.9](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.8...${npm.name}-v1.9.9) (2026-04-20)


### Bug Fixes

* Update ci-provider variables ([#347](https://github.com/currents-dev/currents-reporter/issues/347)) ([9da1c73](https://github.com/currents-dev/currents-reporter/commit/9da1c736bd931c86504c77755dd03b485373974e))

## [1.9.8](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.7...${npm.name}-v1.9.8) (2026-03-31)

### Bug Fixes

- pin axios version - Update package-lock.json and package.json for axios and axios-retry versions

## [1.9.7](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.6...${npm.name}-v1.9.7) (2026-03-16)

### Bug Fixes

- restore commonjs support for the cmd package 042159b

## [1.9.6](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.5...${npm.name}-v1.9.6) (2026-03-12)

### Bug Fixes

- remove unnecessary build entry fc5b950
- report correct test status for jest reporter 50a59dd
- revert axios version faf549b
- Run npm audit fix to get security fixes for glob (#314) 029ee51, closes #314
- test script for jest package 3073ab4
- use posix pathing to build last run file paths [CSR-3199] (#292) 2ac7063, closes #292

### Features

- add optional tags property to InstanceReportTest type and refactor handleCurrentsReport function for clarity 0b1f494
- **cmd:** support artifacts e545d7e
- jest currents report dir env [CSR-3872] (#320) c4413bf, closes #320

## [1.9.5](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.2...${npm.name}-v1.9.5) (2025-10-06)

### Bug Fixes

- use posix pathing to build last run file paths [CSR-3199] ([#292](https://github.com/currents-dev/currents-reporter/issues/292)) ([2ac7063](https://github.com/currents-dev/currents-reporter/commit/2ac7063fba53df8bbe80b2abd11ccee4f22aee74))

## [1.9.4](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.2...${npm.name}-v1.9.4) (2025-06-12)

### Bug fixes

- change `glob` package to `globby`

## [1.9.3](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.2...${npm.name}-v1.9.3) (2025-06-12)

- Attempted fix for `glob` package issue (superseded by 1.9.4).

## [1.9.2](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.1...${npm.name}-v1.9.2) (2025-06-12)

- Attempted fix for `glob` package issue (superseded by 1.9.4).

## [1.9.1](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.9.0...${npm.name}-v1.9.1) (2025-06-12)

- Attempted fix for `glob` package issue (superseded by 1.9.4).

# [1.9.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.7.1...${npm.name}-v1.9.0) (2025-06-12)

- Attempted fix for `glob` package issue (superseded by 1.9.4).

# [1.8.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.7.1...${npm.name}-v1.8.0) (2025-04-30)

### Bug Fixes

- Cache Run Attempts with GitLab ([#217](https://github.com/currents-dev/currents-reporter/issues/217)) ([a11d0ae](https://github.com/currents-dev/currents-reporter/commit/a11d0ae0687ee37b406c584624c89edb2edd41b2))

### Features

- refactor cache commands implementation ([#216](https://github.com/currents-dev/currents-reporter/issues/216)) ([3e21aab](https://github.com/currents-dev/currents-reporter/commit/3e21aab612a08ba556bc28517a3c581e91bbbae3))

## [1.7.1](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.10...${npm.name}-v1.7.1) (2025-04-16)

### Bug Fixes

- api get-run: exit early if no right set of parameters provided ([96e69e6](https://github.com/currents-dev/currents-reporter/commit/96e69e606876dbb514d7e19e340d42990bb5a1f0))
- http formatting for 404 errors ([c1170b2](https://github.com/currents-dev/currents-reporter/commit/c1170b2606e999af51bd57a3464b10c599dd9aec))
- omit ciBuildId from cache meta file when null ([#203](https://github.com/currents-dev/currents-reporter/issues/203)) ([72c2362](https://github.com/currents-dev/currents-reporter/commit/72c23625d1f4ad78a5ef4c4fc8386c2d6f985bbd))
- remove tsconfig.json, add commander to dev deps ([8e7e83c](https://github.com/currents-dev/currents-reporter/commit/8e7e83c986b4cc03c47dc8a779ea9b05fb555ae6))

### Features

- add node reporter v2 ([dae78a9](https://github.com/currents-dev/currents-reporter/commit/dae78a9a15df18751e7e139a134abe492003a3e3))

# [1.7.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.10...${npm.name}-v1.7.0) (2025-04-10)

### Features

- Add support for Node as a framework for the convert command

### Bug Fixes

- remove tsconfig.json, add commander to dev deps ([8e7e83c](https://github.com/currents-dev/currents-reporter/commit/8e7e83c986b4cc03c47dc8a779ea9b05fb555ae6))

## [1.6.10](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.9...${npm.name}-v1.6.10) (2025-04-04)

### Bug Fixes

- Improve command descriptions for API and convert commands ([#194](https://github.com/currents-dev/currents-reporter/issues/194)) ([93599e8](https://github.com/currents-dev/currents-reporter/commit/93599e8f0c2b4b6206411fd4128ae4a69894a103))

## [1.6.9](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.8...${npm.name}-v1.6.9) (2025-03-06)

### Features

support WebDriverIO as valid framework in the `convert` command ([f9940f0](https://github.com/currents-dev/currents-reporter/commit/f9940f0ff7d8016356b145b007fb6f9e55b811b7))

## [1.6.8](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.7...${npm.name}-v1.6.8) (2025-01-30)

### Bug Fixes

- reduce default max size to 1MB ([500c933](https://github.com/currents-dev/currents-reporter/commit/500c933a801ad1027331242da12c842275a77c94))
- remove log ([ea22468](https://github.com/currents-dev/currents-reporter/commit/ea224680087f61d8054479bebd686f055f6abeaf))

### Features

- allow reporting instance results in different requests ([3a55883](https://github.com/currents-dev/currents-reporter/commit/3a55883315ff2d6db3ccc8bea5d71d46f9de343e))

## [1.6.7](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.6...${npm.name}-v1.6.7) (2025-01-14)

### Bug Fixes

- remove worker ([8c2e09e](https://github.com/currents-dev/currents-reporter/commit/8c2e09e61d9520810406a8194185bb173b6664ff))
- remove worker info from jest reporter ([f3e1e5d](https://github.com/currents-dev/currents-reporter/commit/f3e1e5d58fd50b13a10d20409993cf0f8054f57c))
- removed workerIndex, parallelIndex from attempt and cliArgs from config file as they're unnecessary ([4b520f9](https://github.com/currents-dev/currents-reporter/commit/4b520f96617bdc23200aec00c2dd04336cde0f8f))
- update snapshot ([3b05431](https://github.com/currents-dev/currents-reporter/commit/3b05431a25d3b5d5fc68ab9d4f264bd9b6860984))
- update test snapshot ([eac97e4](https://github.com/currents-dev/currents-reporter/commit/eac97e4dd1a1fabc70830119d2e130e06e0333a6))

## [1.6.6](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.5...${npm.name}-v1.6.6) (2025-01-06)

### Bug Fixes

- attempt status incorrect value ([aa9a4c7](https://github.com/currents-dev/currents-reporter/commit/aa9a4c7f5b815b0222304e5eb0fa98aa5a86df0d))
- fixture status ([b1146da](https://github.com/currents-dev/currents-reporter/commit/b1146dad8f49c71cefd61771fe6b55a27fe02489))

## [1.6.5](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.4...${npm.name}-v1.6.5) (2025-01-02)

### Bug Fixes

- .. ([6b32d28](https://github.com/currents-dev/currents-reporter/commit/6b32d28a656bec8ede1db3a99167fa6b7b19ef66))
- display the correct baseURL in the http client debug logs ([b80b276](https://github.com/currents-dev/currents-reporter/commit/b80b2766066e77e349b8c2590e480db0a4694d5e))
- ensure date values are properly handled ([4a819ca](https://github.com/currents-dev/currents-reporter/commit/4a819cab3995cf52e7ab278f08373d485b0dac6a))
- mask sensitive data ([5985aed](https://github.com/currents-dev/currents-reporter/commit/5985aedb5abfafcaa18e9bc0da3cc3b2a1832570))

## [1.6.4](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.3...${npm.name}-v1.6.4) (2024-12-30)

### Reverts

- Revert "Merge pull request #102 from currents-dev/dependabot/npm_and_yarn/pretty-ms-9.2.0" ([c71af0f](https://github.com/currents-dev/currents-reporter/commit/c71af0f628fa009458e18286748e33d97cbfcdd6)), closes [#102](https://github.com/currents-dev/currents-reporter/issues/102)
- Revert "[CSR-0] chore: Bump chalk from 4.1.2 to 5.4.1" ([ea4922a](https://github.com/currents-dev/currents-reporter/commit/ea4922a37ba2ec26fce1babf854d05b47d0c0d28))

## [1.6.3](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.2...${npm.name}-v1.6.3) (2024-12-30)

## [1.6.2](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.2-beta.0...${npm.name}-v1.6.2) (2024-12-16)

### Bug Fixes

- addressed feedback ([aaeb96a](https://github.com/currents-dev/currents-reporter/commit/aaeb96aa9d7722972975405771b12fee6affb8bb))
- change getSuiteName ([518d989](https://github.com/currents-dev/currents-reporter/commit/518d98926422a2c9738e875124a983d077d29b8f))
- instance files withe duplicated testsuite names ([8eef041](https://github.com/currents-dev/currents-reporter/commit/8eef04119ba324bc77aac38c21949b3af5a08b13))

## [1.6.2-beta.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.1...${npm.name}-v1.6.2-beta.0) (2024-12-16)

### Bug Fixes

- cache get command, attach --last-failed flag only if pw was executed ([5cdad86](https://github.com/currents-dev/currents-reporter/commit/5cdad867e73b51bf720cad2660bbe499e4f143f4))

## [1.6.1](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.0...${npm.name}-v1.6.1) (2024-12-11)

### Bug Fixes

- upload command options parsing ([1cb9dac](https://github.com/currents-dev/currents-reporter/commit/1cb9dac47ea67aff2dff024b5e553759a3b80c2f))

# [1.6.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.5.0...${npm.name}-v1.6.0) (2024-12-06)

### Bug Fixes

- add ensureArray to full test suite discovery, avoid creating testless instance files ([814ebdc](https://github.com/currents-dev/currents-reporter/commit/814ebdcad784a26a7c56bd264d8808392a0d1582))

# [1.5.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.4.0...${npm.name}-v1.5.0) (2024-11-28)

### Features

- Add the continue flag to cache set ([2e02e5a](https://github.com/currents-dev/currents-reporter/commit/2e02e5a07b869e9cbc22c54b310ad1829a853afb))

# [1.4.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.3.0...${npm.name}-v1.4.0) (2024-11-27)

### Bug Fixes

- add missing dependency ([006cf16](https://github.com/currents-dev/currents-reporter/commit/006cf161e6952d257808eb58bb285b43a5536b7e))

# [1.3.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.2.1...${npm.name}-v1.3.0) (2024-11-25)

### Bug Fixes

- allow globs for cache set --path and last run preset ([b102a26](https://github.com/currents-dev/currents-reporter/commit/b102a26c46fa48ecb15f7161e7f32a21e977e8ed))

### Features

- Change to MIT license ([7a4d944](https://github.com/currents-dev/currents-reporter/commit/7a4d944dc8f28be4cd63d4cf731060f669b5a0b9))

# [1.2.1](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.1.2...${npm.name}-v1.2.0) (2024-11-25)

### Bug Fixes

- added junit types, addressed feedback ([f028f64](https://github.com/currents-dev/currents-reporter/commit/f028f64d2ab59143940c778f0703e6b85c749334))
- conversion script ([234bcd3](https://github.com/currents-dev/currents-reporter/commit/234bcd3124ec7d987f2d54a4fd5f81e813bd27ba))
- currents convert command ([a5c28a6](https://github.com/currents-dev/currents-reporter/commit/a5c28a696b9113e762eb03cb950fbf702d11e970))
- jest attempt fields ([2c2083c](https://github.com/currents-dev/currents-reporter/commit/2c2083cff46ad1edc8da9590f3b9302b79a86061))
- optional framework config, specify framework config properties to be reported ([45cbc7a](https://github.com/currents-dev/currents-reporter/commit/45cbc7a99796ab59f0e2997722609f5c3ac171eb))
- reuse types ([5c5585d](https://github.com/currents-dev/currents-reporter/commit/5c5585de93f0fc56a3285db14c06293467488469))
- small refactor ([db563f7](https://github.com/currents-dev/currents-reporter/commit/db563f75418ec6578d4d77b704aa8b6dcf013dcb))
- use npm ([e1b2823](https://github.com/currents-dev/currents-reporter/commit/e1b28234cd17358f4e4cd39be0823318e88cdede))

### Features

- add convert command ([c73ea86](https://github.com/currents-dev/currents-reporter/commit/c73ea86f5e292a20c28368715d140d9df283a490))
- add enum for inputFormat option ([b6ed27d](https://github.com/currents-dev/currents-reporter/commit/b6ed27d06b418c9a9829581f1852302896e822ea))
- add previousCiBuildId to run creation ([dfbb32e](https://github.com/currents-dev/currents-reporter/commit/dfbb32e8dd79190116d7e30dbf9b9db4a298fa8e))
- added full test suite junit scanner ([e040f5e](https://github.com/currents-dev/currents-reporter/commit/e040f5eb075ce0431c3c259d341f46fcbb012ee7))
- added generate instances ([6d61fbf](https://github.com/currents-dev/currents-reporter/commit/6d61fbf475d991b04b182d3160d36b62e259a8fc))
- added junit originFramework support ([a89a591](https://github.com/currents-dev/currents-reporter/commit/a89a5912375d39df98e76d17cd0f14c2a8b17da4))
- added postman example ([4fb3de8](https://github.com/currents-dev/currents-reporter/commit/4fb3de8ad664b879f1964f2405f6c52ebe49815c))
- CircleCi cache ([db742e6](https://github.com/currents-dev/currents-reporter/commit/db742e61f7ecfb88a2be15369a565ef2af9807e8))
- use glob to parse --input-file option ([92098a9](https://github.com/currents-dev/currents-reporter/commit/92098a9e059b67db45c54cd8c9d6267f1e5f15ac))

## [1.1.2](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.1.1...${npm.name}-v1.1.2) (2024-10-04)

### Bug Fixes

- .. ([a55fe22](https://github.com/currents-dev/currents-reporter/commit/a55fe22b12a9364eb8884d66aae2a669869aec95))
- add --no-fail flag ([1ab94c1](https://github.com/currents-dev/currents-reporter/commit/1ab94c1d743bea11c3aac69806df59c51ce51487))
- display traces for errors only fo debug mode ([8f12eaf](https://github.com/currents-dev/currents-reporter/commit/8f12eafeb9dc06f56db5d5d3805c0ec4e2eea4f4))
- exit with code 1 when cache commands fail ([d08bd60](https://github.com/currents-dev/currents-reporter/commit/d08bd608978ff4c03d61d8e9f820df3d494b64f8))
- remove --no-fail flag, add --continue flag ([a84b773](https://github.com/currents-dev/currents-reporter/commit/a84b7738e227175505df6711976f1b4d1b75c741))
- remove console.log [skip ci] ([a766e6f](https://github.com/currents-dev/currents-reporter/commit/a766e6f90f372a89ba577715823acf3c6e4f814d))
- simplify the error handler ([0342c3d](https://github.com/currents-dev/currents-reporter/commit/0342c3d259a4ca7b8cbe2c9b5f259fea2d813015))

### Features

- add success messages ([7b7c1fa](https://github.com/currents-dev/currents-reporter/commit/7b7c1fa9faf96d5fdcd5e78f1200e7681ed746e5))

## [1.1.1](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.1.0...${npm.name}-v1.1.1) (2024-10-03)

### Bug Fixes

- cache command usage example [skip ci] ([3bb9415](https://github.com/currents-dev/currents-reporter/commit/3bb9415612f2d2e4f564596c8fc4a3e140cfd6be))
- rename from --paths to --path ([b995083](https://github.com/currents-dev/currents-reporter/commit/b99508354d2dbc4af77ed32852acc5d8ad7d8981))

# [1.1.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.5...${npm.name}-v1.1.0) (2024-10-01)

### Features

- Implementation for `api` and `cache` commands (#12)

## [1.0.5](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.4...${npm.name}-v1.0.5) (2024-09-09)

### Bug Fixes

- make missing config variables user-friendly ([2a2b7ab](https://github.com/currents-dev/currents-reporter/commit/2a2b7abb97cbf78546465538d7c48b97d6934bc4))

## [1.0.4](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.3...${npm.name}-v1.0.4) (2024-09-03)

### Bug Fixes

- use .currents directory ([611132b](https://github.com/currents-dev/currents-reporter/commit/611132b286403fce4dcbf4343d82e9927611255d))
- use currents instead of currents-reporter CLI command ([2617004](https://github.com/currents-dev/currents-reporter/commit/26170046044f94dffda5bc967f2ab87a72cc0d8c))

## [1.0.3](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.2...${npm.name}-v1.0.3) (2024-08-01)

### Bug Fixes

- use v1/runs endpoint [CSR-1336] ([#6](https://github.com/currents-dev/currents-reporter/issues/6)) ([d9a799d](https://github.com/currents-dev/currents-reporter/commit/d9a799dbcfa4db5908a2a168ce78adc544df45b5))

## [1.0.2](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.1...${npm.name}-v1.0.2) (2024-07-25)

### Bug Fixes

- filter irrelevant options from jest configuration ([#5](https://github.com/currents-dev/currents-reporter/issues/5)) ([3031b3d](https://github.com/currents-dev/currents-reporter/commit/3031b3d78a394b0946daa1fd3ce4d2b73c32f9f3))

## [1.0.1](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.0...${npm.name}-v1.0.1) (2024-07-23)

# [1.0.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.0-beta.4...${npm.name}-v1.0.0) (2024-07-16)

# [1.0.0-beta.4](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.0-beta.3...${npm.name}-v1.0.0-beta.4) (2024-07-16)

### Bug Fixes

- include test case location in the report, when available ([#3](https://github.com/currents-dev/currents-reporter/issues/3)) ([f074021](https://github.com/currents-dev/currents-reporter/commit/f074021627ba44d130abeea0d608edf71440840a))

# [1.0.0-beta.3](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.0-beta.2...${npm.name}-v1.0.0-beta.3) (2024-07-10)

# [1.0.0-beta.2](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.0.0-beta.1...${npm.name}-v1.0.0-beta.2) (2024-07-10)

# 1.0.0-beta.1 (2024-07-10)

### Bug Fixes

- command options ([8e9cd80](https://github.com/currents-dev/currents-reporter/commit/8e9cd8094ff5449f1431f8dd65da3a87daf32eaa))
- jest discovery issue ([e9a3a3a](https://github.com/currents-dev/currents-reporter/commit/e9a3a3aaf3031b0c8c0a98f824ffeb0abe3e8b41))
- remove unused deps ([cb6002f](https://github.com/currents-dev/currents-reporter/commit/cb6002f091b28769f105450b5c438add163c8d86))
- show tags related config options ([fef56db](https://github.com/currents-dev/currents-reporter/commit/fef56dbf67e9ecb82a508654eea059cf7c04c6f8))

### Features

- add reportDir option to jest-reporter ([887fae6](https://github.com/currents-dev/currents-reporter/commit/887fae637f5d08243323e30abedba919075939b6))
- add vitest ([2b25624](https://github.com/currents-dev/currents-reporter/commit/2b2562410adcce06de4e54abcc63c4a16603d27b))
