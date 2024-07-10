import getos from "getos";
import { memoize } from "lodash";
import { freemem, platform, release, totalmem } from "os";
import { promisify } from "util";

const getOsVersion = async () => {
  if (platform() === "linux") {
    try {
      const linuxOs = await promisify(getos)();
      if ("dist" in linuxOs && "release" in linuxOs) {
        return [linuxOs.dist, linuxOs.release].join(" - ");
      } else {
        return release();
      }
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
