// ==UserScript==
// @name         DDYS Play History
// @namespace    https://ddys.pro/
// @version      1.0.0
// @description  记录 ddys.pro 的播放记录，并在首页显示历史悬浮窗
// @author       lemontea
// @match        https://ddys.pro/*
// @match        https://www.ddys.pro/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const STORAGE_KEY = "ddysPlayHistory";
  const COLLAPSE_KEY = "ddysHistoryOverlayCollapsed";
  const OVERLAY_ID = "ddys-history-overlay";
  const STYLE_ID = "ddys-history-overlay-style";
  const MAX_ITEMS = 50;
  const PROGRESS_SAVE_INTERVAL_MS = 15_000;
  const MIN_SECONDS_BEFORE_SAVE = 3;

  const isHomePage = () => {
    const normalized = location.pathname.replace(/\/+/g, "/");
    return normalized === "/" || normalized === "/index.php";
  };

  const loadHistory = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.warn("[DDYS History] Failed to parse stored history.", err);
      return [];
    }
  };

  const saveHistory = (items) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.warn("[DDYS History] Failed to save history.", err);
    }
  };

  const upsertHistoryItem = (entry) => {
    const items = loadHistory();
    const existingIndex = items.findIndex((item) => item.id === entry.id);
    if (existingIndex !== -1) {
      const existing = items[existingIndex];
      entry.createdAt =
        existing.createdAt || existing.recordedAt || entry.recordedAt;
      items.splice(existingIndex, 1);
    } else if (!entry.createdAt) {
      entry.createdAt = entry.recordedAt;
    }
    items.unshift(entry);
    if (items.length > MAX_ITEMS) {
      items.length = MAX_ITEMS;
    }
    saveHistory(items);
  };

  const getCollapseState = () => localStorage.getItem(COLLAPSE_KEY) === "1";
  const setCollapseState = (collapsed) => {
    if (collapsed) {
      localStorage.setItem(COLLAPSE_KEY, "1");
    } else {
      localStorage.removeItem(COLLAPSE_KEY);
    }
  };

  const ensureOverlayStyle = () => {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 320px;
        max-height: 60vh;
        display: flex;
        flex-direction: column;
        background: rgba(20, 20, 20, 0.92);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        border-radius: 10px;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
        overflow: hidden;
        z-index: 99999;
        backdrop-filter: blur(10px);
      }
      #${OVERLAY_ID}.collapsed {
        height: auto;
        max-height: none;
      }
      #${OVERLAY_ID} a {
        color: inherit;
        text-decoration: none;
      }
      #${OVERLAY_ID} button {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        font: inherit;
        padding: 0;
      }
      #${OVERLAY_ID} button:focus-visible,
      #${OVERLAY_ID} a:focus-visible {
        outline: 2px solid #f3b028;
        outline-offset: 2px;
      }
      #${OVERLAY_ID} .ddys-history-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.06);
      }
      #${OVERLAY_ID} .ddys-history-header h2 {
        margin: 0;
        font-size: 15px;
        letter-spacing: 0.4px;
      }
      #${OVERLAY_ID} .ddys-history-actions {
        display: flex;
        gap: 10px;
      }
      #${OVERLAY_ID} .ddys-history-actions button {
        opacity: 0.8;
        transition: opacity 0.2s ease;
      }
      #${OVERLAY_ID} .ddys-history-actions button:hover {
        opacity: 1;
      }
      #${OVERLAY_ID} .ddys-history-body {
        overflow-y: auto;
        padding: 10px 0;
      }
      #${OVERLAY_ID} .ddys-history-empty {
        padding: 16px 18px;
        color: rgba(255, 255, 255, 0.7);
        text-align: center;
      }
      #${OVERLAY_ID} .ddys-history-item {
        display: flex;
        gap: 10px;
        padding: 10px 18px;
        transition: background 0.2s ease;
      }
      #${OVERLAY_ID} .ddys-history-item:hover {
        background: rgba(243, 176, 40, 0.15);
      }
      #${OVERLAY_ID} .ddys-history-thumb {
        flex: 0 0 46px;
        height: 62px;
        border-radius: 6px;
        background-size: cover;
        background-position: center;
        background-color: rgba(255, 255, 255, 0.08);
      }
      #${OVERLAY_ID} .ddys-history-info {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      #${OVERLAY_ID} .ddys-history-title {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${OVERLAY_ID} .ddys-history-episode {
        color: rgba(255, 255, 255, 0.75);
        font-size: 13px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${OVERLAY_ID} .ddys-history-progress {
        color: rgba(255, 255, 255, 0.65);
        font-size: 12px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${OVERLAY_ID} time {
        color: rgba(255, 255, 255, 0.55);
        font-size: 12px;
      }
      #${OVERLAY_ID}.collapsed .ddys-history-body {
        display: none;
      }
    `;
    document.head.appendChild(style);
  };

  const formatTimestamp = (value) => {
    try {
      return new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(value);
    } catch (err) {
      return new Date(value).toLocaleString();
    }
  };

  const parseSeasonEpisodeInfo = (trackCount) => {
    const normalizedPath = location.pathname
      .replace(/\/+/g, "/")
      .replace(/\/$/, "/");
    const segments = normalizedPath.split("/").filter(Boolean);
    const slug = segments.join("/") || normalizedPath || "/";
    let season = 1;
    let seasonFromPath = null;
    if (segments.length > 1) {
      const lastSegment = segments[segments.length - 1];
      const secondSegment = segments[1];
      if (/^\d+$/.test(lastSegment)) {
        seasonFromPath = lastSegment;
      } else if (/^\d+$/.test(secondSegment)) {
        seasonFromPath = secondSegment;
      }
    }
    if (seasonFromPath) {
      season = Math.max(1, parseInt(seasonFromPath, 10));
    }

    const params = new URLSearchParams(location.search);
    const epParam = params.get("ep");
    const episode =
      epParam && /^\d+$/.test(epParam) ? Math.max(1, parseInt(epParam, 10)) : 1;

    const isMovie =
      !epParam && (!seasonFromPath || season === 1) && trackCount <= 1;
    const seasonEpisodeLabel = isMovie
      ? "电影"
      : `第${season}季 第${episode}集`;

    return {
      slug,
      season,
      episode,
      isMovie,
      seasonEpisodeLabel,
    };
  };

  const pad2 = (value) => value.toString().padStart(2, "0");

  const formatHmsText = (seconds) => {
    if (!Number.isFinite(seconds)) {
      return "0小时0分0秒";
    }
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hours}小时${minutes}分${secs}秒`;
  };

  const renderHistoryOverlay = () => {
    if (!isHomePage()) {
      return;
    }
    ensureOverlayStyle();
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.remove();
    }

    const collapsed = getCollapseState();
    const history = loadHistory();
    const container = document.createElement("div");
    container.id = OVERLAY_ID;
    if (collapsed) {
      container.classList.add("collapsed");
    }

    const bodyContent = history.length
      ? history
          .map((item) => {
            const thumb = item.poster || "";
            const timeLabel = formatTimestamp(item.recordedAt || Date.now());
            const safeEpisode =
              item.seasonEpisodeLabel ||
              item.episodeDisplay ||
              item.episode ||
              "";
            const progressLabel = formatHmsText(
              item.playbackSeconds ?? item.positionSeconds ?? 0
            );
            const safeTitle = item.title || "未知标题";
            const bgStyle = thumb
              ? `style="background-image:url('${thumb.replace(/\"/g, "%22")}')"`
              : "";
            return `
              <a class="ddys-history-item" href="${item.pageUrl}">
                <span class="ddys-history-thumb" ${bgStyle}></span>
                <span class="ddys-history-info">
                  <span class="ddys-history-title">${safeTitle}</span>
                  <span class="ddys-history-episode">${safeEpisode}</span>
                  <span class="ddys-history-progress">播放到 ${progressLabel}</span>
                  <time>${timeLabel}</time>
                </span>
              </a>
            `;
          })
          .join("")
      : `<div class="ddys-history-empty">暂无播放记录</div>`;

    container.innerHTML = `
      <div class="ddys-history-header">
        <h2>播放历史</h2>
        <div class="ddys-history-actions">
          <button type="button" data-action="toggle">${
            collapsed ? "展开" : "收起"
          }</button>
          <button type="button" data-action="clear"${
            history.length ? "" : " disabled"
          }>清空</button>
        </div>
      </div>
      <div class="ddys-history-body">
        ${bodyContent}
      </div>
    `;

    container.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const action = target.getAttribute("data-action");
      if (!action) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (action === "toggle") {
        const nextCollapsed = !container.classList.contains("collapsed");
        container.classList.toggle("collapsed", nextCollapsed);
        setCollapseState(nextCollapsed);
        target.textContent = nextCollapsed ? "展开" : "收起";
      } else if (action === "clear") {
        saveHistory([]);
        renderHistoryOverlay();
      }
    });

    document.body.appendChild(container);
  };

  const pickPoster = (tracks) => {
    const toAbsoluteUrl = (url) => {
      if (!url) {
        return "";
      }
      try {
        return new URL(url, location.href).href;
      } catch (err) {
        return url;
      }
    };

    const getImageSrc = (img) => {
      if (!img) {
        return "";
      }
      const sources = [
        img.getAttribute("data-original"),
        img.getAttribute("data-src"),
        img.getAttribute("data-lazy-src"),
        img.getAttribute("data-lazy"),
        img.getAttribute("data-cover"),
        img.getAttribute("src"),
      ];
      let src = sources.find(Boolean);
      if (!src) {
        const srcset =
          img.getAttribute("data-srcset") || img.getAttribute("srcset");
        if (srcset) {
          src = srcset.split(",")[0].trim().split(" ")[0];
        }
      }
      return toAbsoluteUrl(src);
    };

    const seen = new Set();
    const candidates = [];
    const pushCandidate = (img, weight) => {
      const src = getImageSrc(img);
      if (!src || seen.has(src)) {
        return;
      }
      seen.add(src);
      candidates.push({
        src,
        weight,
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
        parentClass: img.parentElement?.className || "",
        parentTag: img.parentElement?.tagName || "",
      });
    };

    const prioritySelectors = [
      ".post img",
      ".entry-content img",
      ".content-area img",
      "article img",
      ".single img",
    ];
    prioritySelectors.forEach((selector, idx) => {
      document
        .querySelectorAll(selector)
        .forEach((img) => pushCandidate(img, 10 - idx));
    });
    Array.from(document.images || []).forEach((img) => pushCandidate(img, 0));

    const info = parseSeasonEpisodeInfo(tracks.length || 1);
    const slugKeywords = [];
    if (info?.slug) {
      const slugParts = info.slug.split("/");
      const baseSlug = slugParts[0] || "";
      if (baseSlug) {
        const lowered = baseSlug.toLowerCase();
        const cleaned = lowered.replace(/[^a-z0-9]/g, "");
        slugKeywords.push(lowered);
        if (cleaned && cleaned !== lowered) {
          slugKeywords.push(cleaned);
        }
      }
    }

    const pickBy = (predicate) => {
      const found = candidates.find(predicate);
      return found ? found.src : "";
    };

    const byDouban = pickBy((candidate) =>
      candidate.src.includes("/douban_cache/")
    );
    if (byDouban) {
      return byDouban;
    }

    if (slugKeywords.length) {
      const bySlug = pickBy((candidate) =>
        slugKeywords.some(
          (keyword) => keyword && candidate.src.toLowerCase().includes(keyword)
        )
      );
      if (bySlug) {
        return bySlug;
      }
    }

    const byParent = pickBy((candidate) =>
      /post|entry|content/i.test(candidate.parentClass || "")
    );
    if (byParent) {
      return byParent;
    }

    const bySize = pickBy(
      (candidate) => candidate.width >= 120 && candidate.height >= 120
    );
    if (bySize) {
      return bySize;
    }

    const trackPoster = tracks.find((track) => track?.image?.src)?.image?.src;
    if (trackPoster) {
      return toAbsoluteUrl(trackPoster);
    }
    return "";
  };

  const normaliseEpisodeLabel = (element) => {
    if (!element) {
      return "";
    }
    const text = element.textContent || "";
    return text.replace(/\s+/g, " ").trim();
  };

  const initPlaylistTracking = () => {
    const playlistScript = document.querySelector(".wp-playlist-script");
    const playlistRoot = document.querySelector(".wp-playlist");
    if (!playlistScript || !playlistRoot) {
      return false;
    }

    const signature = playlistScript.textContent;
    if (playlistRoot.dataset.ddysHistoryBound === signature) {
      return true;
    }

    if (playlistRoot.__ddysHistoryObservers) {
      playlistRoot.__ddysHistoryObservers.forEach((observer) =>
        observer.disconnect()
      );
      playlistRoot.__ddysHistoryObservers = null;
    }
    if (playlistRoot.__ddysHistoryClickHandler) {
      playlistRoot.removeEventListener(
        "click",
        playlistRoot.__ddysHistoryClickHandler
      );
      playlistRoot.__ddysHistoryClickHandler = null;
    }
    if (playlistRoot.__ddysHistoryVideoCleanup) {
      playlistRoot.__ddysHistoryVideoCleanup();
      playlistRoot.__ddysHistoryVideoCleanup = null;
    }
    if (playlistRoot.__ddysHistoryVideoObserver) {
      playlistRoot.__ddysHistoryVideoObserver.disconnect();
      playlistRoot.__ddysHistoryVideoObserver = null;
    }
    if (playlistRoot.__ddysHistoryVideoRetry) {
      clearInterval(playlistRoot.__ddysHistoryVideoRetry);
      playlistRoot.__ddysHistoryVideoRetry = null;
    }

    let parsed;
    try {
      parsed = JSON.parse(playlistScript.textContent);
    } catch (err) {
      console.warn("[DDYS History] Failed to parse playlist JSON.", err);
      return false;
    }
    const tracks = Array.isArray(parsed?.tracks) ? parsed.tracks : [];
    if (!tracks.length) {
      return false;
    }

    const pageTitle =
      (
        document.querySelector("h1.entry-title") || document.querySelector("h1")
      )?.textContent?.trim() ||
      document.title.replace(/\\s*-\\s*低端影视/i, "").trim();
    const playlistItems = Array.from(
      playlistRoot.querySelectorAll(".wp-playlist-item")
    );
    if (!playlistItems.length) {
      return false;
    }

    const poster = pickPoster(tracks);

    const recordForIndex = (index, meta = {}) => {
      if (index < 0 || index >= tracks.length) {
        return null;
      }
      const track = tracks[index];
      const itemElement = playlistItems[index];
      const episodeLabel = normaliseEpisodeLabel(
        itemElement?.querySelector(".wp-playlist-caption") || itemElement
      );
      const info = parseSeasonEpisodeInfo(tracks.length);
      const idSuffix = info.isMovie
        ? `${info.slug}|movie`
        : `${info.slug}|s${pad2(info.season)}e${pad2(info.episode)}`;
      const entry = {
        id: `${location.pathname}|${idSuffix}`,
        pageUrl: location.href,
        title: pageTitle,
        episode: track.caption || episodeLabel,
        episodeDisplay: episodeLabel,
        season: info.season,
        episodeNumber: info.episode,
        seasonEpisodeLabel: info.seasonEpisodeLabel,
        trackIndex: index,
        recordedAt: Date.now(),
        poster,
        playbackSeconds: meta.playbackSeconds ?? meta.positionSeconds ?? 0,
        durationSeconds: meta.durationSeconds ?? null,
        isMovie: info.isMovie,
      };
      upsertHistoryItem(entry);
      window.dispatchEvent(new CustomEvent("ddys-history-updated"));
      return entry;
    };

    const bindVideoTracking = () => {
      const video = playlistRoot.querySelector("video");
      if (!video) {
        return false;
      }
      if (video.dataset.ddysHistoryBound === "1") {
        return true;
      }
      video.dataset.ddysHistoryBound = "1";

      let lastSaved = 0;
      let hasStartedPlayback = false;

      const getActiveIndex = () => {
        const current = playlistRoot.querySelector(
          ".wp-playlist-item.wp-playlist-playing"
        );
        const index = playlistItems.indexOf(current);
        return index !== -1 ? index : 0;
      };

      const saveProgress = (reason, { force } = {}) => {
        const now = Date.now();
        if (!force && now - lastSaved < PROGRESS_SAVE_INTERVAL_MS) {
          return;
        }
        const currentTime = Number.isFinite(video.currentTime)
          ? video.currentTime
          : 0;
        if (!force && currentTime < MIN_SECONDS_BEFORE_SAVE) {
          return;
        }
        const durationSeconds =
          Number.isFinite(video.duration) && video.duration > 0
            ? video.duration
            : null;
        const entry = recordForIndex(getActiveIndex(), {
          playbackSeconds: currentTime,
          durationSeconds,
          reason,
        });
        if (entry) {
          lastSaved = now;
        }
      };

      const onPlay = () => {
        hasStartedPlayback = true;
        saveProgress("play", { force: true });
      };
      const onTimeUpdate = () => {
        if (!hasStartedPlayback) {
          return;
        }
        saveProgress("timeupdate");
      };
      const onPause = () => {
        if (!hasStartedPlayback) {
          return;
        }
        saveProgress("pause", { force: true });
      };
      const onEnded = () => {
        if (!hasStartedPlayback) {
          return;
        }
        saveProgress("ended", { force: true });
        hasStartedPlayback = false;
      };

      video.addEventListener("play", onPlay);
      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("pause", onPause);
      video.addEventListener("ended", onEnded);

      playlistRoot.__ddysHistoryVideoCleanup = () => {
        video.removeEventListener("play", onPlay);
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("ended", onEnded);
        delete video.dataset.ddysHistoryBound;
      };

      return true;
    };

    const clickHandler = () => {
      setTimeout(bindVideoTracking, 200);
    };
    playlistRoot.__ddysHistoryClickHandler = clickHandler;
    playlistRoot.addEventListener("click", clickHandler);

    const initialBind = bindVideoTracking();
    if (!initialBind) {
      const retry = setInterval(() => {
        if (bindVideoTracking()) {
          clearInterval(retry);
          playlistRoot.__ddysHistoryVideoRetry = null;
        }
      }, 500);
      playlistRoot.__ddysHistoryVideoRetry = retry;
    }

    const videoObserver = new MutationObserver(() => {
      bindVideoTracking();
    });
    videoObserver.observe(playlistRoot, { childList: true, subtree: true });
    playlistRoot.__ddysHistoryVideoObserver = videoObserver;

    playlistRoot.dataset.ddysHistoryBound = signature;
    return true;
  };

  const schedulePlaylistInit = () => {
    let attempts = 0;
    const limit = 12;
    const timer = setInterval(() => {
      attempts += 1;
      if (initPlaylistTracking() || attempts >= limit) {
        clearInterval(timer);
      }
    }, 500);
  };

  const watchPlaylistChanges = () => {
    if (!document.body) {
      return;
    }
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          if (
            node.matches(".wp-playlist, .wp-playlist-script") ||
            node.querySelector(".wp-playlist-script")
          ) {
            setTimeout(initPlaylistTracking, 200);
            return;
          }
          if (node.matches("video") || node.querySelector("video")) {
            setTimeout(initPlaylistTracking, 200);
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  const init = () => {
    schedulePlaylistInit();
    watchPlaylistChanges();
    if (isHomePage()) {
      renderHistoryOverlay();
      window.addEventListener("ddys-history-updated", renderHistoryOverlay);
      window.addEventListener("storage", (event) => {
        if (event.key === STORAGE_KEY) {
          renderHistoryOverlay();
        }
      });
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
