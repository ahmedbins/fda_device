// Apply the saved theme before the first paint on both Vinext and Cloudflare Pages.
(() => {
  let preference;
  try {
    preference = window.localStorage.getItem("regulatory:theme");
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }

  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme =
    preference === "light" || preference === "dark"
      ? preference
      : systemDark ? "dark" : "light";
})();
