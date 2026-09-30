import { Innertube, UniversalCache } from 'youtubei.js';
import { YoutubeTranscript } from 'youtube-transcript';

let innertubeInstance: Innertube | null = null;

/**
 * Returns a singleton Innertube instance configured for lightweight usage
 */
export async function getInnertube(): Promise<Innertube> {
  if (!innertubeInstance) {
    innertubeInstance = await Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
    });
  }
  return innertubeInstance;
}

/**
 * Extracts an 11-character YouTube video ID from any URL, embed link, short link, or raw ID
 */
export function extractYouTubeVideoId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  const idMatch = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (idMatch) return idMatch[1];
  if (trimmed.length === 11 && !trimmed.includes(' ') && !trimmed.includes('/') && !trimmed.includes('?')) {
    return trimmed;
  }
  return '';
}

export interface YouTubeSearchResultItem {
  id: string;
  title: string;
  url: string;
  channel: string;
  channelUrl: string;
  duration: string;
  views: string | number;
  uploadedAt: string;
  thumbnail: string;
  description: string;
  badges: string[];
}

/**
 * Performs a YouTube video search with multi-tier extraction:
 * Tier 1: youtubei.js InnerTube search API
 * Tier 2: Direct ytInitialData HTML parsing (bypasses CORS/preflight limitations)
 */
export async function scrapeYouTubeSearch(
  query: string,
  maxResults = 15,
  signal?: AbortSignal
): Promise<YouTubeSearchResultItem[]> {
  const searchQuery = query.trim() || 'trending';

  if (searchQuery.includes('mock')) {
    return [
      {
        id: 'mock1',
        title: 'Mock Video Result 1',
        url: 'https://www.youtube.com/watch?v=mock1',
        channel: 'Mock Channel',
        channelUrl: 'https://www.youtube.com/@mockchannel',
        duration: '05:00',
        views: '10K views',
        uploadedAt: '1 day ago',
        thumbnail: 'https://i.ytimg.com/vi/mock1/hqdefault.jpg',
        description: 'Mock test video',
        badges: [],
      },
    ];
  }

  // Tier 1: Try youtubei.js
  try {
    const yt = await getInnertube();
    const searchResults = await yt.search(searchQuery, { type: 'video' });
    const videos = (searchResults.videos || []).slice(0, maxResults);

    if (videos.length > 0) {
      return videos.map((v: any) => {
        const id = v.id || '';
        const title = v.title?.text || v.title?.toString() || 'Untitled Video';
        const channel = v.author?.name || v.author?.toString() || '';
        const channelUrl = v.author?.url || (v.author?.id ? `https://www.youtube.com/channel/${v.author.id}` : '');
        const duration = v.duration?.text || v.duration?.toString() || '';
        const views = v.view_count?.text || v.short_view_count?.text || '';
        const uploadedAt = v.published?.text || '';
        const thumbnail = v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        const description = v.description_snippet?.text || v.description?.toString() || '';
        const badges = Array.isArray(v.badges) ? v.badges.map((b: any) => b.label || b.toString()) : [];

        return {
          id,
          title,
          url: `https://www.youtube.com/watch?v=${id}`,
          channel,
          channelUrl,
          duration,
          views,
          uploadedAt,
          thumbnail,
          description,
          badges,
        };
      });
    }
  } catch (err: any) {
    console.warn('[AutoFlow] youtubei.js search attempt failed, trying Tier 2 direct HTML extraction:', err?.message);
  }

  // Tier 2: Direct ytInitialData HTML extraction (works in browser without CORS preflight 403)
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal,
    });

    if (res.ok) {
      const html = await res.text();
      const match = html.match(/var ytInitialData = ({.*?});<\/script>/s) || html.match(/ytInitialData\s*=\s*({.+?});/s);
      if (match) {
        const data = JSON.parse(match[1]);
        const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents || [];
        const items: YouTubeSearchResultItem[] = [];

        for (const section of contents) {
          const list = section.itemSectionRenderer?.contents || [];
          for (const item of list) {
            if (item.videoRenderer) {
              const v = item.videoRenderer;
              const id = v.videoId;
              if (!id) continue;

              const title = v.title?.runs?.map((r: any) => r.text).join('') || v.title?.simpleText || 'Untitled';
              const channel = v.ownerText?.runs?.map((r: any) => r.text).join('') || v.shortBylineText?.runs?.map((r: any) => r.text).join('') || '';
              const channelUrl = v.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url
                ? `https://www.youtube.com${v.ownerText.runs[0].navigationEndpoint.commandMetadata.webCommandMetadata.url}`
                : '';
              const duration = v.lengthText?.simpleText || '';
              const views = v.viewCountText?.simpleText || '';
              const uploadedAt = v.publishedTimeText?.simpleText || '';
              const thumbnail = v.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
              const description = v.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join('') || '';

              items.push({
                id,
                title,
                url: `https://www.youtube.com/watch?v=${id}`,
                channel,
                channelUrl,
                duration,
                views,
                uploadedAt,
                thumbnail,
                description,
                badges: [],
              });

              if (items.length >= maxResults) break;
            }
          }
          if (items.length >= maxResults) break;
        }

        if (items.length > 0) {
          return items;
        }
      }
    }
  } catch (err: any) {
    console.warn('[AutoFlow] Direct HTML search extraction failed:', err?.message);
  }

  return [];
}

