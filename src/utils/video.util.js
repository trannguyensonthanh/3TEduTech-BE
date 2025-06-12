const logger = require('./logger');

/**
 * Trích xuất YouTube Video ID từ các dạng URL khác nhau.
 * @param {string} url - URL của video YouTube.
 * @returns {string|null} Video ID hoặc null nếu không tìm thấy.
 */
const extractYoutubeId = (url) => {
  if (!url || typeof url !== 'string') return null;

  const youtubeRegex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/ ]{11})/;
  const match = url.match(youtubeRegex);

  if (match && match[1]) {
    return match[1];
  }

  try {
    const urlObj = new URL(url);
    if (
      urlObj.hostname.includes('youtube.com') ||
      urlObj.hostname === 'youtu.be'
    ) {
      if (urlObj.hostname === 'youtu.be') {
        const pathId = urlObj.pathname.split('/')[1];
        if (pathId && pathId.length === 11) return pathId;
      }
      if (urlObj.pathname.includes('/shorts/')) {
        const pathId = urlObj.pathname.split('/shorts/')[1]?.split(/[?#]/)[0];
        if (pathId && pathId.length === 11) return pathId;
      }
      const videoId = urlObj.searchParams.get('v');
      if (videoId && videoId.length === 11) {
        return videoId;
      }
    }
  } catch (error) {
    //
  }

  logger.warn(`Could not extract YouTube ID from URL: ${url}`);
  return null;
};

/**
 * Trích xuất Vimeo Video ID từ các dạng URL khác nhau.
 * @param {string} url - URL của video Vimeo.
 * @returns {string|null} Video ID hoặc null nếu không tìm thấy.
 */
const extractVimeoId = (url) => {
  if (!url || typeof url !== 'string') return null;

  const vimeoRegex =
    /(?:vimeo\.com\/(?:[^\/]+\/videos\/|video\/|channels\/(?:[^\/]+\/)?|groups\/(?:[^\/]+\/videos\/)?)?|player\.vimeo\.com\/video\/)([0-9]+)/;
  const match = url.match(vimeoRegex);

  if (match && match[1]) {
    return match[1];
  }

  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.includes('vimeo.com')) {
      const pathParts = urlObj.pathname.split('/');
      for (let i = pathParts.length - 1; i >= 0; i -= 1) {
        if (/^\d+$/.test(pathParts[i])) {
          return pathParts[i];
        }
      }
    }
  } catch (error) {
    //
  }

  logger.warn(`Could not extract Vimeo ID from URL: ${url}`);
  return null;
};

module.exports = {
  extractYoutubeId,
  extractVimeoId,
};
