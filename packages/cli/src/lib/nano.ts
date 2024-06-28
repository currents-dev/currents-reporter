import { customAlphabet } from "nanoid";

const alphabet =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
export const getNanoid = (length = 16) => customAlphabet(alphabet, length)();
export const userFacingNanoid = customAlphabet(alphabet, 12);
