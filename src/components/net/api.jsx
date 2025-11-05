import { Project } from '@/entities/Project';
import { Speaker } from '@/entities/Speaker';

/**
 * A simple in-memory cache to avoid refetching data unnecessarily.
 */
const CACHE = {
  projects: null,
  speakers: null,
};

/**
 * API configuration utilities
 */
export const isApiEnabled = () => {
  if (typeof window === 'undefined') return false;
  return window.__USE_API !== false;
};

export const getApiKey = () => {
  if (typeof window === 'undefined') return null;
  return window.BASE44_API_KEY || window.localStorage?.getItem("BASE44_API_KEY") || null;
};

export const setApiKey = (key) => {
  if (typeof window === 'undefined') return;
  if (key && key.trim()) {
    window.localStorage?.setItem("BASE44_API_KEY", key.trim());
    window.BASE44_API_KEY = key.trim();
  }
};

/**
 * Invalidates the projects cache. Called after a create, update, or delete action.
 */
export const InvalidateProjectsCache = () => {
  CACHE.projects = null;
};

/**
 * Invalidates the speakers cache.
 */
export const InvalidateSpeakersCache = () => {
  CACHE.speakers = null;
};

/**
 * A wrapper around the Project entity SDK to handle listing with caching.
 */
export const ProjectAPI = {
  /**
   * Lists projects using the Project entity SDK.
   * This implementation replaces a previous one that may have used Axios.
   * @param {string} sort - Sort order string (e.g., '-updated_date').
   * @param {number} limit - Number of records to return.
   * @param {object} filters - Key-value pairs for filtering.
   * @param {object} opts - Options, including page number.
   * @returns {Promise<object>} - A response object { ok, data, nextPage, error }.
   */
  list: async (sort = '-updated_date', limit = 24, filters = {}, opts = { page: 1 }) => {
    try {
      // Use offset for pagination with the entity SDK
      const offset = (opts.page - 1) * limit;
      
      const cleanFilters = { ...filters };
      if (filters.status === 'all') {
        delete cleanFilters.status;
      }

      // The SDK's filter method is the correct, reliable way to fetch data.
      const data = await Project.filter(cleanFilters, sort, limit, offset);

      return {
        ok: true,
        data: data || [],
        nextPage: data && data.length === limit ? opts.page + 1 : null,
        error: null,
      };
    } catch (err) {
      console.error("ProjectAPI.list failed:", err);
      return {
        ok: false,
        data: [],
        nextPage: null,
        error: err.message || 'An unknown error occurred while fetching projects.',
      };
    }
  },
};

/**
 * A wrapper around the Speaker entity SDK.
 */
export const SpeakerAPI = {
  /**
   * Lists all speakers from the database, using a cache to improve performance.
   * @returns {Promise<Array>} - An array of speaker objects.
   */
  list: async () => {
    if (CACHE.speakers) {
      return CACHE.speakers;
    }
    try {
      // Fetch all speakers, sorted by model name
      const speakers = await Speaker.list('model');
      CACHE.speakers = speakers || [];
      return CACHE.speakers;
    } catch (err) {
      console.error("SpeakerAPI.list failed:", err);
      return []; // Return empty array on failure
    }
  },
};