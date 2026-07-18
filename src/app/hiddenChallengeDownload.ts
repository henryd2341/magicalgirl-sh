const HIDDEN_CHALLENGE_SUFFIX = "/hiddenchallenge";

export function handleHiddenChallengeDownload(): boolean {
  const { pathname, search, hash } = window.location;
  if (!pathname.endsWith(HIDDEN_CHALLENGE_SUFFIX)) {
    return false;
  }

  const returnPath = pathname.slice(0, -HIDDEN_CHALLENGE_SUFFIX.length) || "/";
  const resourceBase = returnPath === "/" ? "" : returnPath.replace(/\/$/, "");
  const download = document.createElement("a");
  download.href = `${resourceBase}/puzzle.png`;
  download.download = "puzzle.png";
  download.hidden = true;
  document.body.append(download);
  download.click();
  download.remove();

  window.history.replaceState(
    window.history.state,
    "",
    `${returnPath}${search}${hash}`,
  );
  return true;
}