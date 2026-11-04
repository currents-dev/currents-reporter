import { execFile } from 'child_process';
import fs from 'fs/promises';
import { memoize } from 'lodash';
import { freemem, platform, release, totalmem } from 'os';
import path from 'path';

/*
 * The Linux version is found the way getos 3.2.1 found it (index.js, os.json
 * and logic/*.js), so the API receives the same osVersion as before. Its odd
 * results are kept on purpose: "Red Hat Linux" for RHEL, "Raspbian" for any
 * system with only /etc/os-release, a trailing newline for CentOS Stream, and
 * the kernel version where no release is found.
 */

// Checked in this order; the first one that is a file is read.
const RELEASE_FILES: [string, string[]][] = [
  ['/etc/fedora-release', ['Fedora']],
  [
    '/etc/redhat-release',
    [
      'RHEL',
      'RHAS',
      'Red Hat Linux',
      'Scientific Linux',
      'ScientificSL',
      'ScientificCERNSLC',
      'ScientificFermiLTS',
      'ScientificSLF',
      'CentOS',
    ],
  ],
  [
    '/etc/redhat_version',
    [
      'RHEL',
      'RHAS',
      'Red Hat Linux',
      'Scientific Linux',
      'ScientificSL',
      'ScientificCERNSLC',
      'ScientificFermiLTS',
      'ScientificSLF',
    ],
  ],
  ['/etc/SuSE-release', ['SUSE Linux']],
  [
    '/etc/lsb-release',
    [
      'Ubuntu',
      'Chakra',
      'IYCC',
      'Linux Mint',
      'elementary OS',
      'Arch Linux',
      'Manjaro Linux',
      'KDE neon',
      'Zorin',
    ],
  ],
  ['/etc/debian_version', ['Debian']],
  ['/etc/debian_release', ['Debian']],
  ['/etc/arch-release', ['Arch Linux']],
  ['/etc/NIXOS', ['NixOS']],
  ['/etc/annvix-release', ['Annvix']],
  ['/etc/arklinux-release', ['Arklinux']],
  ['/etc/aurox-release', ['Aurox Linux']],
  ['/etc/blackcat-release', ['BlackCat']],
  ['/etc/cobalt-release', ['Cobalt']],
  ['/etc/conectiva-release', ['Conectiva']],
  ['/etc/eos-version', ['FreeEOS']],
  ['/etc/gentoo-release', ['Gentoo Linux']],
  ['/etc/hlfs-release', ['HLFS']],
  ['/etc/hlfs_version', ['HFLS']],
  ['/etc/immunix-release', ['Immunix']],
  ['/knoppix_version', ['Knoppix']],
  ['/etc/lfs-release', ['Linux-From-Scratch']],
  ['/etc/lfs_version', ['Linux-From-Scratch']],
  ['/etc/linuxppc-release', ['Linux-PPC']],
  ['/etc/mageia-release', ['Mageia']],
  ['/etc/mandriva-release', ['Mandriva Linux', 'Mandrake Linux']],
  ['/etc/mandakelinux-release', ['Mandriva Linux', 'Mandrake Linux']],
  ['/etc/mandrake-release', ['Mandrake', 'Mandriva Linux', 'Mandrake Linux']],
  ['/etc/mklinux-release', ['MkLinux']],
  ['/etc/nld-release', ['Novell Linux Desktop']],
  ['/etc/pld-release', ['PLD Linux']],
  ['/etc/rubix-version', ['Rubix']],
  ['/etc/slackware-version', ['Slackware']],
  ['/etc/slackware-release', ['Slackware']],
  ['/etc/e-smith-release', ['SME Server']],
  ['/etc/release', ['Solaris SPARC']],
  ['/etc/sun-release', ['Sun JDS']],
  ['/etc/novell-release', ['SUSE Linux']],
  ['/etc/sles-release', ['SUSE Linux ES9']],
  ['/etc/synoinfo.conf', ['Synology']],
  ['/etc/tinysofa-release', ['Tiny Sofa']],
  ['/etc/trustix-release', ['Trustix']],
  ['/etc/trustix-version', ['Trustix']],
  ['/etc/turbolinux-release', ['TurboLinux']],
  ['/etc/ultrapenguin-release', ['UltraPenguin']],
  ['/etc/UnitedLinux-release', ['UnitedLinux']],
  ['/etc/va-release', ['VA-Linux/RH-VALE']],
  ['/etc/yellowdog-release', ['Yellow Dog']],
  ['/etc/alpine-release', ['Alpine Linux']],
  ['/etc/system-release', ['Amazon Linux']],
  ['/etc/os-release', ['Raspbian']],
];

