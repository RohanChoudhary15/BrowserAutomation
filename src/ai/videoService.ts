import { safeFetch } from './aiService';

export const DEFAULT_AURAY_API_KEY =
  'auray_sk_94egeTtN0Gqq_anh3qUL4nJSyx2U0JGbTS5H83bEy2jXufRj23w_NeKwALjY2Y';

export const AURAY_ADDRESS = 'auray-ai/minimax-h3/text-to-video';
export const AURAY_QUEUE_URL = `https://queue.auray.run/${AURAY_ADDRESS}`;
export const AURAY_PLATFORM_URL = 'https://api.auray.ai/v1';

/**
 * Normalizes Auray URLs when running in non-extension local dev mode (Vite proxy).
 */
export function normalizeAurayUrl(url: string): string {
  if (
    typeof window !== 'undefined' &&
    (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) &&
    (window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1')
  ) {
    return url
      .replace('https://queue.auray.run', '/auray-queue')
      .replace('https://api.auray.ai', '/auray-platform');
  }
  return url;
}

export type VideoDuration = 5 | 10 | 15;
export type VideoAspectRatio = '9:16' | '16:9' | '1:1' | '4:3' | '3:4';
export type VideoResolution = '768P' | '1080P';

export interface VideoAssetDetails {
  key?: string;
  kind: string;
  width?: number;
  height?: number;
  seconds?: number;
  fps?: number;
  has_audio?: boolean;
  url: string;
}

export interface VideoGenerationOptions {
  prompt: string;
  duration?: VideoDuration | number;
  aspectRatio?: VideoAspectRatio | string;
  resolution?: VideoResolution | string;
  inputImage?: string; // Image URL, base64 data URI, or canvas screenshot
  sound?: boolean;
  apiKey?: string;
  queueUrl?: string;
  platformUrl?: string;
  address?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onProgress?: (status: string, detail?: string, progress?: number) => void;
}

export interface VideoGenerationResult {
  videoUrl: string;
  requestId: string;
  asset: VideoAssetDetails;
  duration: number;
  aspectRatio: string;
  resolution: string;
  prompt: string;
  firstFrameUrl?: string;
  firstFramePath?: string;
}

/**
 * Generates a random alphanumeric idempotency key.
 */
function generateIdempotencyKey(prefix: string = 'h3'): string {
  const rand = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `${prefix}-${Date.now().toString(36)}-${rand}`.substring(0, 32);
}

/**
 * Downloads or decodes source image bytes and detects content type.
 */
export async function downloadImageBytes(
  imageUrl: string
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const cleanUrl = imageUrl.trim();

  // 1. Data URI (base64)
  if (cleanUrl.startsWith('data:')) {
    const match = cleanUrl.match(/^data:([^;]+);base64,(.*)$/);
    if (!match) {
      throw new Error('Invalid base64 data URI format for input image.');
    }
    const contentType = match[1].toLowerCase();
    const base64Data = match[2];

    let bytes: Uint8Array;
    if (typeof Buffer !== 'undefined') {
      bytes = Uint8Array.from(Buffer.from(base64Data, 'base64'));
    } else if (typeof atob !== 'undefined') {
      const binary = atob(base64Data);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
    } else {
      throw new Error('Unable to decode base64 in the current environment.');
    }

    return { bytes, contentType };
  }

  // 2. HTTP / HTTPS URL
  const response = await safeFetch(cleanUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download source image from URL (HTTP ${response.status} ${response.statusText}): ${cleanUrl}`);
  }

  const rawType = response.headers.get('content-type') || '';
  let contentType = rawType.split(';')[0].trim().toLowerCase();

  if (!contentType.startsWith('image/')) {
    // Infer from pathname
    const pathname = new URL(cleanUrl).pathname.toLowerCase();
    if (pathname.endsWith('.png')) contentType = 'image/png';
    else if (pathname.endsWith('.webp')) contentType = 'image/webp';
    else if (pathname.endsWith('.heic')) contentType = 'image/heic';
    else if (pathname.endsWith('.heif')) contentType = 'image/heif';
    else contentType = 'image/jpeg';
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error('Source image URL returned empty content.');
  }

  return { bytes: new Uint8Array(arrayBuffer), contentType };
}

/**
 * Creates an Auray upload slot for the model address.
 */
export async function createUploadSlot(
  apiKey: string,
  contentType: string,
  address: string = AURAY_ADDRESS,
  platformUrl: string = AURAY_PLATFORM_URL
): Promise<any> {
  const payload = {
    address,
    content_type: contentType,
    idempotency_key: generateIdempotencyKey('h3upload'),
  };

  const targetPlatformUrl = normalizeAurayUrl(platformUrl);
  const response = await safeFetch(`${targetPlatformUrl}/uploads`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('browser_origin_refused')) {
      throw new Error(
        `Auray AI rejected the upload request with browser_origin_refused. Please reload the AutoFlow extension at chrome://extensions (click the 🔄 reload icon on AutoFlow) to activate the updated network rules that strip the browser Origin header.`
      );
    }
    throw new Error(`Auray upload slot creation failed (HTTP ${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Uploads raw image bytes to the allocated Auray storage slot.
 */
export async function uploadImageBytes(
  slot: { upload_url: string },
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  if (!slot.upload_url) {
    throw new Error('Auray upload slot did not provide upload_url.');
  }

  const response = await safeFetch(slot.upload_url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: bytes as any,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Uploading image bytes to Auray storage failed (HTTP ${response.status}): ${errorText}`);
  }
}

