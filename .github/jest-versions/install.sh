#!/usr/bin/env bash
# Installs Jest and the packed @currents/jest and @currents/cmd into the project.
# Usage: install.sh <jest version or dist-tag> <folder with the .tgz files> <project folder>
set -euo pipefail

jest_version=$1
packs_dir=$2
cd "$3"

if [[ $jest_version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  # Without --before, jest@29.5.0 installs jest-cli 29.7.0. With it, the Jest
  # packages are the ones a project gets that has had this version in its
  # lockfile since the release.
  before=$(npm view jest time --json | JEST_VERSION=$jest_version node -e '
    const time = JSON.parse(require("fs").readFileSync(0, "utf8"));
    const released = Date.parse(time[process.env.JEST_VERSION]);
    console.log(new Date(released + 24 * 60 * 60 * 1000).toISOString());
  ')
  npm install --save-dev --no-audit --no-fund "jest@$jest_version" --before "$before"
else
  npm install --save-dev --no-audit --no-fund "jest@$jest_version"
fi

npm install --save-dev --no-audit --no-fund "$packs_dir"/*.tgz
npm ls jest jest-cli jest-config @currents/jest @currents/cmd
