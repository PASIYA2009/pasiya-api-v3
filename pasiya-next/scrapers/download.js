// Video downloads (YouTube / TikTok / Facebook / Instagram). yt-dlp cannot run on Vercel, so these endpoints
// forward to the SEPARATE downloader service (the original pasiya-scraper-api, hosted on Railway / Render / a VPS).
// Set SCRAPER_URL + SCRAPER_SHARED_SECRET to switch them on. Until then they answer 503 and cost nothing.
import { param } from '../system/util.js';

const DL = (ex) => [param('url', ex, 'Public video link'), param('rightsConfirmed', 'true', 'Must be true: you own the media or have permission to download it'), param('type', 'video', 'video or audio', false)];
const dl = (site, name, ex, what) => ({ path: `/api/scraper/${site}/download`, remote: `${site}/download`, category: 'Social', name: `${name} download`, cost: 2, desc: `Temporary download link for ${what}`, params: DL(ex) });

export default [
  dl('youtube', 'YouTube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'a public video (video or audio)'),
  dl('tiktok', 'TikTok', 'https://www.tiktok.com/@user/video/123', 'a public TikTok video'),
  dl('facebook', 'Facebook', 'https://www.facebook.com/watch/?v=123', 'a public Facebook video'),
  dl('instagram', 'Instagram', 'https://www.instagram.com/reel/abc/', 'a public Instagram reel / video')
];
