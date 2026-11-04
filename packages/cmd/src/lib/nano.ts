import { randomInt } from 'crypto';

const alphabet =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const getNanoid = (length = 16) =>
  Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
export const userFacingNanoid = () => getNanoid(12);
