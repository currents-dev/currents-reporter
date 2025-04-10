# Changelog

# [1.7.0](https://github.com/currents-dev/currents-reporter/compare/@currents/cmd-v1.6.10...${npm.name}-v1.7.0) (2025-04-10)

### Features

* Add support for Node as a framework for the convert command

### Bug Fixes

* remove tsconfig.json, add commander to dev deps ([8e7e83c](https://github.com/currents-dev/currents-reporter/commit/8e7e83c986b4cc03c47dc8a779ea9b05fb555ae6))

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
