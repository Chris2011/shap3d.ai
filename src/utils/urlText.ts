/** The host of `url` for display ("example.com"), or `url` itself when it is no valid URL. */
export const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};