/**
 * Retrieves the signed readable image URL from the upload slot.
 */
export async function getUploadedImageUrl(
  apiKey: string,
  slot: { read: string }
): Promise<{ path: string; signedUrl: string }> {
  if (!slot.read) {
    throw new Error('Auray upload slot did not provide read endpoint.');
  }

  const readUrl = normalizeAurayUrl(slot.read);
  const response = await safeFetch(readUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('browser_origin_refused')) {
      throw new Error(
        `Auray AI rejected signed image URL read with browser_origin_refused. Please reload the AutoFlow extension at chrome://extensions (click 🔄).`
      );
    }
    throw new Error(`Failed to obtain signed image URL (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const signedUrl = data.url;
  const path = data.path;

  if (!signedUrl) {
    throw new Error(`Auray did not return a signed image URL: ${JSON.stringify(data)}`);
  }

  return { path, signedUrl };
}

/**
 * Prepares the first frame for Image-to-Video generation.
 */
export async function prepareFirstFrame(
  apiKey: string,
  imageUrl: string,
  address: string = AURAY_ADDRESS,
  platformUrl: string = AURAY_PLATFORM_URL
): Promise<{ path: string; signedUrl: string }> {
  const { bytes, contentType } = await downloadImageBytes(imageUrl);
  const slot = await createUploadSlot(apiKey, contentType, address, platformUrl);
  await uploadImageBytes(slot, bytes, contentType);
  return await getUploadedImageUrl(apiKey, slot);
}

/**
 * Submits an H3 video generation job to the Auray Queue.
 */
export async function submitH3Job(
  options: VideoGenerationOptions & {
    firstFramePath?: string;
    firstFrameUrl?: string;
  }
): Promise<any> {
  const apiKey = options.apiKey?.trim() || DEFAULT_AURAY_API_KEY;
  const queueUrl = options.queueUrl || AURAY_QUEUE_URL;
  const duration = Number(options.duration) || 15;
  const aspectRatio = options.aspectRatio || '9:16';
  const resolution = options.resolution || '768P';

  let payload: Record<string, any>;

  if (options.firstFramePath && options.firstFrameUrl) {
    // Image-to-Video Mode
    const idempotencyKey = generateIdempotencyKey('h3');
    payload = {
      prompt: `integrated_multimodal_description: [Shot 1] ${options.prompt}`,
      duration_seconds: duration,
      aspect_ratio: aspectRatio,
      first_frame_path: options.firstFramePath,
      director: {
        v: 2,
        mode: 'video',
        task: 'first-frame',
        prompt: options.prompt,
        shots: [],
        movements: [],
        seconds: duration,
        genre: 'general',
        era: 'auto',
        tempo: 'auto',
        camera: 'auto',
        lens: 'auto',
        aperture: 'auto',
        palette: { kind: 'auto' },
        lighting: { kind: 'auto' },
        elements: [],
        references: [],
        startFrame: {
          source: 'url',
          ref: options.firstFrameUrl,
          kind: 'image',
        },
        endFrame: null,
        sound: options.sound !== false,
        soundscape: '',
        music: '',
        dialogue: [],
        negative: '',
        seed: null,
        notes: null,
      },
      idempotency_key: idempotencyKey,
    };
  } else {
    // Pure Text-to-Video Mode
    const idempotencyKey = generateIdempotencyKey('h3-t2v');
    payload = {
      model: 'MiniMax-H3',
      'content[type=text].text': options.prompt,
      resolution,
      duration,
      ratio: aspectRatio,
      idempotency_key: idempotencyKey,
    };
  }

  const targetQueueUrl = normalizeAurayUrl(queueUrl);
  const response = await safeFetch(targetQueueUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Idempotency-Key': payload.idempotency_key,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('browser_origin_refused')) {
      throw new Error(
        `MiniMax H3 job submission failed: browser_origin_refused. Please reload the AutoFlow extension at chrome://extensions (click the 🔄 reload icon on AutoFlow) to activate the updated network rules that strip browser Origin headers.`
      );
    }
    throw new Error(`MiniMax H3 job submission failed (HTTP ${response.status}): ${errorText}`);
  }

  return await response.json();
}

