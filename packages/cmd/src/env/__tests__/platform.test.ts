import { execFile } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import os, { platform, release } from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _getPlatformInfo, getLinuxVersion } from '../platform';

vi.mock('child_process', () => ({ execFile: vi.fn() }));
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('os')>();
  return {
    ...actual,
    default: actual,
    platform: vi.fn(actual.platform),
    release: vi.fn(actual.release),
  };
});

type LsbRelease = {
  /** Output of `lsb_release -a` */
  stdout?: string;
  /** Exit code of a failed run */
  exitCode?: number;
  delayMs?: number;
};

/** Without `lsb`, the command is missing. */
function mockLsbRelease(lsb?: LsbRelease) {
  vi.mocked(execFile).mockImplementation(((
    _file: string,
    _args: string[],
    callback: (err: Error | null, stdout: string) => void
  ) => {
    const answer = () => {
      if (lsb?.exitCode) {
        callback(
          Object.assign(new Error('Command failed: lsb_release -a'), {
            code: lsb.exitCode,
          }),
          ''
        );
      } else if (lsb?.stdout !== undefined) callback(null, lsb.stdout);
      else callback(new Error('spawn lsb_release ENOENT'), '');
    };
    if (lsb?.delayMs) setTimeout(answer, lsb.delayMs);
    else answer();
  }) as unknown as typeof execFile);
}

/** Writes the files under `root`; null is a folder. */
function writeFiles(root: string, files: Record<string, string | null>) {
  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(root, file);
    if (content === null) {
      fs.mkdirSync(filePath, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }
  }
}

type Fixture = {
  name: string;
  /** Release files by path; null is a folder */
  files: Record<string, string | null>;
  /** Output of `lsb_release -a`; without it the command is missing */
  lsb?: string;
  /** What getos 3.2.1 returned for these files, null for none */
  expected: string | null;
};

