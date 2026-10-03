/**
 * Removes the user and password of a URL, as in
 * `https://user:token@github.com/o/r.git`. A remote with a token in it must not
 * reach the API or the debug output.
 */
export function removeAuthFromUrl(url: string) {
  // Up to the last `@` before the path, query or fragment: a user name can hold
  // an unencoded `@`, as in `https://me@corp.com:token@gitlab.com/r`.
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/?#\s]*@/i, '$1');
}

/**
 * A URL for debug output: no user, password, query or fragment. The query of a
 * signed storage URL is the credential.
 */
export function urlForLog(url: string) {
  return removeAuthFromUrl(url).replace(/[?#].*$/, '');
}