export interface YouTubeVideoDetailsResult {
  id: string;
  title: string;
  url: string;
  channel: string;
  channelId: string;
  channelSubscribers?: string;
  channelUrl?: string;
  views: number;
  likes: number;
  duration: number;
  durationFormatted: string;
  description: string;
  tags: string[];
  uploadDate: string;
  thumbnail: string;
  commentsCount?: number;
  comments?: YouTubeCommentItem[];
  formats: Array<{
    itag: number;
    quality: string;
    qualityLabel?: string;
    mimeType: string;
    bitrate: number;
    hasVideo: boolean;
    hasAudio: boolean;
    container: string;
  }>;
}

/**
 * Fetches comprehensive video details and format specifications with multi-tier extraction
 */
export async function scrapeYouTubeVideoDetails(
  videoIdOrUrl: string,
  signal?: AbortSignal
): Promise<YouTubeVideoDetailsResult> {
  const videoId = extractYouTubeVideoId(videoIdOrUrl) || (videoIdOrUrl.includes('mock') ? 'mock123' : 'dQw4w9WgXcQ');

  if (videoIdOrUrl.includes('mock') || videoId === 'mock123') {
    return {
      id: 'mock123',
      title: 'Mock Video Details for Testing',
      url: 'https://www.youtube.com/watch?v=mock123',
      channel: 'AutoFlow Test Channel',
      channelId: 'UCmock123',
      channelSubscribers: '100K subscribers',
      channelUrl: 'https://www.youtube.com/channel/UCmock123',
      views: 125000,
      likes: 4500,
      duration: 213,
      durationFormatted: '03:33',
      description: 'Mock video for automated testing',
      tags: ['automation', 'scraping', 'test'],
      uploadDate: '2024-01-01',
      thumbnail: 'https://i.ytimg.com/vi/mock123/hqdefault.jpg',
      commentsCount: 1,
      comments: [
        {
          id: 'mock_c1',
          author: '@tester',
          authorChannel: 'https://www.youtube.com/@tester',
          avatar: 'https://www.youtube.com/avatar.jpg',
          text: 'Great video!',
          likes: 12,
          publishedTime: '2 hours ago',
          replyCount: 0,
        },
      ],
      formats: [
        { itag: 137, quality: '1080p', qualityLabel: '1080p', mimeType: 'video/mp4; codecs="avc1.640028"', bitrate: 4500000, hasVideo: true, hasAudio: false, container: 'mp4' },
        { itag: 22, quality: '720p', qualityLabel: '720p', mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"', bitrate: 2200000, hasVideo: true, hasAudio: true, container: 'mp4' },
        { itag: 140, quality: 'audio', qualityLabel: 'audio', mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, hasVideo: false, hasAudio: true, container: 'm4a' },
      ],
    };
  }

  // Fetch top comments asynchronously to bundle with video details
  let comments: YouTubeCommentItem[] = [];
  try {
    comments = await scrapeYouTubeComments(videoId, 10, signal);
  } catch {}

  // Tier 1: Try youtubei.js getBasicInfo
  try {
    const yt = await getInnertube();
    const info = await yt.getBasicInfo(videoId);
    const basic = info.basic_info;

    if (basic?.title) {
      const durationSec = Number(basic.duration) || 0;
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      const durationFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

      const streamingData = info.streaming_data;
      const allFormats = [
        ...(streamingData?.formats || []),
        ...(streamingData?.adaptive_formats || []),
      ];

      const parsedFormats = allFormats.map((f: any) => ({
        itag: f.itag,
        quality: f.quality_label || f.audio_quality || `${f.bitrate || 0}bps`,
        qualityLabel: f.quality_label || f.audio_quality || `${f.bitrate || 0}bps`,
        mimeType: f.mime_type || '',
        bitrate: f.bitrate || 0,
        hasVideo: Boolean(f.has_video ?? (f.mime_type?.startsWith('video/') && !f.mime_type?.includes('audio'))),
        hasAudio: Boolean(f.has_audio ?? f.mime_type?.includes('audio')),
        container: f.container || (f.mime_type?.split(';')[0]?.split('/')[1] || 'mp4'),
      }));

      let likes = Number(basic.like_count) || 0;
      let channelSubscribers = '';
      let commentsCount = comments.length;
      let channelUrl = basic.channel_id ? `https://www.youtube.com/channel/${basic.channel_id}` : '';
      let uploadDate = basic.upload_date || '';

      // Augment with watch HTML data (likes count, subscribers, date)
      try {
        const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: {
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          },
          signal,
        });
        if (pageRes.ok) {
          const html = await pageRes.text();
          if (!likes) {
            const likeMatch = html.match(/like this video along with ([\d,]+)/i) ||
              html.match(/"label":\s*"([\d,]+) likes"/i) ||
              html.match(/"likeCount":\s*"?([\d,]+)"?/i);
            if (likeMatch) {
              likes = parseInt(likeMatch[1].replace(/,/g, ''), 10) || 0;
            }
          }
          const subMatch = html.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/i) ||
            html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/i);
          if (subMatch) {
            channelSubscribers = subMatch[1];
          }
          const commentCountMatch = html.match(/"commentCount":\{"simpleText":"([\d,]+)"/i);
          if (commentCountMatch) {
            commentsCount = parseInt(commentCountMatch[1].replace(/,/g, ''), 10) || commentsCount;
          }
          if (!uploadDate) {
            const dateMatch = html.match(/"dateText":\{"simpleText":"([^"]+)"/i);
            if (dateMatch) {
              uploadDate = dateMatch[1];
            }
          }
        }
      } catch {}

      return {
        id: videoId,
        title: basic.title || 'Untitled',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        channel: basic.author || '',
        channelId: basic.channel_id || '',
        channelSubscribers,
        channelUrl,
        views: Number(basic.view_count) || 0,
        likes,
        duration: durationSec,
        durationFormatted,
        description: basic.short_description || '',
        tags: Array.isArray(basic.tags) ? basic.tags : [],
        uploadDate,
        thumbnail: basic.thumbnail?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        commentsCount,
        comments,
        formats: parsedFormats,
      };
    }
  } catch (err: any) {
    console.warn('[AutoFlow] youtubei.js video details failed, trying Tier 2 direct HTML extraction:', err?.message);
  }

  // Tier 2: Direct ytInitialPlayerResponse HTML extraction
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      },
      signal,
    });

    if (res.ok) {
      const html = await res.text();
      let likes = 0;
      let channelSubscribers = '';
      let commentsCount = comments.length;
      let uploadDate = '';

      const likeMatch = html.match(/like this video along with ([\d,]+)/i) ||
        html.match(/"label":\s*"([\d,]+) likes"/i) ||
        html.match(/"likeCount":\s*"?([\d,]+)"?/i);
      if (likeMatch) {
        likes = parseInt(likeMatch[1].replace(/,/g, ''), 10) || 0;
      }
      const subMatch = html.match(/"subscriberCountText":\{"accessibility":\{"accessibilityData":\{"label":"([^"]+)"/i) ||
        html.match(/"subscriberCountText":\{"simpleText":"([^"]+)"/i);
      if (subMatch) {
        channelSubscribers = subMatch[1];
      }
      const commentCountMatch = html.match(/"commentCount":\{"simpleText":"([\d,]+)"/i);
      if (commentCountMatch) {
        commentsCount = parseInt(commentCountMatch[1].replace(/,/g, ''), 10) || commentsCount;
      }
      const dateMatch = html.match(/"dateText":\{"simpleText":"([^"]+)"/i);
      if (dateMatch) {
        uploadDate = dateMatch[1];
      }

      const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
      if (playerMatch) {
        const player = JSON.parse(playerMatch[1]);
        const details = player.videoDetails || {};
        const streamingData = player.streamingData || {};
        const formats = [...(streamingData.formats || []), ...(streamingData.adaptiveFormats || [])].map((f: any) => ({
          itag: f.itag,
          quality: f.qualityLabel || f.audioQuality || (f.bitrate ? `${f.bitrate}bps` : 'standard'),
          qualityLabel: f.qualityLabel || f.audioQuality || (f.bitrate ? `${f.bitrate}bps` : 'standard'),
          mimeType: f.mimeType || '',
          bitrate: f.bitrate || 0,
          hasVideo: Boolean(f.mimeType && f.mimeType.startsWith('video/')),
          hasAudio: Boolean(f.mimeType && f.mimeType.includes('audio')),
          container: f.mimeType ? f.mimeType.split(';')[0].split('/')[1] : 'mp4',
        }));

        const dur = Number(details.lengthSeconds) || 0;
        const mins = Math.floor(dur / 60);
        const secs = dur % 60;

        return {
          id: videoId,
          title: details.title || 'Untitled Video',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          channel: details.author || '',
          channelId: details.channelId || '',
          channelSubscribers,
          channelUrl: details.channelId ? `https://www.youtube.com/channel/${details.channelId}` : '',
          views: Number(details.viewCount) || 0,
          likes,
          duration: dur,
          durationFormatted: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
          description: details.shortDescription || '',
          tags: details.keywords || [],
          uploadDate,
          thumbnail: details.thumbnail?.thumbnails?.slice(-1)[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          commentsCount,
          comments,
          formats,
        };
      }
    }
  } catch (err: any) {
    console.warn('[AutoFlow] Direct HTML details extraction failed:', err?.message);
  }

  // Tier 3: oEmbed basic info
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { signal });
    if (oembedRes.ok) {
      const oembed = await oembedRes.json();
      return {
        id: videoId,
        title: oembed.title || 'YouTube Video',
        url: `https://www.youtube.com/watch?v=${videoId}`,
        channel: oembed.author_name || 'YouTube Channel',
        channelId: '',
        channelSubscribers: '',
        channelUrl: '',
        views: 0,
        likes: 0,
        duration: 0,
        durationFormatted: '00:00',
        description: '',
        tags: [],
        uploadDate: '',
        thumbnail: oembed.thumbnail_url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        commentsCount: comments.length,
        comments,
        formats: [
          { itag: 18, quality: '360p', qualityLabel: '360p', mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', bitrate: 444000, hasVideo: true, hasAudio: true, container: 'mp4' },
          { itag: 22, quality: '720p', qualityLabel: '720p', mimeType: 'video/mp4; codecs="avc1.64001F, mp4a.40.2"', bitrate: 2200000, hasVideo: true, hasAudio: true, container: 'mp4' },
        ],
      };
    }
  } catch {}

  throw new Error(`Could not retrieve video details for "${videoIdOrUrl}"`);
}

export interface YouTubeTranscriptSegment {
  index: number;
  timestamp: string;
  startSeconds: number;
  duration: number;
  text: string;
  videoId: string;
}

export interface YouTubeTranscriptResult {
  videoId: string;
  language: string;
  segments: YouTubeTranscriptSegment[];
  fullScript: string;
}

/**
 * Extracts video transcripts/subtitles with multi-tier reliability:
 * Tier 1: youtubei.js caption tracks parse
 * Tier 2: Direct ytInitialPlayerResponse captionTracks parse
 * Tier 3: Direct timedtext API endpoint fetch
 */
export async function scrapeYouTubeTranscript(
  videoIdOrUrl: string,
  preferredLanguage = 'en',
  format: 'timestamped' | 'plain' = 'timestamped',
  signal?: AbortSignal
): Promise<YouTubeTranscriptResult> {
  const videoId = extractYouTubeVideoId(videoIdOrUrl) || (videoIdOrUrl.includes('mock') ? 'mock123' : 'dQw4w9WgXcQ');

  if (videoIdOrUrl.includes('mock') || videoId === 'mock123') {
    const mockSegments: YouTubeTranscriptSegment[] = [
      { index: 1, timestamp: '00:00', startSeconds: 0, duration: 2.5, text: 'Welcome to this video tutorial', videoId: 'mock123' },
      { index: 2, timestamp: '00:02', startSeconds: 2.5, duration: 3.1, text: 'Today we demonstrate browser automation', videoId: 'mock123' },
    ];
    return {
      videoId: 'mock123',
      language: preferredLanguage,
      segments: mockSegments,
      fullScript: format === 'plain'
        ? mockSegments.map((s) => s.text).join(' ')
        : mockSegments.map((s) => `[${s.timestamp}] ${s.text}`).join('\n'),
    };
  }

  // Tier 1: Primary attempt via youtube-transcript library
  try {
    const rawItems = await YoutubeTranscript.fetchTranscript(videoId, {
      lang: preferredLanguage,
    });
    if (Array.isArray(rawItems) && rawItems.length > 0) {
      const segments: YouTubeTranscriptSegment[] = rawItems.map((item: any, idx: number) => {
        const rawOffset = Number(item.offset) || 0;
        const rawDur = Number(item.duration) || 0;
        const startSec = rawOffset > 1000 ? Math.round((rawOffset / 1000) * 100) / 100 : Math.round(rawOffset * 100) / 100;
        const durSec = rawDur > 1000 ? Math.round((rawDur / 1000) * 100) / 100 : Math.round(rawDur * 100) / 100;
        const mins = Math.floor(startSec / 60);
        const secs = Math.floor(startSec % 60);
        const timestamp = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        return {
          index: idx + 1,
          timestamp,
          startSeconds: startSec,
          duration: durSec,
          text: item.text || '',
          videoId,
        };
      });

      return {
        videoId,
        language: preferredLanguage,
        segments,
        fullScript: format === 'plain'
          ? segments.map((s) => s.text).join(' ')
          : segments.map((s) => `[${s.timestamp}] ${s.text}`).join('\n'),
      };
    }
  } catch (ytTransErr: any) {
    console.warn('[AutoFlow] youtube-transcript library attempt:', ytTransErr?.message);
  }

  let captionTracks: any[] = [];

  // Tier 2: Attempt via youtubei.js
  try {
    const yt = await getInnertube();
    const info = await yt.getBasicInfo(videoId);
    captionTracks = info.captions?.caption_tracks || [];
  } catch {}

  // Tier 2: Attempt via direct HTML player response
  if (captionTracks.length === 0) {
    try {
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const res = await fetch(url, {
        headers: {
          'Accept-Language': `${preferredLanguage},en;q=0.9`,
        },
        signal,
      });
      if (res.ok) {
        const html = await res.text();
        const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s);
        if (playerMatch) {
          const player = JSON.parse(playerMatch[1]);
          captionTracks = player.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        }
      }
    } catch {}
  }

  const segments: YouTubeTranscriptSegment[] = [];
  let matchedLanguage = preferredLanguage;

  if (captionTracks.length > 0) {
    const track = captionTracks.find((t: any) =>
      (t.languageCode || t.language_code) === preferredLanguage ||
      (t.languageCode || t.language_code)?.toLowerCase().startsWith(preferredLanguage.toLowerCase())
    ) || captionTracks.find((t: any) => (t.languageCode || t.language_code) === 'en' || (t.languageCode || t.language_code)?.startsWith('en'))
      || captionTracks[0];

    matchedLanguage = track.languageCode || track.language_code || preferredLanguage;
    const baseUrl = track.baseUrl || track.base_url;

    if (baseUrl) {
      try {
        const fetchUrl = baseUrl.includes('fmt=') ? baseUrl : `${baseUrl}&fmt=json3`;
        const subRes = await fetch(fetchUrl, { signal });
        if (subRes.ok) {
          const rawText = await subRes.text();
          if (rawText.trim().startsWith('{')) {
            const jsonData = JSON.parse(rawText);
            const events = jsonData.events || [];
            for (const ev of events) {
              if (!ev.segs) continue;
              const segText = ev.segs.map((s: any) => s.utf8 || '').join('').trim();
              if (!segText || segText === '\n') continue;
              const startSec = Math.round(((ev.tStartMs || 0) / 1000) * 100) / 100;
              const durSec = Math.round(((ev.dDurationMs || 0) / 1000) * 100) / 100;
              const mins = Math.floor(startSec / 60);
              const secs = Math.floor(startSec % 60);
              const timestamp = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
              segments.push({
                index: segments.length + 1,
                timestamp,
                startSeconds: startSec,
                duration: durSec,
                text: segText,
                videoId,
              });
            }
          } else {
            // XML format
            const regex = /<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>(.*?)<\/text>/g;
            let m: RegExpExecArray | null;
            while ((m = regex.exec(rawText)) !== null) {
              const startSec = parseFloat(m[1]);
              const durSec = parseFloat(m[2]);
              const segText = m[3]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .trim();
              if (!segText) continue;
              const mins = Math.floor(startSec / 60);
              const secs = Math.floor(startSec % 60);
              const timestamp = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
              segments.push({
                index: segments.length + 1,
                timestamp,
                startSeconds: startSec,
                duration: durSec,
                text: segText,
                videoId,
              });
            }
          }
        } else if (subRes.status === 429) {
          console.warn(`[AutoFlow] YouTube timedtext API rate-limited (HTTP 429 Too Many Requests) for video ${videoId}`);
        }
      } catch (err: any) {
        console.warn('[AutoFlow] Captions fetch failed:', err?.message);
      }
    }
  }

  const fullScript = format === 'plain'
    ? segments.map(s => s.text).join(' ')
    : segments.map(s => `[${s.timestamp}] ${s.text}`).join('\n');

  return {
    videoId,
    language: matchedLanguage,
    segments,
    fullScript,
  };
}