// The expected values come from running getos 3.2.1 on the same files.
const fixtures: Fixture[] = [
  {
    name: 'Ubuntu 22.04 (Playwright jammy image)',
    files: {
      '/etc/lsb-release':
        'DISTRIB_ID=Ubuntu\nDISTRIB_RELEASE=22.04\nDISTRIB_CODENAME=jammy\nDISTRIB_DESCRIPTION="Ubuntu 22.04.4 LTS"\n',
      '/etc/debian_version': 'bookworm/sid\n',
      '/etc/os-release':
        'PRETTY_NAME="Ubuntu 22.04.4 LTS"\nNAME="Ubuntu"\nVERSION_ID="22.04"\nVERSION="22.04.4 LTS"\nVERSION_CODENAME=jammy\nID=ubuntu\nID_LIKE=debian\n',
    },
    expected: 'Ubuntu - 22.04',
  },
  {
    name: 'Ubuntu 24.04 (Playwright noble image)',
    files: {
      '/etc/lsb-release':
        'DISTRIB_ID=Ubuntu\nDISTRIB_RELEASE=24.04\nDISTRIB_CODENAME=noble\nDISTRIB_DESCRIPTION="Ubuntu 24.04.1 LTS"\n',
      '/etc/debian_version': 'trixie/sid\n',
      '/etc/os-release':
        'PRETTY_NAME="Ubuntu 24.04.1 LTS"\nNAME="Ubuntu"\nVERSION_ID="24.04"\nVERSION="24.04.1 LTS"\nVERSION_CODENAME=noble\nID=ubuntu\nID_LIKE=debian\n',
    },
    expected: 'Ubuntu - 24.04',
  },
  {
    name: 'Debian 12 Docker (node:22, node:22-slim)',
    files: {
      '/etc/debian_version': '12.7\n',
      '/etc/os-release':
        'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n',
    },
    expected: 'Debian - 12.7',
  },
  {
    name: 'Debian 12 with lsb-release installed',
    files: {
      '/etc/debian_version': '12.7\n',
      '/etc/os-release':
        'PRETTY_NAME="Debian GNU/Linux 12 (bookworm)"\nNAME="Debian GNU/Linux"\nVERSION_ID="12"\nVERSION="12 (bookworm)"\nVERSION_CODENAME=bookworm\nID=debian\n',
    },
    lsb: 'No LSB modules are available.\nDistributor ID:\tDebian\nDescription:\tDebian GNU/Linux 12 (bookworm)\nRelease:\t12\nCodename:\tbookworm\n',
    expected: 'Debian - 12',
  },
  {
    name: 'Alpine 3.20 (node:22-alpine)',
    files: {
      '/etc/alpine-release': '3.20.3\n',
      '/etc/os-release':
        'NAME="Alpine Linux"\nID=alpine\nVERSION_ID=3.20.3\nPRETTY_NAME="Alpine Linux v3.20"\n',
    },
    expected: 'Alpine Linux - 3.20.3',
  },
  {
    name: 'Amazon Linux 2',
    files: {
      '/etc/system-release': 'Amazon Linux release 2 (Karoo)\n',
      '/etc/os-release':
        'NAME="Amazon Linux"\nVERSION="2"\nID="amzn"\nID_LIKE="centos rhel fedora"\nVERSION_ID="2"\nPRETTY_NAME="Amazon Linux 2"\n',
    },
    expected: 'Amazon Linux - 2 (Karoo)',
  },
  {
    name: 'Amazon Linux 2023',
    files: {
      '/etc/amazon-linux-release':
        'Amazon Linux release 2023.6.20241010 (Amazon Linux)\n',
      '/etc/system-release':
        'Amazon Linux release 2023.6.20241010 (Amazon Linux)\n',
      '/etc/os-release':
        'NAME="Amazon Linux"\nVERSION="2023"\nID="amzn"\nID_LIKE="fedora"\nVERSION_ID="2023"\nPRETTY_NAME="Amazon Linux 2023.6.20241010"\n',
    },
    expected: 'Amazon Linux - 2023.6.20241010 (Amazon Linux)',
  },
  {
    name: 'RHEL 9 (ubi9)',
    files: {
      '/etc/redhat-release': 'Red Hat Enterprise Linux release 9.4 (Plow)\n',
      '/etc/system-release': 'Red Hat Enterprise Linux release 9.4 (Plow)\n',
      '/etc/os-release':
        'NAME="Red Hat Enterprise Linux"\nVERSION="9.4 (Plow)"\nID="rhel"\nVERSION_ID="9.4"\nPRETTY_NAME="Red Hat Enterprise Linux 9.4 (Plow)"\n',
    },
    expected: 'Red Hat Linux - 9.4',
  },
  {
    name: 'CentOS 7',
    files: {
      '/etc/centos-release': 'CentOS Linux release 7.9.2009 (Core)\n',
      '/etc/redhat-release': 'CentOS Linux release 7.9.2009 (Core)\n',
      '/etc/system-release': 'CentOS Linux release 7.9.2009 (Core)\n',
      '/etc/os-release':
        'NAME="CentOS Linux"\nVERSION="7 (Core)"\nID="centos"\nVERSION_ID="7"\nPRETTY_NAME="CentOS Linux 7 (Core)"\n',
    },
    expected: 'CentOS - 7.9.2009',
  },
  {
    name: 'CentOS Stream 9',
    files: {
      '/etc/centos-release': 'CentOS Stream release 9\n',
      '/etc/redhat-release': 'CentOS Stream release 9\n',
      '/etc/os-release':
        'NAME="CentOS Stream"\nVERSION="9"\nID="centos"\nVERSION_ID="9"\nPRETTY_NAME="CentOS Stream 9"\n',
    },
    expected: 'CentOS - 9\n',
  },
  {
    name: 'Rocky Linux 9',
    files: {
      '/etc/rocky-release': 'Rocky Linux release 9.4 (Blue Onyx)\n',
      '/etc/redhat-release': 'Rocky Linux release 9.4 (Blue Onyx)\n',
      '/etc/os-release':
        'NAME="Rocky Linux"\nVERSION="9.4 (Blue Onyx)"\nID="rocky"\nVERSION_ID="9.4"\nPRETTY_NAME="Rocky Linux 9.4 (Blue Onyx)"\n',
    },
    expected: null,
  },
  {
    name: 'Fedora 40',
    files: {
      '/etc/fedora-release': 'Fedora release 40 (Forty)\n',
      '/etc/redhat-release': 'Fedora release 40 (Forty)\n',
      '/etc/system-release': 'Fedora release 40 (Forty)\n',
      '/etc/os-release':
        'NAME="Fedora Linux"\nVERSION="40 (Container Image)"\nID=fedora\nVERSION_ID=40\nPRETTY_NAME="Fedora Linux 40 (Container Image)"\n',
    },
    expected: 'Fedora - 40',
  },
  {
    name: 'openSUSE Leap 15.6 (os-release only)',
    files: {
      '/etc/os-release':
        'NAME="openSUSE Leap"\nVERSION="15.6"\nID="opensuse-leap"\nVERSION_ID="15.6"\nPRETTY_NAME="openSUSE Leap 15.6"\n',
    },
    expected: 'Raspbian - 15.6',
  },
  {
    name: 'Linux without release files',
    files: {},
    expected: null,
  },
  {
    name: 'Linux Mint 21.3',
    files: {
      '/etc/lsb-release':
        'DISTRIB_ID=LinuxMint\nDISTRIB_RELEASE=21.3\nDISTRIB_CODENAME=virginia\nDISTRIB_DESCRIPTION="Linux Mint 21.3 Virginia"\n',
      '/etc/debian_version': 'bookworm/sid\n',
    },
    expected: 'Linux Mint - 21.3',
  },
  {
    name: 'KDE neon',
    files: {
      '/etc/lsb-release':
        'DISTRIB_ID=neon\nDISTRIB_RELEASE=22.04\nDISTRIB_CODENAME=jammy\nDISTRIB_DESCRIPTION="KDE neon 6.0"\n',
    },
    expected: 'KDE neon - 22.04',
  },
  {
    name: 'elementary OS 7',
    files: {
      '/etc/lsb-release':
        'DISTRIB_ID="elementary"\nDISTRIB_RELEASE=7\nDISTRIB_CODENAME=horus\nDISTRIB_DESCRIPTION="elementary OS 7 Horus"\n',
    },
    expected: null,
  },
  {
    name: 'Pop!_OS (lsb-release names no known distribution)',
    files: {
      '/etc/lsb-release':
        'DISTRIB_ID=Pop\nDISTRIB_RELEASE=22.04\nDISTRIB_CODENAME=jammy\nDISTRIB_DESCRIPTION="Pop!_OS 22.04 LTS"\n',
    },
    expected: null,
  },
  {
    name: 'lsb-release naming Ubuntu and Mint',
    files: {
      '/etc/lsb-release':
        'DISTRIB_ID=Ubuntu\nDISTRIB_RELEASE=20.04\nDISTRIB_DESCRIPTION="Linux Mint on Ubuntu"\n',
    },
    expected: 'Linux Mint - 20.04',
  },
  {
    name: 'Manjaro',
    files: {
      '/etc/lsb-release':
        'DISTRIB_ID="ManjaroLinux"\nDISTRIB_RELEASE="24.0.0"\nDISTRIB_CODENAME="Wynsdey"\nDISTRIB_DESCRIPTION="Manjaro Linux"\n',
      '/etc/arch-release': '',
    },
    expected: 'Manjaro Linux - "24.0.0"',
  },
  {
    name: 'Arch Linux (empty arch-release)',
    files: {
      '/etc/arch-release': '',
      '/etc/os-release': 'NAME="Arch Linux"\nID=arch\nBUILD_ID=rolling\n',
    },
    expected: null,
  },
  {
    name: 'Arch Linux with lsb-release',
    files: {
      '/etc/lsb-release':
        'DISTRIB_ID="Arch"\nDISTRIB_RELEASE="rolling"\nDISTRIB_DESCRIPTION="Arch Linux"\n',
      '/etc/arch-release': '',
    },
    expected: 'Arch Linux - "rolling"',
  },
  {
    name: 'Alpine with an empty alpine-release',
    files: {
      '/etc/alpine-release': '',
    },
    expected: 'Alpine Linux - ',
  },
  {
    name: 'Gentoo (no release logic)',
    files: {
      '/etc/gentoo-release': 'Gentoo Base System release 2.15\n',
    },
    expected: null,
  },
  {
    name: 'old SUSE with SuSE-release',
    files: {
      '/etc/SuSE-release':
        'SUSE Linux Enterprise Server 11 (x86_64)\nVERSION = 11\nPATCHLEVEL = 4\n',
    },
    expected: 'SUSE Linux - 11',
  },
  {
    name: 'Wolfi (os-release without quotes)',
    files: {
      '/etc/os-release':
        'ID=wolfi\nNAME="Wolfi"\nPRETTY_NAME="Wolfi"\nVERSION_ID=20230201\n',
    },
    expected: null,
  },
  {
    name: 'Scientific Linux 7',
    files: {
      '/etc/redhat-release': 'Scientific Linux release 7.9 (Nitrogen)\n',
    },
    expected: null,
  },
  {
    name: 'Oracle Linux 8',
    files: {
      '/etc/oracle-release': 'Oracle Linux Server release 8.9\n',
      '/etc/redhat-release': 'Red Hat Enterprise Linux release 8.9 (Ootpa)\n',
    },
    expected: 'Red Hat Linux - 8.9',
  },
  {
    name: 'Fedora with a one-digit release',
    files: {
      '/etc/fedora-release': 'Fedora release 9\n',
    },
    expected: null,
  },
  {
    name: 'Debian with debian_version as a folder',
    files: {
      '/etc/debian_version': null,
      '/etc/os-release': 'NAME="Debian GNU/Linux"\nVERSION_ID="12"\n',
    },
    expected: 'Raspbian - 12',
  },
  {
    name: 'Debian, lsb_release without a Release line',
    files: {
      '/etc/debian_version': '12.7\n',
    },
    lsb: 'Distributor ID:\tDebian\n',
    expected: null,
  },
];