const DISTRIB_RELEASE = /distrib_release=(.*)/;
const RHEL_RELEASE = /release ([^ ]+)/;
const FIRST_LINE = /(.*)/;

// getos' logic/<name>.js, keyed by the first word of the distribution name
const RELEASE_PATTERNS: Record<string, RegExp> = {
  alpine: FIRST_LINE,
  amazon: /release (.*)/,
  arch: DISTRIB_RELEASE,
  centos: RHEL_RELEASE,
  debian: FIRST_LINE,
  fedora: /release (..)/,
  kde: DISTRIB_RELEASE,
  manjaro: DISTRIB_RELEASE,
  mint: DISTRIB_RELEASE,
  raspbian: /VERSION_ID="(.*)"/,
  red: RHEL_RELEASE,
  suse: /VERSION = (.*)\n/,
  ubuntu: DISTRIB_RELEASE,
  zorin: DISTRIB_RELEASE,
};

// The first word in lower case, skipping "Linux": "Linux Mint" is "mint"
function getName(candidate: string) {
  return candidate
    .split(' ')
    .map((word) => word.toLowerCase())
    .find((word) => word !== 'linux')!;
}

function findRelease(name: string, text: string) {
  const pattern = RELEASE_PATTERNS[name];
  return pattern ? text.match(pattern)?.[1] : undefined;
}

function runLsbRelease() {
  return new Promise<string>((resolve, reject) =>
    execFile('lsb_release', ['-a'], (err, stdout) =>
      err ? reject(err) : resolve(stdout)
    )
  );
}

async function getDebianRelease(file: string) {
  try {
    const stdout = await runLsbRelease();
    return stdout.match(/Release:\t(.*)/)?.[1];
  } catch {
    return findRelease('debian', file);
  }
}

async function findReleaseFile(root: string) {
  for (const [file, candidates] of RELEASE_FILES) {
    const filePath = path.join(root, file);
    const stats = await fs.stat(filePath).catch(() => null);
    if (stats?.isFile()) return { filePath, candidates };
  }
  return null;
}

/**
 * "<distribution> - <release>", or undefined when no release is found. `root`
 * is for tests.
 */
export async function getLinuxVersion(root = '/') {
  const found = await findReleaseFile(root);
  if (!found) return undefined;
  const file = await fs.readFile(found.filePath, 'utf8');
  let [dist] = found.candidates;
  let version: string | undefined;

  if (found.candidates.length === 1) {
    const name = getName(dist);
    version =
      name === 'debian'
        ? await getDebianRelease(file)
        : findRelease(name, file);
  } else {
    // Several distributions share the file. Each one named in the file in
    // lower case is taken in turn: the last one gives the name, and a release
    // found for an earlier one is kept when a later one has none.
    const text = file.toLowerCase();
    for (const candidate of found.candidates) {
      const name = getName(candidate);
      if (!text.includes(name)) continue;
      dist = candidate;
      version = findRelease(name, text) ?? version;
    }
  }

  return version === undefined ? undefined : `${dist} - ${version}`;
}

const getOsVersion = async () => {
  if (platform() === 'linux') {
    try {
      return (await getLinuxVersion()) ?? release();
    } catch {
      return release();
    }
  }
  return release();
};

export const _getPlatformInfo = async () => {
  const osVersion = await getOsVersion();
  return {
    osName: platform(),
    osVersion,
    osCpus: [],
    osMemory: {
      free: freemem(),
      total: totalmem(),
    },
  };
};

export const getPlatformInfo = memoize(_getPlatformInfo);