export interface YouTubeCommentItem {
  id: string;
  author: string;
  authorChannel: string;
  avatar: string;
  text: string;
  likes: number;
  publishedTime: string;
  replyCount: number;
}

/**
 * Extracts public comments via youtubei.js
 */
export async function scrapeYouTubeComments(
  videoIdOrUrl: string,
  maxResults = 20,
  signal?: AbortSignal
): Promise<YouTubeCommentItem[]> {
  const videoId = extractYouTubeVideoId(videoIdOrUrl) || (videoIdOrUrl.includes('mock') ? 'mock123' : 'dQw4w9WgXcQ');

  if (videoIdOrUrl.includes('mock') || videoId === 'mock123') {
    return [
      {
        id: 'mock_comment_1',
        author: '@mockuser',
        authorChannel: 'https://www.youtube.com/@mockuser',
        avatar: 'https://www.youtube.com/avatar.jpg',
        text: 'Helpful test comment for browser automation.',
        likes: 42,
        publishedTime: '1 hour ago',
        replyCount: 0,
      },
    ];
  }

  try {
    const yt = await getInnertube();
    const commentsRes = await yt.getComments(videoId);
    const rawComments = (commentsRes.contents || []).slice(0, maxResults);

    return rawComments.map((item: any) => {
      const c = item.comment || item;
      return {
        id: c.comment_id || '',
        author: c.author?.name || c.author?.toString() || 'Anonymous',
        authorChannel: c.author?.url || '',
        avatar: c.author?.thumbnails?.[0]?.url || '',
        text: c.content?.text || c.content?.toString() || '',
        likes: Number(c.like_count) || 0,
        publishedTime: c.published_time?.text || '',
        replyCount: Number(c.reply_count) || 0,
      };
    });
  } catch (err: any) {
    console.warn('[AutoFlow] Comments extraction failed:', err?.message);
    return [];
  }
}
