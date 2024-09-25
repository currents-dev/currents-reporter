let _execa: null | (typeof import('execa'))['execa'];

export async function getExeca() {
  if (_execa) {
    return _execa;
  }
  const { execa } = await import('execa');
  _execa = execa;
  return execa;
}