describe('getLinuxVersion', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'linux-version-test-'));
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(fixtures)(
    'matches getos on $name',
    async ({ files, lsb, expected }) => {
      writeFiles(root, files);
      mockLsbRelease(lsb === undefined ? undefined : { stdout: lsb });

      expect((await getLinuxVersion(root)) ?? null).toBe(expected);
    }
  );
});

const debianFiles = {
  '/etc/debian_version': '12.7\n',
  '/etc/os-release': 'NAME="Debian GNU/Linux"\nVERSION_ID="12"\n',
};

type PlatformCase = {
  name: string;
  platform: NodeJS.Platform;
  files: Record<string, string>;
  lsb?: LsbRelease;
  /** A file whose read fails with EACCES */
  unreadable?: string;
  /** What platform.ts with getos 3.2.1 sent */
  expected: string;
};

// The expected values come from running platform.ts with getos 3.2.1 on the
// same files and lsb_release answers.
const platformCases: PlatformCase[] = [
  {
    name: 'macOS',
    platform: 'darwin',
    files: debianFiles,
    expected: '<kernel>',
  },
  {
    name: 'Windows',
    platform: 'win32',
    files: debianFiles,
    expected: '<kernel>',
  },
  {
    name: 'Linux without release files',
    platform: 'linux',
    files: {},
    expected: '<kernel>',
  },
  {
    name: 'Debian, lsb_release present',
    platform: 'linux',
    files: debianFiles,
    lsb: {
      stdout: 'Distributor ID:\tDebian\nRelease:\t12\nCodename:\tbookworm\n',
    },
    expected: 'Debian - 12',
  },
  {
    name: 'Debian, lsb_release missing',
    platform: 'linux',
    files: debianFiles,
    expected: 'Debian - 12.7',
  },
  {
    name: 'Debian, lsb_release exits with 1',
    platform: 'linux',
    files: debianFiles,
    lsb: { exitCode: 1 },
    expected: 'Debian - 12.7',
  },
  {
    name: 'Debian, lsb_release answers late',
    platform: 'linux',
    files: debianFiles,
    lsb: { stdout: 'Release:\t12\n', delayMs: 200 },
    expected: 'Debian - 12',
  },
  {
    name: 'Debian, debian_version unreadable',
    platform: 'linux',
    files: debianFiles,
    unreadable: '/etc/debian_version',
    expected: '<kernel>',
  },
  {
    name: 'Ubuntu, lsb-release unreadable',
    platform: 'linux',
    files: {
      '/etc/lsb-release': 'DISTRIB_ID=Ubuntu\nDISTRIB_RELEASE=22.04\n',
      '/etc/os-release': 'NAME="Ubuntu"\nVERSION_ID="22.04"\n',
    },
    unreadable: '/etc/lsb-release',
    expected: '<kernel>',
  },
];

describe('the osVersion sent to the API', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-info-test-'));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it.each(platformCases)(
    'matches getos on $name',
    async ({ platform: name, files, lsb, unreadable, expected }) => {
      writeFiles(root, files);
      mockLsbRelease(lsb);
      vi.mocked(platform).mockReturnValue(name);
      vi.mocked(release).mockReturnValue('<kernel>');
      // The release files are read from root instead of /
      const { stat, readFile } = fsp;
      vi.spyOn(fsp, 'stat').mockImplementation((file) =>
        stat(path.join(root, String(file)))
      );
      vi.spyOn(fsp, 'readFile').mockImplementation(((file: string) =>
        file === unreadable
          ? Promise.reject(
              Object.assign(
                new Error(`EACCES: permission denied, open '${file}'`),
                {
                  code: 'EACCES',
                }
              )
            )
          : readFile(path.join(root, file), 'utf8')) as typeof fsp.readFile);

      expect((await _getPlatformInfo()).osVersion).toBe(expected);
    }
  );
});
