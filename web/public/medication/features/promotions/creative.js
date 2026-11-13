export function renderCreative(container, { mediaType, mediaUrl, url, title }, onError) {
  container.replaceChildren();
  if (!mediaUrl || !["image", "video"].includes(mediaType)) return;
  const media = document.createElement(mediaType === "video" ? "video" : "img");
  media.src = mediaUrl;
  media.referrerPolicy = "no-referrer";
  media.addEventListener("error", () => {
    if (!container.contains(media)) return;
    container.replaceChildren();
    onError?.();
  });
  if (mediaType === "video") {
    media.controls = true;
    media.playsInline = true;
    media.preload = "none";
    media.setAttribute("aria-label", title);
    container.append(media);
    return;
  }
  media.alt = title;
  if (!url) {
    container.append(media);
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.append(media);
  container.append(link);
}
