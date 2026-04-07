import type { User, Post, Reply } from "./types";

export const SEED_USERS: User[] = [
  { id: "u1", name: "Alex Rivera", handle: "arivera", color: "#1d9bf0" },
  { id: "u2", name: "Sam Chen", handle: "samchen", color: "#7856ff" },
  { id: "u3", name: "Jordan Lee", handle: "jlee", color: "#f91880" },
  { id: "u4", name: "Taylor Kim", handle: "tkim", color: "#ff7a00" },
];

const now = Date.now();
const hours = (n: number) => n * 60 * 60 * 1000;

export const SEED_POSTS: Post[] = [
  {
    id: "p1",
    authorId: "u1",
    content: "Just shipped a new feature using AI-assisted testing. The future is here.",
    createdAt: now - hours(1),
    likes: ["u2", "u3"],
    repostCount: 3,
  },
  {
    id: "p2",
    authorId: "u2",
    content: "Hot take: browser testing shouldn't require writing a single line of test code.",
    createdAt: now - hours(3),
    likes: ["u1", "u3", "u4"],
    repostCount: 12,
  },
  {
    id: "p3",
    authorId: "u3",
    content:
      "Working on a side project this weekend. React + Vite + Tailwind is such a good combo.",
    createdAt: now - hours(5),
    likes: ["u1"],
    repostCount: 1,
  },
  {
    id: "p4",
    authorId: "u4",
    content: "The best code is the code you never have to write. Let your tools do the work.",
    createdAt: now - hours(8),
    likes: ["u2", "u3"],
    repostCount: 5,
  },
  {
    id: "p5",
    authorId: "u1",
    content:
      "Debugging at 2am hits different when you have an agent that can reproduce the bug for you.",
    createdAt: now - hours(12),
    likes: [],
    repostCount: 0,
  },
  {
    id: "p6",
    authorId: "u2",
    content:
      "Just realized I haven't manually opened DevTools in a week. Is this what progress feels like?",
    createdAt: now - hours(24),
    likes: ["u1", "u4"],
    repostCount: 8,
  },
];

export const SEED_REPLIES: Reply[] = [
  {
    id: "r1",
    postId: "p1",
    authorId: "u2",
    content: "Which tool are you using? I've been looking for something like this.",
    createdAt: now - hours(0.5),
  },
  {
    id: "r2",
    postId: "p1",
    authorId: "u3",
    content: "Same here, it's a game changer for catching regressions before they ship.",
    createdAt: now - hours(0.3),
  },
  {
    id: "r3",
    postId: "p2",
    authorId: "u1",
    content: "Agreed. The best tests are the ones that write themselves.",
    createdAt: now - hours(2),
  },
];
