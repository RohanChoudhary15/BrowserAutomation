import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeDomain,
  saveSiteNote,
  getSiteNotes,
  updateSiteNote,
  deleteSiteNote,
  clearDomainNotes,
  getAllSiteNotes,
  SITE_MEMORY_STORAGE_KEY,
} from '../src/storage/siteMemoryStore';

describe('Permanent Site Memory & Notes Store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('normalizeDomain', () => {
    it('normalizes full URLs to root hostname', () => {
      expect(normalizeDomain('https://github.com/trending?since=daily')).toBe('github.com');
      expect(normalizeDomain('http://subdomain.example.org/page/1#target')).toBe('subdomain.example.org');
    });

    it('strips www prefix from domains', () => {
      expect(normalizeDomain('https://www.google.com/search?q=test')).toBe('google.com');
      expect(normalizeDomain('www.wikipedia.org')).toBe('wikipedia.org');
    });

    it('handles bare domains and hosts', () => {
      expect(normalizeDomain('news.ycombinator.com')).toBe('news.ycombinator.com');
      expect(normalizeDomain('amazon.com')).toBe('amazon.com');
    });

    it('falls back to "global" for empty, whitespace, or invalid input', () => {
      expect(normalizeDomain('')).toBe('global');
      expect(normalizeDomain('   ')).toBe('global');
      expect(normalizeDomain(null as any)).toBe('global');
      expect(normalizeDomain('global')).toBe('global');
    });
  });

  describe('CRUD operations in Site Memory', () => {
    it('saves a new site note and assigns unique ID and timestamps', async () => {
      const note = await saveSiteNote(
        'github.com',
        'Search repository input selector is input[name="q"]',
        'agent',
        'Search Input'
      );

      expect(note.id).toBeTruthy();
      expect(note.domain).toBe('github.com');
      expect(note.content).toBe('Search repository input selector is input[name="q"]');
      expect(note.source).toBe('agent');
      expect(note.title).toBe('Search Input');
      expect(note.createdAt).toBeGreaterThan(0);
    });

    it('retrieves domain-specific notes along with global notes', async () => {
      await saveSiteNote('github.com', 'GitHub specific note 1', 'agent');
      await saveSiteNote('github.com', 'GitHub specific note 2', 'user');
      await saveSiteNote('global', 'Global fallback note across all sites', 'user');
      await saveSiteNote('reddit.com', 'Reddit specific note', 'agent');

      const githubNotes = await getSiteNotes('https://github.com/dashboard');
      expect(githubNotes.length).toBe(3); // 2 domain notes + 1 global note

      const contents = githubNotes.map((n) => n.content);
      expect(contents).toContain('GitHub specific note 1');
      expect(contents).toContain('GitHub specific note 2');
      expect(contents).toContain('Global fallback note across all sites');
      expect(contents).not.toContain('Reddit specific note');
    });

    it('updates an existing note with identical content instead of duplicating', async () => {
      const note1 = await saveSiteNote('twitter.com', 'Tweet button is [data-testid="tweetButton"]', 'agent');
      const note2 = await saveSiteNote('twitter.com', 'Tweet button is [data-testid="tweetButton"]', 'user', 'New Title');

      expect(note1.id).toBe(note2.id);
      expect(note2.title).toBe('New Title');

      const notes = await getSiteNotes('twitter.com');
      expect(notes.length).toBe(1);
    });

    it('updates note content and title via updateSiteNote', async () => {
      const note = await saveSiteNote('stackoverflow.com', 'Old selector #login', 'user');
      const updated = await updateSiteNote(note.id, 'Updated selector #auth-login', 'Login Box');

      expect(updated).not.toBeNull();
      expect(updated?.content).toBe('Updated selector #auth-login');
      expect(updated?.title).toBe('Login Box');

      const retrieved = await getSiteNotes('stackoverflow.com');
      expect(retrieved[0].content).toBe('Updated selector #auth-login');
    });

    it('deletes a note by ID', async () => {
      const note1 = await saveSiteNote('example.com', 'Note 1', 'agent');
      const note2 = await saveSiteNote('example.com', 'Note 2', 'agent');

      const deleted = await deleteSiteNote(note1.id);
      expect(deleted).toBe(true);

      const notes = await getSiteNotes('example.com');
      expect(notes.length).toBe(1);
      expect(notes[0].id).toBe(note2.id);
    });

    it('clears all notes for a specific domain', async () => {
      await saveSiteNote('site-a.com', 'Note A1', 'agent');
      await saveSiteNote('site-a.com', 'Note A2', 'user');
      await saveSiteNote('site-b.com', 'Note B1', 'agent');

      await clearDomainNotes('site-a.com');

      const siteANotes = await getSiteNotes('site-a.com');
      expect(siteANotes.length).toBe(0);

      const siteBNotes = await getSiteNotes('site-b.com');
      expect(siteBNotes.length).toBe(1);
    });

    it('returns all site notes organized by domain with getAllSiteNotes', async () => {
      await saveSiteNote('domain1.com', 'Note 1', 'agent');
      await saveSiteNote('domain2.com', 'Note 2', 'user');

      const all = await getAllSiteNotes();
      expect(Object.keys(all)).toContain('domain1.com');
      expect(Object.keys(all)).toContain('domain2.com');
      expect(all['domain1.com'][0].content).toBe('Note 1');
    });
  });
});
