import type { User } from "./types";
import { SEED_USERS } from "./seed";

const STORAGE_KEY = "chirp-store";

interface StoreData {
  users: User[];
  currentUserId: string | undefined;
}

const loadStore = (): StoreData => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    users: SEED_USERS,
    currentUserId: undefined,
  };
};

const saveStore = (data: StoreData) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

let data = loadStore();

const notify = () => {
  saveStore(data);
};

export const store = {
  getUsers: () => data.users,

  login(userId: string) {
    data = { ...data, currentUserId: userId };
    notify();
  },
};
