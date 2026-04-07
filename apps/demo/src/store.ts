import type { User, Post, Reply } from "./types";
import { SEED_USERS, SEED_POSTS, SEED_REPLIES } from "./seed";

const STORAGE_KEY = "chirp-store";

interface StoreData {
  users: User[];
  posts: Post[];
  replies: Reply[];
  currentUserId: string | undefined;
}

const loadStore = (): StoreData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    users: SEED_USERS,
    posts: SEED_POSTS,
    replies: SEED_REPLIES,
    currentUserId: undefined,
  };
};

const saveStore = (data: StoreData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

let data = loadStore();
let listeners: Array<() => void> = [];

const notify = () => {
  saveStore(data);
  listeners.forEach((listener) => listener());
};

export const store = {
  subscribe(listener: () => void) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  },

  getSnapshot: () => data,

  getUsers: () => data.users,
  getUser: (id: string) => data.users.find((u) => u.id === id),
  getUserByHandle: (handle: string) => data.users.find((u) => u.handle === handle),
  getPosts: () => [...data.posts].sort((a, b) => b.createdAt - a.createdAt),
  getPost: (id: string) => data.posts.find((p) => p.id === id),
  getPostsByUser: (userId: string) =>
    data.posts.filter((p) => p.authorId === userId).sort((a, b) => b.createdAt - a.createdAt),
  getReplies: (postId: string) =>
    data.replies.filter((r) => r.postId === postId).sort((a, b) => a.createdAt - b.createdAt),
  getCurrentUser: () =>
    data.currentUserId ? data.users.find((u) => u.id === data.currentUserId) : undefined,

  login(userId: string) {
    data = { ...data, currentUserId: userId };
    notify();
  },

  logout() {
    data = { ...data, currentUserId: undefined };
    notify();
  },

  createPost(content: string) {
    if (!data.currentUserId) return;
    const post: Post = {
      id: `p${Date.now()}`,
      authorId: data.currentUserId,
      content,
      createdAt: Date.now(),
      likes: [],
      repostCount: 0,
    };
    data = { ...data, posts: [post, ...data.posts] };
    notify();
  },

  deletePost(postId: string) {
    data = {
      ...data,
      posts: data.posts.filter((p) => p.id !== postId),
      replies: data.replies.filter((r) => r.postId !== postId),
    };
    notify();
  },

  toggleLike(postId: string) {
    if (!data.currentUserId) return;
    const userId = data.currentUserId;
    data = {
      ...data,
      posts: data.posts.map((p) =>
        p.id === postId
          ? {
              ...p,
              likes: p.likes.includes(userId)
                ? p.likes.filter((id) => id !== userId)
                : [...p.likes, userId],
            }
          : p,
      ),
    };
    notify();
  },

  addReply(postId: string, content: string) {
    if (!data.currentUserId) return;
    const reply: Reply = {
      id: `r${Date.now()}`,
      postId,
      authorId: data.currentUserId,
      content,
      createdAt: Date.now(),
    };
    data = { ...data, replies: [...data.replies, reply] };
    notify();
  },

  reset() {
    data = {
      users: SEED_USERS,
      posts: SEED_POSTS,
      replies: SEED_REPLIES,
      currentUserId: undefined,
    };
    notify();
  },
};
