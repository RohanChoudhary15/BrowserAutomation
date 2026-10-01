import { Scraper, SearchMode, Tweet } from '@the-convocation/twitter-scraper';

export interface TwitterScrapeParams {
  mode?: 'user' | 'profile_tweets' | 'search' | 'profile' | 'single_tweet';
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
 * Extracts clean Twitter screen name from username, @handle, or full URL
 * Examples:
 *   "nasa" -> "nasa"
 *   "@nasa" -> "nasa"
 *   "https://x.com/OpenAI" -> "OpenAI"
 *   "https://twitter.com/elonmusk?lang=en" -> "elonmusk"
 */
export function extractTwitterUsername(input?: string): string {
  if (!input) return '';
  let cleaned = input.trim();
  // Strip full URL
  const urlMatch = cleaned.match(/(?:twitter|x)\.com\/(?:@)?([a-zA-Z0-9_]{1,30})/i);
  if (urlMatch) {
    return urlMatch[1];
  }
  // Strip leading @, #, or /
  cleaned = cleaned.replace(/^[@#/]+/, '').trim();
  // Strip path or query params
  cleaned = cleaned.split('/')[0].split('?')[0].split(' ')[0].trim();
  return cleaned;
}

/**
 * Extracts tweet ID from status URL or numeric ID string
 */
export function extractTweetId(input?: string): string | null {
  if (!input) return null;
  const cleaned = input.trim();
  const match = cleaned.match(/\/status\/([0-9]{15,25})/i) || cleaned.match(/^([0-9]{15,25})$/);
  return match ? match[1] : null;
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

  const tweetUrl =
    tweet.permanentUrl ||
    (tweet.username && tweet.id ? `https://x.com/${tweet.username}/status/${tweet.id}` : `https://x.com/i/status/${tweet.id}`);

  return {
    id: tweet.id || '',
    text: tweet.text || '',
    username: tweet.username ? (tweet.username.startsWith('@') ? tweet.username : `@${tweet.username}`) : '',
    name: tweet.name || tweet.username || 'X User',
    url: tweetUrl,
    timestamp: tweet.timestamp ? tweet.timestamp * 1000 : tweet.timeParsed ? new Date(tweet.timeParsed).getTime() : Date.now(),
    timeParsed: tweet.timeParsed
      ? new Date(tweet.timeParsed).toISOString()
      : tweet.timestamp
      ? new Date(tweet.timestamp * 1000).toISOString()
      : new Date().toISOString(),
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
 * Scrapes tweets using @the-convocation/twitter-scraper library.
 *
 * IMPORTANT:
 * - User Timeline / User Last Tweets DOES NOT require login or authentication cookies.
 * - Profile details (bio, followers, verified) DOES NOT require login.
 * - Search by keyword/hashtag requires login cookies on Twitter's backend API.
 */
export async function scrapeTwitterWithConvocation(params: TwitterScrapeParams): Promise<TwitterScrapeResult> {
  const limit = Math.max(1, Math.min(Number(params.maxResults) || 15, 100));
  const rawInput = (params.username || params.query || '').trim();
  const targetUser = extractTwitterUsername(params.username || (!params.query?.includes(' ') ? params.query : ''));

  const scraper = new Scraper();

  // Set optional session cookies if provided (auth_token, ct0)
  try {
    const cookieList: string[] = [];
    if (params.authToken) {
      cookieList.push(`auth_token=${params.authToken.trim()}; Domain=.twitter.com; Path=/; Secure; HttpOnly`);
    }
    if (params.ct0) {
      cookieList.push(`ct0=${params.ct0.trim()}; Domain=.twitter.com; Path=/; Secure`);
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

  // 1. Single Tweet check (e.g. status URL or numeric ID)
  const tweetId = extractTweetId(rawInput);
  if (tweetId || params.mode === 'single_tweet') {
    const idToFetch = tweetId || rawInput;
    if (idToFetch) {
      try {
        const singleTweet = await scraper.getTweet(idToFetch);
        if (singleTweet) {
          return { success: true, items: [normalizeTweet(singleTweet)] };
        }
      } catch (err: any) {
        return {
          success: false,
          items: [],
          error: `Failed to fetch single tweet ${idToFetch}: ${err.message}`,
        };
      }
    }
  }

  // 2. Profile mode
  if (params.mode === 'profile') {
    if (!targetUser) {
      return {
        success: false,
        items: [],
        error: 'Twitter username is required to fetch profile information.',
      };
    }
    try {
      const profile = await scraper.getProfile(targetUser);
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
      return {
        success: false,
        items: [],
        error: `Failed to fetch profile for @${targetUser}: ${profErr.message}`,
      };
    }
  }

  // 3. User Tweets / Timeline mode (DOES NOT REQUIRE LOGIN!)
  // Detect if requested mode is user timeline or if username was supplied
  const isUserMode =
    params.mode === 'user' ||
    params.mode === 'profile_tweets' ||
    (!params.mode && !!targetUser) ||
    (params.mode !== 'search' && !!targetUser);

  if (isUserMode) {
    if (!targetUser) {
      return {
        success: false,
        items: [],
        error: 'Please provide a valid Twitter username (e.g. OpenAI, nasa, or @elonmusk).',
      };
    }

    const items: StandardTweetItem[] = [];
    let userFetchError: string | null = null;

    try {
      for await (const tweet of scraper.getTweets(targetUser, limit)) {
        if (params.signal?.aborted) break;
        items.push(normalizeTweet(tweet));
        if (items.length >= limit) break;
      }
    } catch (userErr: any) {
      userFetchError = userErr.message;
      console.warn(`getTweets for @${targetUser} error:`, userErr.message);
    }

    // Fallback: If getTweets yielded 0 items, attempt getLatestTweet
    if (items.length === 0) {
      try {
        const latest = await scraper.getLatestTweet(targetUser, true);
        if (latest) {
          items.push(normalizeTweet(latest));
        }
      } catch {
        // Ignore latest tweet fallback error
      }
    }

    if (items.length > 0) {
      return {
        success: true,
        items: items.slice(0, limit),
      };
    }

    // Return the actual user fetch error; NEVER fall back to searchTweets because search requires login!
    return {
      success: false,
      items: [],
      error: userFetchError
        ? `Failed to fetch timeline for @${targetUser}: ${userFetchError}. (Account may be private, suspended, or rate-limited).`
        : `No tweets returned for @${targetUser}. The account may be inactive, private, or have no public tweets.`,
    };
  }

  // 4. Search tweets mode (Requires Twitter authentication for zero-tab API stream)
  const searchQuery = (params.query || params.username || '').trim();
  if (!searchQuery) {
    return {
      success: false,
      items: [],
      error: 'Search query or keywords are required for Twitter search mode.',
    };
  }

  // Check login status for search
  const hasAuth = !!(params.authToken || params.ct0 || params.cookies);
  let isLoggedIn = hasAuth;
  if (hasAuth) {
    try {
      isLoggedIn = await scraper.isLoggedIn();
    } catch {
      // Assume provided tokens are valid
      isLoggedIn = true;
    }
  }

  if (!isLoggedIn && !hasAuth) {
    return {
      success: false,
      items: [],
      error:
        `Twitter requires authentication cookies (auth_token & ct0) for searching tweets via zero-tab API. ` +
        `Please provide your auth_token in the node properties, or switch Extraction Engine to "Browser (DOM)" to search in a browser tab. ` +
        `(Note: User Timeline mode does NOT require login!).`,
    };
  }

  const modeEnum =
    params.searchCategory === 'top'
      ? SearchMode.Top
      : params.searchCategory === 'photos'
      ? SearchMode.Photos
      : params.searchCategory === 'videos'
      ? SearchMode.Videos
      : SearchMode.Latest;

  const items: StandardTweetItem[] = [];

  try {
    for await (const tweet of scraper.searchTweets(searchQuery, limit, modeEnum)) {
      if (params.signal?.aborted) break;
      items.push(normalizeTweet(tweet));
      if (items.length >= limit) break;
    }
  } catch (searchErr: any) {
    return {
      success: false,
      items: [],
      error: `Twitter search error: ${searchErr.message}. Switch to Browser (DOM) engine or provide valid auth_token in properties.`,
    };
  }

  if (items.length === 0) {
    return {
      success: false,
      items: [],
      error: `No tweets returned for query "${searchQuery}".`,
    };
  }

  return {
    success: true,
    items: items.slice(0, limit),
  };
}
