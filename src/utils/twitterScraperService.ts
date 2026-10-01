import { Scraper, SearchMode, Tweet } from '@the-convocation/twitter-scraper';

export interface TwitterScrapeParams {
  mode?: 'user' | 'search' | 'profile' | 'single_tweet';
  username?: string;
  query?: string;
  maxResults?: number;
  searchCategory?: 'latest' | 'top' | 'photos' | 'videos';
  cookies?: string | string[];
  authToken?: string;
  ct0?: string;
  signal?: AbortSignal;
}

export interface StandardTweetItem {
  id: string;
  text: string;
  username: string;
  name: string;
  url: string;
  timestamp?: number;
  timeParsed?: string;
  likes: number;
  retweets: number;
  replies: number;
  views: number;
  photos?: string[];
  videos?: string[];
  isRetweet?: boolean;
  isReply?: boolean;
}

export interface TwitterScrapeResult {
  success: boolean;
  items: StandardTweetItem[];
  profile?: any;
  error?: string;
}

/**
 * Normalizes a raw Tweet from @the-convocation/twitter-scraper into AutoFlow's standard structure
 */
function normalizeTweet(tweet: Tweet): StandardTweetItem {
  const photoUrls = Array.isArray(tweet.photos)
    ? tweet.photos.map((p) => (typeof p === 'string' ? p : p.url)).filter(Boolean)
    : [];

  const videoUrls = Array.isArray(tweet.videos)
    ? tweet.videos.map((v) => (typeof v === 'string' ? v : v.url)).filter(Boolean)
    : [];

  const tweetUrl = tweet.permanentUrl || (tweet.username && tweet.id ? `https://x.com/${tweet.username}/status/${tweet.id}` : `https://x.com/i/status/${tweet.id}`);

  return {
    id: tweet.id || '',
    text: tweet.text || '',
    username: tweet.username ? (tweet.username.startsWith('@') ? tweet.username : `@${tweet.username}`) : '',
    name: tweet.name || tweet.username || 'X User',
    url: tweetUrl,
    timestamp: tweet.timestamp ? tweet.timestamp * 1000 : (tweet.timeParsed ? new Date(tweet.timeParsed).getTime() : Date.now()),
    timeParsed: tweet.timeParsed ? new Date(tweet.timeParsed).toISOString() : (tweet.timestamp ? new Date(tweet.timestamp * 1000).toISOString() : new Date().toISOString()),
    likes: Number(tweet.likes) || 0,
    retweets: Number(tweet.retweets) || 0,
    replies: Number(tweet.replies) || 0,
    views: Number(tweet.views) || 0,
    photos: photoUrls,
    videos: videoUrls,
    isRetweet: !!tweet.isRetweet,
    isReply: !!tweet.isReply,
  };
}

/**
 * Scrapes tweets using @the-convocation/twitter-scraper library
 */
export async function scrapeTwitterWithConvocation(params: TwitterScrapeParams): Promise<TwitterScrapeResult> {
  const limit = Math.max(1, Math.min(Number(params.maxResults) || 20, 100));
  const rawTarget = (params.username || params.query || '').trim();
  const cleanUser = (params.username || params.query || '').replace(/^@/, '').trim();

  const scraper = new Scraper();

  // Set optional session cookies if provided (useful for avoiding rate limits or scraping protected tweets)
  try {
    const cookieList: string[] = [];
    if (params.authToken) {
      cookieList.push(`auth_token=${params.authToken}; Domain=.twitter.com; Path=/; Secure; HttpOnly`);
    }
    if (params.ct0) {
      cookieList.push(`ct0=${params.ct0}; Domain=.twitter.com; Path=/; Secure`);
    }
    if (typeof params.cookies === 'string' && params.cookies.trim()) {
      params.cookies.split(';').forEach((c) => {
        const trimmed = c.trim();
        if (trimmed) cookieList.push(trimmed);
      });
    } else if (Array.isArray(params.cookies)) {
      cookieList.push(...params.cookies);
    }

    if (cookieList.length > 0) {
      await scraper.setCookies(cookieList);
    }
  } catch (cookieErr) {
    console.warn('Failed to set cookies for twitter-scraper:', cookieErr);
  }

  const items: StandardTweetItem[] = [];

  try {
    // 1. Single Tweet check (e.g. status URL or numeric ID)
    const isStatusUrl = rawTarget.includes('/status/');
    const statusMatch = rawTarget.match(/\/status\/([0-9]+)/) || rawTarget.match(/^([0-9]{15,22})$/);
    if (isStatusUrl || statusMatch) {
      const tweetId = statusMatch ? statusMatch[1] : '';
      if (tweetId) {
        const singleTweet = await scraper.getTweet(tweetId);
        if (singleTweet) {
          items.push(normalizeTweet(singleTweet));
          return { success: true, items };
        }
      }
    }

    // 2. Profile mode
    if (params.mode === 'profile') {
      try {
        const profile = await scraper.getProfile(cleanUser);
        if (profile) {
          return {
            success: true,
            items: [],
            profile: {
              name: profile.name,
              username: `@${profile.username}`,
              biography: profile.biography,
              followersCount: profile.followersCount,
              followingCount: profile.followingCount,
              tweetsCount: profile.tweetsCount,
              avatar: profile.avatar,
              banner: profile.banner,
              joined: profile.joined ? new Date(profile.joined).toISOString() : undefined,
              location: profile.location,
              url: profile.url || `https://x.com/${profile.username}`,
              verified: profile.isVerified,
            },
          };
        }
      } catch (profErr: any) {
        // Fall back to tweets if profile fetch fails
        console.warn('Profile fetch failed, trying getTweets:', profErr.message);
      }
    }

    // 3. User tweets mode (or default if username provided)
    if ((params.mode === 'user' || !params.mode || params.mode === 'search') && cleanUser && !rawTarget.includes(' ') && !rawTarget.startsWith('#')) {
      try {
        for await (const tweet of scraper.getTweets(cleanUser, limit)) {
          if (params.signal?.aborted) break;
          items.push(normalizeTweet(tweet));
          if (items.length >= limit) break;
        }

        if (items.length > 0) {
          return { success: true, items };
        }
      } catch (userErr: any) {
        console.warn(`getTweets for "${cleanUser}" failed, falling back to searchTweets:`, userErr.message);
      }
    }

    // 4. Search tweets mode (for hashtags, keywords, or fallback)
    const searchQuery = params.query || (cleanUser ? `from:${cleanUser}` : '');
    if (searchQuery) {
      const modeEnum = params.searchCategory === 'top'
        ? SearchMode.Top
        : params.searchCategory === 'photos'
        ? SearchMode.Photos
        : params.searchCategory === 'videos'
        ? SearchMode.Videos
        : SearchMode.Latest;

      for await (const tweet of scraper.searchTweets(searchQuery, limit, modeEnum)) {
        if (params.signal?.aborted) break;
        items.push(normalizeTweet(tweet));
        if (items.length >= limit) break;
      }
    }

    if (items.length === 0) {
      return {
        success: false,
        items: [],
        error: `No tweets returned for "${rawTarget}". The account may be private, suspended, rate-limited, or requires authentication cookies.`,
      };
    }

    return {
      success: true,
      items: items.slice(0, limit),
    };
  } catch (err: any) {
    return {
      success: false,
      items: [],
      error: err.message || 'X/Twitter scraping encountered an unexpected error.',
    };
  }
}