/**
 * Polls the queue status URL until the job status reaches COMPLETED.
 */
export async function pollQueueStatus(
  apiKey: string,
  statusUrl: string,
  pollIntervalMs: number = 4000,
  timeoutMs: number = 600000, // 10 minutes maximum
  onProgress?: (status: string, detail?: string, progress?: number) => void,
  signal?: AbortSignal
): Promise<any> {
  const startTime = Date.now();

  while (true) {
    if (signal?.aborted) {
      throw new Error('Video generation was aborted by user.');
    }

    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Video generation timed out after ${Math.round(timeoutMs / 1000)}s.`);
    }

    const targetStatusUrl = normalizeAurayUrl(statusUrl);
    const separator = targetStatusUrl.includes('?') ? '&' : '?';
    const pollUrlWithLogs = `${targetStatusUrl}${separator}logs=1`;

    const response = await safeFetch(pollUrlWithLogs, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after')) || 5;
      onProgress?.('RATE_LIMITED', `Rate limited. Retrying in ${retryAfter}s...`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (errorText.includes('browser_origin_refused')) {
        throw new Error(
          `Auray AI status check rejected with browser_origin_refused. Please reload the AutoFlow extension at chrome://extensions (click 🔄).`
        );
      }
      throw new Error(`Queue status check failed (HTTP ${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const status = data.status || 'UNKNOWN';
    const elapsedSec = Math.round((Date.now() - startTime) / 1000);
    const queuePosition = data.queue_position;

    const detail =
      queuePosition !== undefined && queuePosition !== null
        ? `Queue Position: ${queuePosition} (${elapsedSec}s elapsed)`
        : `${elapsedSec}s elapsed`;

    const approxProgress = Math.min(
      95,
      status === 'IN_PROGRESS'
        ? Math.max(30, Math.min(90, Math.round((elapsedSec / 60) * 100)))
        : status === 'COMPLETED'
        ? 98
        : 15
    );

    onProgress?.(status, detail, approxProgress);

    if (status === 'COMPLETED') {
      return data;
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
}

/**
 * Fetches the final response from response_url to check for errors.
 */
export async function getFinalResponse(apiKey: string, responseUrl: string): Promise<any> {
  const targetResponseUrl = normalizeAurayUrl(responseUrl);
  const response = await safeFetch(targetResponseUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('browser_origin_refused')) {
      throw new Error(
        `Auray AI response check rejected with browser_origin_refused. Please reload the AutoFlow extension at chrome://extensions (click 🔄).`
      );
    }
    throw new Error(`MiniMax H3 final response check failed (HTTP ${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (result.error) {
    const msg = typeof result.error === 'object' ? JSON.stringify(result.error) : result.error;
    throw new Error(`MiniMax H3 generation error: ${msg}`);
  }

  if (result.error_type) {
    throw new Error(`MiniMax H3 returned error type: ${result.error_type}`);
  }

  return result;
}

/**
 * Fetches the signed video download URL from the job assets endpoint.
 */
export async function getVideoAsset(
  apiKey: string,
  requestId: string,
  platformUrl: string = AURAY_PLATFORM_URL
): Promise<VideoAssetDetails> {
  const targetPlatformUrl = normalizeAurayUrl(platformUrl);
  const assetsUrl = `${targetPlatformUrl}/jobs/${requestId}/assets`;

  const response = await safeFetch(assetsUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (errorText.includes('browser_origin_refused')) {
      throw new Error(
        `Auray AI asset retrieval rejected with browser_origin_refused. Please reload the AutoFlow extension at chrome://extensions (click 🔄).`
      );
    }
    throw new Error(`Failed to retrieve generated video assets (HTTP ${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const assets: any[] = Array.isArray(data.assets) ? data.assets : [];

  if (assets.length === 0) {
    throw new Error('Auray returned no media assets for this video job.');
  }

  const videoAsset = assets.find((a) => a.kind === 'video');
  if (!videoAsset || !videoAsset.url) {
    throw new Error('No signed video URL found in Auray assets response.');
  }

  return {
    key: videoAsset.key,
    kind: 'video',
    width: videoAsset.width,
    height: videoAsset.height,
    seconds: videoAsset.seconds,
    fps: videoAsset.fps,
    has_audio: videoAsset.has_audio,
    url: videoAsset.url,
  };
}

/**
 * End-to-end video generation pipeline:
 * Handles input image upload (if provided), job submission, queue polling,
 * result verification, and signed video asset resolution.
 */
export async function generateVideo(options: VideoGenerationOptions): Promise<VideoGenerationResult> {
  const apiKey = options.apiKey?.trim() || DEFAULT_AURAY_API_KEY;
  const platformUrl = options.platformUrl || AURAY_PLATFORM_URL;
  const address = options.address || AURAY_ADDRESS;
  const duration = Number(options.duration) || 15;
  const aspectRatio = options.aspectRatio || '9:16';
  const resolution = options.resolution || '768P';

  let firstFramePath: string | undefined;
  let firstFrameUrl: string | undefined;

  // 1. Prepare first frame if source image is provided
  if (options.inputImage && options.inputImage.trim()) {
    options.onProgress?.('PREPARING_IMAGE', 'Uploading source image / first frame...', 10);
    const prepared = await prepareFirstFrame(apiKey, options.inputImage.trim(), address, platformUrl);
    firstFramePath = prepared.path;
    firstFrameUrl = prepared.signedUrl;
  }

  // 2. Submit H3 Job
  options.onProgress?.('SUBMITTING', 'Submitting generation request to MiniMax H3...', 20);
  const job = await submitH3Job({
    ...options,
    apiKey,
    duration,
    aspectRatio,
    resolution,
    firstFramePath,
    firstFrameUrl,
  });

  const requestId = job.request_id;
  const statusUrl = job.status_url;
  const responseUrl = job.response_url;

  if (!requestId || !statusUrl) {
    throw new Error(`Invalid job response from queue endpoint: ${JSON.stringify(job)}`);
  }

  // 3. Poll Queue Status
  options.onProgress?.(
    job.status || 'IN_QUEUE',
    `Request ID: ${requestId.slice(0, 12)}...`,
    25
  );

  await pollQueueStatus(
    apiKey,
    statusUrl,
    options.pollIntervalMs || 4000,
    options.timeoutMs || 600000,
    options.onProgress,
    options.signal
  );

  // 4. Verify Final Response
  if (responseUrl) {
    options.onProgress?.('VERIFYING', 'Verifying video generation response...', 96);
    await getFinalResponse(apiKey, responseUrl);
  }

  // 5. Retrieve Signed Video Asset
  options.onProgress?.('FETCHING_ASSET', 'Resolving signed video download stream...', 98);
  const asset = await getVideoAsset(apiKey, requestId, platformUrl);

  options.onProgress?.('COMPLETED', 'Video generated successfully!', 100);

  return {
    videoUrl: asset.url,
    requestId,
    asset,
    duration: asset.seconds || duration,
    aspectRatio,
    resolution,
    prompt: options.prompt,
    firstFrameUrl,
    firstFramePath,
  };
}
